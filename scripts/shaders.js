/* ============================================================
   shaders.js — all GLSL for the world, as plain strings.

   THREE PASSES.

   1 "height"  — one fragment per map cell, writes that cell's
                 terrain LEVEL into a texture. The noise is
                 therefore evaluated exactly once per cell.
   2 "visible" — resolves the fake perspective: which stacked
                 layer shows at each screen cell. Reads pass 1.
   3 "shade"   — the picture. Reads pass 2 for the terrain and
                 pass 1 for anything standing at a known map
                 position: the plane, its shadow, the trail, the
                 landmarks.

   The split is what makes it cheap. The layer search costs ~30
   lookups per cell and the answer is needed three times per
   pixel to find the contour edges; resolving it once into a
   texture and reading two neighbours back is a third of the work
   of searching three times, and unlike a derivative trick it is
   exact — the neighbour really is the neighbouring cell.
   ============================================================ */
window.NH = window.NH || {};

/* Levels of the terrain staircase. Also the loop bound in the
   layer search, so it has to be a compile-time constant. */
NH.LEVELS = 28;
/* Everything at or below this level is flooded and flat. */
NH.SEA = 9;
/* The height texture holds extra rows BELOW the screen, because
   the layer search looks down by LEVELS * lift cells. How many is
   decided at resize time from the current lift — see world.js. */

/* Shared by every pass: value noise on an integer lattice. */
const NOISE_GLSL = `
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
    vec2 c = floor(p), f = fract(p);
    float a = hash(c);
    float b = hash(c + vec2(1.0, 0.0));
    float d = hash(c + vec2(0.0, 1.0));
    float e = hash(c + vec2(1.0, 1.0));
    vec2 t = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, t.x), mix(d, e, t.x), t.y);
}
`;

NH.VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/* ------------------------------------------------------------
   PASS 1 — the height field.

   Five generators, all landing in 0..1 before quantisation, then
   one shared finish: flood below the sea line, and raise a cone
   under every landmark.

   The cone reaches exactly 1.0 at its centre, so the level at a
   landmark is ALWAYS exactly LEVELS whatever the noise does
   there. That is what lets JavaScript place the floating labels
   without ever recomputing the noise — it already knows the
   answer — and it guarantees every landmark is a mountain you can
   spot from across the map, which is the whole navigation system.
   ------------------------------------------------------------ */
NH.FRAG_HEIGHT = `
precision highp float;

uniform vec2  u_texSize;
uniform vec2  u_cam;      // world cell at the screen's bottom-left
uniform float u_pad;
uniform vec2  u_seed;
uniform float u_scale;    // world cells -> noise space
uniform float u_sea;
uniform int   u_terrain;
uniform vec3  u_m0;       // landmark: xy world position, z >= 0 = live
uniform vec3  u_m1;
uniform vec3  u_m2;
uniform float u_markR;    // radius of a landmark mountain, in cells

const float LEVELS = ${NH.LEVELS}.0;
${NOISE_GLSL}

float fbm(vec2 p) {
    float h = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { h += a * vnoise(p); p *= 2.0; a *= 0.5; }
    return h;
}

/* Ridged multifractal: fold each octave around its midpoint so
   the peaks come to a crease instead of a dome. */
float ridged(vec2 p) {
    float h = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        h += a * (1.0 - abs(2.0 * vnoise(p) - 1.0));
        p *= 2.0; a *= 0.5;
    }
    return h;
}

float terrainAt(vec2 w) {
    vec2 p = w * u_scale + u_seed;

    if (u_terrain == 1) {                    // Ridged — alpine spines
        /* Value noise sits close to 0.5, so 1 - |2n-1| sits close
           to 1 and a ridged sum lands around 0.71 with a much
           tighter spread than plain fbm. Stretching it over fbm's
           window would put the whole map above the snow line. */
        return smoothstep(0.60, 0.94, ridged(p));
    }
    if (u_terrain == 2) {                    // Dunes — domain warped
        /* Feeding fbm its own output as a coordinate offset drags
           the whole field sideways by an amount that itself
           varies, which turns round hills into long combed
           ridges. */
        vec2 q = vec2(fbm(p + 1.7), fbm(p + 9.2));
        return smoothstep(0.26, 0.70, fbm(p + 2.6 * q));
    }
    if (u_terrain == 3) {                    // Archipelago
        /* A second, much slower noise decides where land is
           allowed at all, so the map breaks into island clusters
           with real open water between them. */
        float mask = smoothstep(0.38, 0.66, fbm(p * 0.34 + 77.0));
        return smoothstep(0.28, 0.72, fbm(p)) * mask;
    }
    if (u_terrain == 4) {                    // Plateaus — mesas
        /* Quantise before the level quantisation and the terrain
           gains wide flat tops with sheer sides between them.

           Land each step on the MIDDLE of its band, not its edge:
           a plateau sitting exactly on a level boundary makes
           neighbouring cells flip between two levels and the mesa
           comes out hatched. Keeping a quarter of the original
           slope gives the tops a little texture without bringing
           the ties back. */
        float h = smoothstep(0.26, 0.74, fbm(p));
        float g = h * 8.0, k = floor(g);
        /* Each band is flat for its first two thirds, then ramps
           quickly to the next. The 0.18 offset is what keeps the
           flat tops off a level boundary: land a mesa exactly on
           one and neighbouring cells flip between two levels, and
           the whole plateau comes out hatched. Eight bands at that
           offset put every top on a .13 or .63, safely clear. */
        return (k + 0.18 + 0.82 * smoothstep(0.60, 0.95, fract(g))) / 8.0;
    }
    /* Rolling: raw fbm crowds around the middle, so without the
       stretch almost every cell lands on the same three levels
       and the map is flat porridge. */
    return smoothstep(0.28, 0.72, fbm(p));
}

/* The landmark mountain: 1.0 across a flat summit, easing down to
   0.0 at the rim so it melts into the surrounding terrain instead
   of cutting a step into it.

   PLATEAU is what keeps the summit readable. Without it the cone
   runs all 28 levels down to a point and the contour lines pile
   into a bullseye; with it the top is one clean snow field with
   room for the beacon to stand on.

   m.z carries the marker's glow pulse, which is >= 0 whenever the
   marker exists and -1 when it does not. Test against 0, not
   against the pulse's midpoint, or the mountains blink in and out
   in time with the beacon. */
const float PLATEAU = 0.12;

float cone(vec2 w, vec3 m) {
    if (m.z < 0.0) return 0.0;
    /* Warping the radius with slow noise turns a mathematically
       perfect set of rings into something that reads as a
       mountain. The warp is a multiplier, so the centre is still
       exactly at distance 0 and still exactly at the top level —
       which is what lets the labels be positioned without asking
       the GPU anything.

       Linear, not smoothstep, from there down. A smoothstep slope
       is steepest at its middle, which crushes a third of the 28
       levels into a narrow band and paints it solid with contour
       lines. Linear spaces the terraces evenly all the way down;
       the rim needs no easing because max() against the noise
       already hides it wherever the terrain is higher. */
    float d = length(w - m.xy) / u_markR;
    d *= 0.80 + 0.40 * vnoise(w * 0.013 + u_seed + 21.0);
    return clamp(1.0 - (d - PLATEAU) / (1.0 - PLATEAU), 0.0, 1.0);
}

void main() {
    vec2 cell = floor(gl_FragCoord.xy);
    vec2 w = u_cam + vec2(cell.x, cell.y - u_pad);

    float h = terrainAt(w);
    h = max(h, max(cone(w, u_m0), max(cone(w, u_m1), cone(w, u_m2))));

    float level = max(clamp(floor(h * LEVELS), 0.0, LEVELS), u_sea);

    /* /32 keeps every level on an exact 8-bit step, so the read
       back in the later passes is lossless. */
    gl_FragColor = vec4(level / 32.0, 0.0, 0.0, 1.0);
}
`;

/* ------------------------------------------------------------
   PASS 2 — which layer is visible where.

   FAKE PERSPECTIVE, asked backwards.
   We want layer L drawn L*lift cells higher than the map says,
   so the levels stack like paper cutouts seen from the front.
   A fragment shader cannot move pixels, so instead of "where do
   I go?" every pixel asks "who lands on ME?": layer L would have
   come from L*lift cells below, so look there, and if the terrain
   is at least L high, layer L covers this pixel. Search from the
   top down and the first hit wins, because higher layers are in
   front. Level 0 is everywhere, so the search always terminates.

   u_lift = 0 collapses this to a plain top-down map, which is
   exactly the "Flat" view variant — no second code path needed.
   ------------------------------------------------------------ */
NH.FRAG_VISIBLE = `
precision highp float;

uniform sampler2D u_height;
uniform vec2  u_texSize;
uniform float u_pad;
uniform float u_lift;

const int LEVELS_I = ${NH.LEVELS};

float levelAt(vec2 cell) {
    vec2 uv = (vec2(cell.x, cell.y + u_pad) + 0.5) / u_texSize;
    return floor(texture2D(u_height, uv).r * 32.0 + 0.5);
}

void main() {
    vec2 cell = floor(gl_FragCoord.xy);
    float visible = 0.0;
    for (int L = LEVELS_I; L >= 0; L--) {
        float f = float(L);
        if (levelAt(cell - vec2(0.0, f * u_lift)) >= f) { visible = f; break; }
    }
    gl_FragColor = vec4(visible / 32.0, 0.0, 0.0, 1.0);
}
`;

/* ------------------------------------------------------------
   PASS 3 — the picture.
   ------------------------------------------------------------ */
NH.FRAG_MAIN = `
precision highp float;

uniform sampler2D u_height;
uniform sampler2D u_visible;
uniform vec2  u_texSize;
uniform vec2  u_res;       // screen size in cells
uniform vec2  u_cam;
uniform float u_pad;
uniform float u_lift;      // cells of rise per level
uniform float u_sea;
uniform vec2  u_seed;
uniform float u_time;
uniform int   u_palette;
uniform int   u_inkMode;   // 0 off, 1 every level, 2 index, 3 cliffs only
uniform int   u_light;     // 0 flat, 1 hillshade, 2 rim
uniform int   u_waterStyle;// 0 still, 1 drift, 2 dither
uniform float u_clouds;
uniform float u_fog;

uniform vec3  u_plane;     // world xy + heading in radians
uniform float u_hover;     // levels the plane flies above the ground
uniform float u_planeSize;
uniform int   u_planeKind;
uniform float u_planeOn;
uniform float u_shadowOn;
uniform float u_occlude;

uniform vec3  u_m0;        // landmark xy + glow (z < 0 = off)
uniform vec3  u_m1;
uniform vec3  u_m2;
uniform int   u_markStyle;

uniform vec3  u_trail[10]; // xy world + life 0..1
uniform int   u_trailMode; // 0 off, 1 dots, 2 ribbon

const float LEVELS = ${NH.LEVELS}.0;
${NOISE_GLSL}

/* The flat terrain level at a map cell — for things that stand on
   the ground at a position we already know. */
float levelAt(vec2 cell) {
    vec2 uv = (vec2(cell.x, cell.y + u_pad) + 0.5) / u_texSize;
    return floor(texture2D(u_height, uv).r * 32.0 + 0.5);
}

/* The stacked layer showing at a SCREEN cell, resolved by pass 2.
   Reading one cell off the edge clamps, which is what we want at
   the borders. */
float visibleLayer(vec2 cell) {
    return floor(texture2D(u_visible, (cell + 0.5) / u_res).r * 32.0 + 0.5);
}

/* ---------------- palettes ----------------
   Seven complete looks. u_palette is a uniform, so every fragment
   takes the same branch — the GPU never actually diverges here. */
void paletteRamp(out vec3 wat, out vec3 low, out vec3 fst, out vec3 mid, out vec3 top) {
    if (u_palette == 1) {            // Dusk — the old site purple
        wat = vec3(0.19, 0.15, 0.36); low = vec3(0.45, 0.36, 0.68);
        fst = vec3(0.34, 0.27, 0.56); mid = vec3(0.62, 0.54, 0.82);
        top = vec3(0.93, 0.89, 1.00);
    } else if (u_palette == 2) {     // Sand
        wat = vec3(0.15, 0.40, 0.45); low = vec3(0.80, 0.69, 0.45);
        fst = vec3(0.61, 0.53, 0.31); mid = vec3(0.57, 0.45, 0.34);
        top = vec3(0.96, 0.91, 0.78);
    } else if (u_palette == 3) {     // Mono — ink on paper
        wat = vec3(0.58); low = vec3(0.82); fst = vec3(0.70);
        mid = vec3(0.90); top = vec3(1.00);
    } else if (u_palette == 4) {     // Neon
        wat = vec3(0.02, 0.03, 0.11); low = vec3(0.05, 0.11, 0.22);
        fst = vec3(0.04, 0.17, 0.26); mid = vec3(0.09, 0.14, 0.32);
        top = vec3(0.26, 0.82, 0.94);
    } else if (u_palette == 5) {     // Blueprint
        wat = vec3(0.04, 0.13, 0.26); low = vec3(0.07, 0.22, 0.39);
        fst = vec3(0.06, 0.18, 0.33); mid = vec3(0.10, 0.30, 0.48);
        top = vec3(0.18, 0.43, 0.66);
    } else if (u_palette == 6) {     // Autumn
        wat = vec3(0.18, 0.36, 0.38); low = vec3(0.72, 0.42, 0.16);
        fst = vec3(0.48, 0.24, 0.11); mid = vec3(0.55, 0.43, 0.25);
        top = vec3(0.96, 0.90, 0.78);
    } else {                         // Alpine
        wat = vec3(0.25, 0.42, 0.60); low = vec3(0.33, 0.52, 0.25);
        fst = vec3(0.20, 0.38, 0.18); mid = vec3(0.55, 0.53, 0.50);
        top = vec3(0.87, 0.90, 0.97);
    }
}

vec3 paletteFill(float h, float forest, bool water) {
    vec3 wat, low, fst, mid, top;
    paletteRamp(wat, low, fst, mid, top);
    vec3 c = low;
    if (forest > 0.55) c = fst;      // forest patches
    if (h > 0.55)      c = mid;      // tree line
    if (h > 0.80)      c = top;      // snow line
    if (water)         c = wat;
    /* Without this ramp each material is one flat area and every
       layer inside it becomes invisible. */
    c *= mix(0.78, 1.07, h);
    return c;
}

vec3 inkColor() {
    if (u_palette == 4) return vec3(0.42, 0.95, 1.00);   // neon lines glow
    if (u_palette == 5) return vec3(0.56, 0.83, 1.00);   // blueprint lines
    if (u_palette == 3) return vec3(0.06);
    if (u_palette == 1) return vec3(0.10, 0.07, 0.20);
    if (u_palette == 2) return vec3(0.21, 0.15, 0.10);
    if (u_palette == 6) return vec3(0.16, 0.09, 0.05);
    return vec3(0.05);
}
vec3 accentColor() {
    if (u_palette == 4) return vec3(1.00, 0.24, 0.74);
    if (u_palette == 5) return vec3(1.00, 0.82, 0.40);
    if (u_palette == 3) return vec3(0.14);
    if (u_palette == 2) return vec3(0.86, 0.26, 0.19);
    if (u_palette == 6) return vec3(0.85, 0.20, 0.12);
    return vec3(0.96, 0.76, 0.11);
}
vec3 fogColor() {
    if (u_palette == 4) return vec3(0.02, 0.02, 0.08);
    if (u_palette == 5) return vec3(0.03, 0.09, 0.19);
    if (u_palette == 3) return vec3(0.97);
    if (u_palette == 1) return vec3(0.85, 0.81, 0.95);
    if (u_palette == 2) return vec3(0.94, 0.89, 0.79);
    if (u_palette == 6) return vec3(0.93, 0.86, 0.73);
    return vec3(0.85, 0.90, 0.96);
}
vec3 paperLight() {
    if (u_palette == 4) return vec3(0.92, 1.00, 1.00);
    if (u_palette == 5) return vec3(0.90, 0.96, 1.00);
    return vec3(0.98, 0.97, 0.93);
}
vec3 paperDark() {
    if (u_palette == 4) return vec3(0.45, 0.80, 1.00);
    if (u_palette == 5) return vec3(0.52, 0.72, 0.92);
    return vec3(0.77, 0.75, 0.69);
}

/* ---------------- the paper plane ----------------
   Drawn as maths, not as a sprite: a rotating pixel sprite has to
   be redrawn for every angle, but a shape made of half-planes
   turns to any angle for free and still lands on whole cells, so
   it keeps the pixel look. Signed distance is negative inside. */
vec2 turn(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
float edgeD(vec2 p, vec2 a, vec2 b) {
    vec2 d = b - a;
    return dot(p - a, normalize(vec2(d.y, -d.x)));
}
float triD(vec2 p, vec2 a, vec2 b, vec2 c) {
    return max(max(edgeD(p, a, b), edgeD(p, b, c)), edgeD(p, c, a));
}

/* The two wings meet along a line where both half-plane distances
   are exactly zero, so a strict "< 0" test drops that line and the
   terrain shows through as a seam down the middle of the plane —
   reliably, because the camera snaps to whole cells and lines the
   fold up with a row of them. A hair of slack closes it. */
const float EPS = 0.0005;

/* Distance to a line SEGMENT, which is what an outline needs.
   triD is a max of half-planes: exact inside the shape, but wildly
   short of the truth just past a sharp corner — using it for the
   outline shoots black spikes off the nose and the wingtips. */
float segD(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

/* The shape of the plane, nose along +x, in units of u_planeSize.
   The out params: "inside" is negative within the silhouette,
   "edge" is the exact distance to its outline, and "wing" says
   which of the two folds this pixel belongs to — that split is
   what draws the crease down the middle for free. */
void planeShape(vec2 q, out float inside, out float edge, out float wing) {
    wing = 0.0;
    if (u_planeKind == 5) {                 // Blocky — the old red walker
        vec2 e = abs(q) - vec2(0.78, 0.78);
        inside = min(max(e.x, e.y), 0.0) + length(max(e, 0.0));
        edge = abs(inside);
        return;
    }
    vec2 A, B, C, D;
    if (u_planeKind == 1) {                 // Glider — long wings
        A = vec2(1.00, 0.0); B = vec2(-0.55, 0.95);
        C = vec2(-0.15, 0.0); D = vec2(-0.55, -0.95);
    } else if (u_planeKind == 2) {          // Delta — short and blunt
        A = vec2(1.12, 0.0); B = vec2(-0.55, 0.62);
        C = vec2(-0.92, 0.0); D = vec2(-0.55, -0.62);
    } else if (u_planeKind == 3) {          // Wing — all span, no body
        A = vec2(0.72, 0.0); B = vec2(-0.30, 1.10);
        C = vec2(-0.02, 0.0); D = vec2(-0.30, -1.10);
    } else if (u_planeKind == 4) {          // Arrow — a bare chevron
        A = vec2(1.20, 0.0); B = vec2(-0.40, 0.88);
        C = vec2(0.20, 0.0); D = vec2(-0.40, -0.88);
    } else {                                // Dart — the classic fold
        A = vec2(1.05, 0.0); B = vec2(-0.75, 0.62);
        C = vec2(-0.30, 0.0); D = vec2(-0.75, -0.62);
    }
    float d1 = triD(q, A, B, C);
    float d2 = triD(q, A, C, D);
    wing = d1 <= d2 ? 0.0 : 1.0;
    inside = min(d1, d2);
    /* A -> B -> C -> D -> A traces the whole silhouette; C is the
       notch between the wings, so the outline follows it inwards. */
    edge = min(min(segD(q, A, B), segD(q, B, C)), min(segD(q, C, D), segD(q, D, A)));
}

/* ---------------- landmarks ----------------
   A landmark always sits on a cone that reaches level LEVELS, so
   its drawn height is known without looking anything up. */
bool markPixel(vec3 m, vec2 cell, float me, vec3 under, out vec3 col) {
    col = under;
    if (m.z < 0.0) return false;

    vec2 ms = m.xy - u_cam;
    if (ms.x < -80.0 || ms.x > u_res.x + 80.0) return false;
    if (ms.y < -80.0 || ms.y > u_res.y + 40.0) return false;

    /* Undo the lift to find which map row this pixel's terrain came
       from. A smaller row is nearer the camera and wins. */
    float srcY = cell.y + u_cam.y - me * u_lift;
    if (srcY < m.y - 1.0) return false;

    vec2 d = cell - (ms + vec2(0.0, LEVELS * u_lift));
    float glow = m.z;
    vec3 hot = mix(accentColor(), vec3(1.0), 0.35 * glow);

    if (u_markStyle == 1) {                       // Beacon
        /* Lamp on a slim mast, with a halo that swells and fades.
           The halo is blended, not painted over, so it reads as
           light on the snow rather than as a solid ring. */
        if (abs(d.x) < 2.2 && d.y >= 13.0 && d.y < 18.0) { col = hot; return true; }
        if (abs(d.x) < 3.4 && d.y >= 15.0 && d.y < 16.5) { col = hot; return true; }
        if (abs(d.x) < 1.0 && d.y >= 0.0 && d.y < 14.0) { col = inkColor(); return true; }
        if (abs(d.x) < 2.6 && d.y >= 0.0 && d.y < 1.6) { col = inkColor(); return true; }
        float ring = 4.0 + 15.0 * glow;
        if (abs(length(vec2(d.x, (d.y - 15.5) * 1.9)) - ring) < 1.0) {
            col = mix(under, hot, 0.62 * (1.0 - glow));
            return true;
        }
    } else if (u_markStyle == 2) {                // Monolith
        if (abs(d.x) < 3.6 && d.y >= 0.0 && d.y < 16.0) {
            bool rim = abs(d.x) > 2.6 || d.y > 14.6 || d.y < 1.0;
            bool slit = abs(d.x) < 0.9 && d.y >= 4.0 && d.y < 13.0;
            col = slit ? mix(hot, vec3(1.0), 0.45 * glow)
                       : (rim ? inkColor() : mix(inkColor(), vec3(0.62), 0.6));
            return true;
        }
    } else if (u_markStyle == 3) {                // Ring — a floating torus
        float r = length(vec2(d.x, (d.y - 15.0) * 1.35));
        if (r > 6.0 && r < 8.6) {
            col = mix(hot, vec3(1.0), 0.30 * glow); return true;
        }
        if (abs(d.x) < 0.7 && d.y >= 0.0 && d.y < 9.0) { col = inkColor(); return true; }
    } else if (u_markStyle == 4) {                // Cairn — a stack of stones
        float w = 4.2 - d.y * 0.30;
        if (d.y >= 0.0 && d.y < 13.0 && abs(d.x) < w) {
            /* Horizontal seams every third cell read as stones. */
            bool seam = mod(d.y, 3.0) < 1.0;
            col = seam ? inkColor() : mix(inkColor(), vec3(0.68), 0.7);
            return true;
        }
        if (d.y >= 13.0 && d.y < 15.5 && abs(d.x) < 1.6) { col = hot; return true; }
    } else {                                      // Flag
        if (abs(d.x) < 0.6 && d.y >= 0.0 && d.y < 15.0) { col = inkColor(); return true; }
        /* A two-step edge is enough to read as cloth in the wind. */
        float wave = d.y > 12.0 ? 6.5 : 5.0;
        if (d.x >= 0.6 && d.x < wave && d.y >= 9.5 && d.y < 15.0) { col = hot; return true; }
    }
    return false;
}

void main() {
    vec2 cell = floor(gl_FragCoord.xy);

    float me = visibleLayer(cell);
    float lft = visibleLayer(cell - vec2(1.0, 0.0));
    float bel = visibleLayer(cell - vec2(0.0, 1.0));

    /* ---- contour ink ----
       Lines run along the VISIBLE layer, not the flat map, so the
       ink follows the stacked cutouts and the line under a stack
       reads as its cliff edge. */
    float line = 0.0;
    if (u_inkMode == 1) {
        line = (me != lft || me != bel) ? 1.0 : 0.0;
    } else if (u_inkMode == 2) {
        /* Index contours, the way a paper topo map does it: every
           fifth level full strength, the rest held back, so the
           eye can count height without counting every line. */
        if (me != lft || me != bel) {
            float hi = max(me, max(lft, bel));
            line = mod(hi, 5.0) < 0.5 ? 1.0 : 0.34;
        }
    } else if (u_inkMode == 3) {
        /* Cliffs only: ignore gentle terraces and outline the
           places where the stack actually steps. */
        line = (abs(me - lft) >= 3.0 || abs(me - bel) >= 3.0) ? 1.0 : 0.0;
    }

    vec2  src   = cell + u_cam - vec2(0.0, me * u_lift);   // map row it came from
    vec2  srcC  = cell - vec2(0.0, me * u_lift);           // ...in screen cells
    float h     = me / LEVELS;
    bool  water = me <= u_sea + 0.5;
    /* Second, unrelated slice of the same noise field decides
       where forest grows. Sampled in map space so it stays glued
       to the terrain while the camera moves. */
    float forest = vnoise(src * 0.045 + u_seed + 50.0);

    vec3 fill = paletteFill(h, forest, water);

    if (water && u_waterStyle == 1) {
        /* Flooded valleys are clamped flat, so they carry no
           contour lines at all and read as dead space. A slow
           drift of light streaks — sampled much wider than tall,
           so it comes out as horizontal wash rather than blobs —
           gives the water something to do without competing with
           the ink. */
        float ripple = vnoise(vec2(src.x * 0.055, src.y * 0.34) + vec2(u_time * 0.5, 0.0));
        fill = mix(fill, fill * 1.09, step(0.63, ripple));
    } else if (water && u_waterStyle == 2) {
        /* A fixed two-tone lattice instead: no motion, reads as
           an old printed sea chart. */
        fill = mix(fill, fill * 1.13, mod(floor(src.x * 0.5) + floor(src.y * 0.5), 2.0));
    }

    /* ---- relief shading ----
       Sampled two cells apart on the FLAT height field, not one
       cell apart on the visible layer: a one-cell difference of an
       integer level field is almost always 0 or 1, which comes out
       blotchy, and the visible layer carries the stacking jumps
       that would read as light on a cliff that is not there. */
    if (u_light == 1) {
        vec2 g = vec2(levelAt(srcC + vec2(2.0, 0.0)) - levelAt(srcC - vec2(2.0, 0.0)),
                      levelAt(srcC + vec2(0.0, 2.0)) - levelAt(srcC - vec2(0.0, 2.0))) / 4.0;
        /* Light from the north west. A slope that rises to the east
           presents its face to the west, so it catches the light. */
        float lambert = clamp(0.5 + 1.15 * (0.707 * g.x - 0.707 * g.y), 0.0, 1.0);
        fill *= mix(0.70, 1.26, lambert);
    } else if (u_light == 2) {
        /* Rim: a bright band just inside every west-facing riser,
           set two cells back so it sits beside the contour line
           rather than under it. */
        if (me > visibleLayer(cell - vec2(2.0, 0.0))) fill = mix(fill, vec3(1.0), 0.22);
        if (me < visibleLayer(cell + vec2(2.0, 0.0))) fill *= 0.86;
    }

    if (u_clouds > 0.5) {
        /* Cloud shadows drift across the map. Quantised into four
           steps so they stay pixel art rather than turning into an
           airbrushed gradient. */
        float cl = vnoise(src * 0.0075 + vec2(u_time * 0.013, u_time * 0.005) + 130.0);
        fill *= mix(1.0, 0.79, floor(smoothstep(0.55, 0.72, cl) * 3.0) / 3.0);
    }

    vec3 color = mix(fill, inkColor(), line);

    if (u_fog > 0.5) {
        color = mix(color, fogColor(), smoothstep(0.30, 1.0, cell.y / u_res.y) * 0.55);
    }

    vec3 mc;
    if (markPixel(u_m0, cell, me, color, mc)) color = mc;
    if (markPixel(u_m1, cell, me, color, mc)) color = mc;
    if (markPixel(u_m2, cell, me, color, mc)) color = mc;

    /* ---- the plane, its shadow and its vapour trail ----
       Ground position lifted by the terrain gives the shadow;
       lifted by terrain + hover gives the plane. The gap between
       them is what reads as altitude, and it shrinks by itself
       when the plane crosses a peak. */
    vec2  ps    = u_plane.xy - u_cam;
    float pl    = levelAt(ps);
    vec2  pFoot = ps + vec2(0.0, pl * u_lift);
    vec2  pBody = ps + vec2(0.0, (pl + u_hover) * u_lift);
    float wing;

    if (u_trailMode > 0) {
        for (int i = 0; i < 10; i++) {
            vec3 t = u_trail[i];
            if (t.z <= 0.0) continue;
            vec2 tp = (t.xy - u_cam) + vec2(0.0, (levelAt(t.xy - u_cam) + u_hover) * u_lift);
            if (u_trailMode == 1) {
                if (distance(cell + 0.5, tp) < 0.4 + 1.3 * t.z) {
                    color = mix(color, paperLight(), 0.30 * t.z);
                }
            } else if (i < 9) {
                /* Ribbon: join each point to the next one instead
                   of drawing them as beads. */
                vec3 n = u_trail[i + 1];
                if (n.z > 0.0) {
                    vec2 np = (n.xy - u_cam) + vec2(0.0, (levelAt(n.xy - u_cam) + u_hover) * u_lift);
                    if (segD(cell + 0.5, tp, np) < 0.4 + 1.1 * t.z) {
                        color = mix(color, paperLight(), 0.34 * t.z);
                    }
                }
            }
        }
    }

    if (u_shadowOn > 0.5) {
        vec2 q = turn(cell - pFoot, -u_plane.z);
        q.y *= 2.3;                                  // squashed onto the ground
        float sIn, sEdge;
        planeShape(q / u_planeSize, sIn, sEdge, wing);
        if (sIn < EPS) color *= 0.60;
    }

    if (u_planeOn > 0.5) {
        bool hidden = false;
        if (u_occlude > 0.5) {
            hidden = (cell.y + u_cam.y - me * u_lift) < u_plane.y - 1.0;
        }
        if (!hidden) {
            vec2 q = turn(cell - pBody, -u_plane.z) / u_planeSize;
            float pIn, pEdge;
            planeShape(q, pIn, pEdge, wing);
            if (pIn < EPS) {
                /* Blocky keeps the old walker's red, so switching
                   to it is unmistakable. */
                color = u_planeKind == 5 ? vec3(0.85, 0.16, 0.10)
                                         : (wing < 0.5 ? paperLight() : paperDark());
            } else if (pEdge < 0.17) {
                color = inkColor();
            }
        }
    }

    gl_FragColor = vec4(color, 1.0);
}
`;
