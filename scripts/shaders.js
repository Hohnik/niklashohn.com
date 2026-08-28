/* ============================================================
   shaders.js — all GLSL for the world, as plain strings.

   TWO PASSES.

   Pass 1 "height": one fragment per map cell, writes the terrain
   LEVEL of that cell into the red channel of an offscreen texture.
   The noise is therefore evaluated exactly once per cell.

   Pass 2 "main": the picture. It never touches the noise again —
   it only reads the height texture. That matters, because the
   fake-perspective trick below has to look up the terrain ~30
   times per pixel to answer "which layer lands on me?". Thirty
   texture fetches are cheap. Thirty fbm() calls are not.
   ============================================================ */
window.NH = window.NH || {};

/* Levels of the terrain staircase. Also the loop bound in the
   layer search, so it has to be a compile-time constant. */
NH.LEVELS = 28;
/* Everything at or below this level is flooded and flat. */
NH.WATER = 9;
/* The height texture holds extra rows BELOW the screen, because
   the layer search looks down by LEVELS * lift cells. How many is
   decided at resize time from the current lift — see world.js. */

/* Shared by both passes: value noise on an integer lattice. */
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

   Two things are stacked into one number:

   1. fbm noise, stretched with smoothstep. Raw fbm crowds around
      0.47, so without the stretch almost every cell would land on
      the same three levels and the map would be flat porridge.

   2. A cone under every landmark, combined with max(). Because
      the cone reaches exactly 1.0 at its centre, the level at a
      landmark is ALWAYS exactly LEVELS — no matter what the noise
      does there. That is what lets JavaScript place the floating
      labels without ever recomputing the noise: it already knows
      the answer. It also guarantees every landmark is a mountain
      you can spot from across the map, which is the whole
      navigation system.
   ------------------------------------------------------------ */
NH.FRAG_HEIGHT = `
precision highp float;

uniform vec2  u_texSize;
uniform vec2  u_cam;      // world cell at the screen's bottom-left
uniform float u_pad;
uniform vec2  u_seed;
uniform float u_scale;    // world cells -> noise space
uniform float u_water;
uniform vec3  u_m0;       // landmark: xy world position, z = enabled
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
       the GPU anything. */
    float d = length(w - m.xy) / u_markR;
    d *= 0.80 + 0.40 * vnoise(w * 0.013 + u_seed + 21.0);
    /* Linear, not smoothstep. A smoothstep slope is steepest at
       its middle, which crushes a third of the 28 levels into a
       narrow band and paints it solid with contour lines. Linear
       spaces the terraces evenly all the way down; the rim needs
       no easing because max() against the noise already hides it
       wherever the surrounding terrain is higher. */
    return clamp(1.0 - (d - PLATEAU) / (1.0 - PLATEAU), 0.0, 1.0);
}

void main() {
    vec2 cell = floor(gl_FragCoord.xy);
    vec2 w = u_cam + vec2(cell.x, cell.y - u_pad);

    float h = smoothstep(0.28, 0.72, fbm(w * u_scale + u_seed));
    h = max(h, max(cone(w, u_m0), max(cone(w, u_m1), cone(w, u_m2))));

    float level = max(clamp(floor(h * LEVELS), 0.0, LEVELS), u_water);

    /* /32 keeps every level on an exact 8-bit step, so the read
       back in pass 2 is lossless. */
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

   This is its own pass because the answer is needed three times
   per pixel — here, one cell left, one cell down — to find the
   contour edges. Resolving it once per cell and reading the two
   neighbours back out of a texture costs a third of what running
   the search three times does, and unlike the derivative trick it
   is exact: the neighbour really is the neighbouring cell.
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

   Reads the layer map from pass 2 for the terrain, and the height
   map from pass 1 for anything that has to sit ON the terrain at
   a known map position: the plane, its shadow, the trail, the
   landmarks.
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
uniform float u_water;
uniform vec2  u_seed;
uniform float u_ink;
uniform int   u_palette;
uniform float u_fog;
uniform float u_waves;
uniform float u_time;      // seconds, for the water drift

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
uniform float u_trailOn;

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
   Five complete looks. u_palette is a uniform, so every fragment
   takes the same branch — the GPU never actually diverges here. */
vec3 paletteFill(float h, float forest, bool water) {
    vec3 wat, low, fst, mid, top;
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
    } else {                         // Alpine
        wat = vec3(0.25, 0.42, 0.60); low = vec3(0.33, 0.52, 0.25);
        fst = vec3(0.20, 0.38, 0.18); mid = vec3(0.55, 0.53, 0.50);
        top = vec3(0.87, 0.90, 0.97);
    }
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
    if (u_palette == 3) return vec3(0.06);
    if (u_palette == 1) return vec3(0.10, 0.07, 0.20);
    if (u_palette == 2) return vec3(0.21, 0.15, 0.10);
    return vec3(0.05);
}
vec3 accentColor() {
    if (u_palette == 4) return vec3(1.00, 0.24, 0.74);
    if (u_palette == 3) return vec3(0.14);
    if (u_palette == 2) return vec3(0.86, 0.26, 0.19);
    return vec3(0.96, 0.76, 0.11);
}
vec3 fogColor() {
    if (u_palette == 4) return vec3(0.02, 0.02, 0.08);
    if (u_palette == 3) return vec3(0.97);
    if (u_palette == 1) return vec3(0.85, 0.81, 0.95);
    if (u_palette == 2) return vec3(0.94, 0.89, 0.79);
    return vec3(0.85, 0.90, 0.96);
}
vec3 paperLight() { return u_palette == 4 ? vec3(0.92, 1.00, 1.00) : vec3(0.98, 0.97, 0.93); }
vec3 paperDark()  { return u_palette == 4 ? vec3(0.45, 0.80, 1.00) : vec3(0.77, 0.75, 0.69); }

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

/* Distance to a line SEGMENT, which is what an outline needs.
   triD is a max of half-planes: exact inside the shape, but wildly
   short of the truth just past a sharp corner — using it for the
   outline shoots black spikes off the nose and the wingtips. */
/* The two wings meet along a line where both half-plane distances
   are exactly zero, so a strict "< 0" test drops that line and the
   terrain shows through as a seam down the middle of the plane —
   reliably, because the camera snaps to whole cells and lines the
   fold up with a row of them. A hair of slack closes it. */
const float EPS = 0.0005;

float segD(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

/* The shape of the plane, nose along +x, in units of u_planeSize.
   The out params: "inside" is negative within the silhouette,
   "edge" is the exact distance to its outline, and "wing" says
   which of the two folds
   this pixel belongs to — that split is what draws the crease
   down the middle for free. */
void planeShape(vec2 q, out float inside, out float edge, out float wing) {
    wing = 0.0;
    if (u_planeKind == 3) {                 // Blocky — the old red walker
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

    /* Contours run along the VISIBLE layer, not the flat map, so
       the ink follows the stacked cutouts and the line under a
       stack reads as its cliff edge. */
    float line = 0.0;
    if (u_ink > 0.5) {
        float l = visibleLayer(cell - vec2(1.0, 0.0));
        float b = visibleLayer(cell - vec2(0.0, 1.0));
        line = (me != l || me != b) ? 1.0 : 0.0;
    }

    vec2  src   = cell + u_cam - vec2(0.0, me * u_lift);   // map row it came from
    float h     = me / LEVELS;
    bool  water = me <= u_water + 0.5;
    /* Second, unrelated slice of the same noise field decides
       where forest grows. Sampled in map space so it stays glued
       to the terrain while the camera moves. */
    float forest = vnoise(src * 0.045 + u_seed + 50.0);

    vec3 fill = paletteFill(h, forest, water);
    if (water && u_waves > 0.5) {
        /* Flooded valleys are clamped flat, so they carry no
           contour lines at all and read as dead space. A slow
           drift of light streaks — sampled much wider than tall,
           so it comes out as horizontal wash rather than blobs —
           gives the water something to do without competing with
           the ink. */
        float ripple = vnoise(vec2(src.x * 0.055, src.y * 0.34) + vec2(u_time * 0.5, 0.0));
        fill = mix(fill, fill * 1.09, step(0.63, ripple));
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

    if (u_trailOn > 0.5) {
        for (int i = 0; i < 10; i++) {
            vec3 t = u_trail[i];
            if (t.z <= 0.0) continue;
            vec2 tp = (t.xy - u_cam) + vec2(0.0, (levelAt(t.xy - u_cam) + u_hover) * u_lift);
            if (distance(cell + 0.5, tp) < 0.4 + 1.3 * t.z) {
                color = mix(color, paperLight(), 0.30 * t.z);
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
                color = u_planeKind == 3 ? vec3(0.85, 0.16, 0.10)
                                         : (wing < 0.5 ? paperLight() : paperDark());
            } else if (pEdge < 0.17) {
                color = inkColor();
            }
        }
    }

    gl_FragColor = vec4(color, 1.0);
}
`;
