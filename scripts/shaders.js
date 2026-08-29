/* shaders.js — all the GLSL for the world, as plain strings.

   There are three passes.

   Pass 1, height. It draws one fragment for each map cell. It
   writes the terrain level of that cell into a texture. Thus the
   shader calculates the noise one time for each cell.

   Pass 2, visible. It finds the false perspective. For each
   screen cell it finds the layer that you see. It reads pass 1.

   Pass 3, shade. It draws the picture. It reads pass 2 for the
   terrain. It reads pass 1 for each item at a known map position:
   the plane, its shadow, the trail and the beacons.

   The three passes make the frame cheap. The layer search needs
   about 30 texture reads for each cell. Pass 3 needs that answer
   three times for each pixel, because it must also look at two
   neighbour cells to find the contour edges.

   One search for each cell, plus two texture reads, costs one
   third of three searches. It is also exact. A trick with the
   derivative functions is not exact. */
window.NH = window.NH || {};

/* The number of levels in the terrain. The layer search also uses
   this number as its loop limit. So it must be a constant that
   the compiler knows. */
NH.LEVELS = 28;
/* Water covers each level at or below this one. Water is flat. */
NH.SEA = 9;
/* The height texture holds more rows below the screen. The layer
   search looks down by LEVELS * lift cells. The resize step in
   world.js sets the number of rows from the current lift. */

/* All three passes use this value noise on a whole-number
   lattice. */
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

/* PASS 1 — the height field.

   Five generators give a value from 0.0 to 1.0. Then two steps
   are the same for all five. Water covers the levels below the
   sea line. A cone lifts the terrain below each beacon.

   The cone reaches exactly 1.0 at its centre. So the level at a
   beacon is always exactly LEVELS, whatever the noise gives
   there.

   That fact has two results. JavaScript knows the height of each
   summit, so it can put the labels there. It does not calculate
   the noise again. And each beacon always has a mountain that you
   see from a distance, which is how a person finds it. */
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

/* A ridged multifractal. Fold each octave at its middle value.
   The peaks then come to a sharp line, and not to a dome. */
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
        /* Value noise stays close to 0.5. Thus 1 - |2n-1| stays
           close to 1.0, and a ridged sum is about 0.71. The
           spread is much smaller than the spread of plain fbm.

           The window of fbm is therefore wrong here. It would put
           the whole map above the snow line. */
        return smoothstep(0.60, 0.94, ridged(p));
    }
    if (u_terrain == 2) {                    // Dunes — domain warped
        /* Give fbm its own output as a coordinate offset. The
           field then moves sideways, and the distance changes
           from place to place. Round hills become long ridges. */
        vec2 q = vec2(fbm(p + 1.7), fbm(p + 9.2));
        return smoothstep(0.26, 0.70, fbm(p + 2.6 * q));
    }
    if (u_terrain == 3) {                    // Archipelago
        /* A second, much slower noise selects where land can be.
           The map then breaks into groups of islands with open
           water between them. */
        float mask = smoothstep(0.38, 0.66, fbm(p * 0.34 + 77.0));
        return smoothstep(0.28, 0.72, fbm(p)) * mask;
    }
    if (u_terrain == 4) {                    // Plateaus — mesas
        /* Cut the height into bands before the shader cuts it
           into levels. The terrain then has wide flat tops with
           steep sides between them. */
        float h = smoothstep(0.26, 0.74, fbm(p));
        float g = h * 8.0, k = floor(g);
        /* Each band is flat for its first two thirds. Then it
           rises quickly to the next band.

           The offset of 0.18 keeps each flat top away from a
           level boundary. A flat top exactly on a boundary makes
           neighbour cells move between two levels. The plateau
           then shows a pattern of lines.

           Eight bands at this offset put each top at .13 or .63
           of a level. That distance is safe. */
        return (k + 0.18 + 0.82 * smoothstep(0.60, 0.95, fract(g))) / 8.0;
    }
    /* Rolling. Plain fbm gives values close to the middle. The
       stretch is necessary. Without it, almost every cell gets
       one of the same three levels, and the map is flat. */
    return smoothstep(0.28, 0.72, fbm(p));
}

/* The mountain below a beacon. The value is 1.0 across a flat
   summit. It then falls to 0.0 at the rim, so the mountain joins
   the terrain around it. It does not cut a step into it.

   PLATEAU keeps the summit clear. Without it, the cone falls
   through all 28 levels to a point, and the contour lines make a
   target pattern. With it, the top is one clean snow field, and
   the beacon has a place to stand.

   The z part of m holds the pulse of the marker. The value is 0
   or more when the marker exists. It is -1 when it does not.
   Test against 0, and not against the middle of the pulse. If you
   test against the middle, the mountains appear and go away with
   the pulse. */
const float PLATEAU = 0.12;

float cone(vec2 w, vec3 m) {
    if (m.z < 0.0) return 0.0;
    /* Slow noise changes the radius. A set of exact circles
       then becomes a shape that looks like a mountain. The noise
       is a multiplier, so the centre stays at distance 0 and at
       the top level. Thus JavaScript can still put the labels on
       the summit without a question to the GPU.

       Below the summit the fall is linear, and not a smoothstep.
       A smoothstep is steepest at its middle. It would put a
       third of the 28 levels into a narrow band, and the contour
       lines there would make a solid area.

       A linear fall gives terraces of the same width. The rim
       needs no curve, because max() against the noise already
       hides the rim where the terrain is higher. */
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

    /* A second part of the same noise field selects where
       forest grows. Pass 1 writes it here, and pass 3 does not
       calculate it again. The mask depends only on the world
       position.

       This costs four sine calls one time for each cell. While
       the camera holds still it costs nothing. In pass 3 it would
       cost four sine calls for each pixel of each frame.

       The red channel holds the level. The value is on an exact
       8-bit step, so the later passes read it with no loss. The
       green channel holds the forest mask. Eight bits are enough
       for a threshold test. */
    float forest = vnoise(w * 0.045 + u_seed + 50.0);
    gl_FragColor = vec4(level / 32.0, forest, 0.0, 1.0);
}
`;

/* PASS 2 — the layer that you see at each screen cell.

   This pass makes the false perspective. The site must draw layer
   L at L * lift cells higher than the map says. The levels then
   stack like cut paper that you look at from the front.

   A fragment shader can give itself a colour. It cannot move
   itself. So each pixel asks a different question: which layer
   lands on me?

   Layer L comes from L * lift cells below. Look there. If the
   terrain is L high or higher, layer L covers this pixel. Start
   at the top and go down. The first hit wins, because a higher
   layer is in front. Level 0 is everywhere, so the search always
   stops.

   A lift of 0 gives a plain map from above. That is the Flat view
   option. It needs no second block of code. */
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

/* PASS 3 — the picture. */
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
uniform vec2  u_planeRot;  // cos and sin of the heading, from the CPU
uniform float u_bankScale; // 1 / cos(roll), from the CPU
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

vec2 heightUV(vec2 cell) {
    return (vec2(cell.x, cell.y + u_pad) + 0.5) / u_texSize;
}

/* The flat terrain level at a map cell. Use it for each item
   that stands on the ground at a known position. */
float levelAt(vec2 cell) {
    return floor(texture2D(u_height, heightUV(cell)).r * 32.0 + 0.5);
}

/* The layer that you see at a screen cell. Pass 2 found it. A
   read one cell past the edge gives the edge value, which is
   correct at the borders. */
float visibleLayer(vec2 cell) {
    return floor(texture2D(u_visible, (cell + 0.5) / u_res).r * 32.0 + 0.5);
}

/* ---------------- palettes ----------------
   Seven complete looks. The value u_palette is a uniform. So each
   fragment takes the same branch, and the GPU does not divide the
   work here. */
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
    /* This ramp is necessary. Without it each material is one
       flat area, and you cannot see the layers in it. */
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
   The shader draws the plane from mathematics, and not from a
   sprite. A pixel sprite needs a new image for each angle. A
   shape from half-planes turns to any angle at no cost. It also
   lands on whole cells, so it keeps the pixel look.

   The signed distance is negative inside the shape. */
/* Turn a point into the frame of the plane. The angle is the
   same for each pixel. So the cosine and the sine come in as a
   uniform. The CPU calls two functions one time. The GPU then
   calls none for each pixel that the plane can touch. */
vec2 turn(vec2 p) {
    return vec2(u_planeRot.x * p.x + u_planeRot.y * p.y,
                -u_planeRot.y * p.x + u_planeRot.x * p.y);
}
float edgeD(vec2 p, vec2 a, vec2 b) {
    vec2 d = b - a;
    return dot(p - a, normalize(vec2(d.y, -d.x)));
}
float triD(vec2 p, vec2 a, vec2 b, vec2 c) {
    return max(max(edgeD(p, a, b), edgeD(p, b, c)), edgeD(p, c, a));
}

/* The two wings meet along a line. On that line both half-plane
   distances are exactly zero. A test of "< 0" thus drops the
   line, and the terrain shows through the middle of the plane.

   This occurs often, because the camera moves in whole cells and
   puts the fold on a row of them. A small value closes the
   line. */
const float EPS = 0.0005;

/* The distance to a line segment. An outline needs this.

   The function triD gives the largest of the half-plane
   distances. That value is exact inside the shape. Just past a
   sharp corner it is much too small. An outline from triD thus
   sends black spikes off the nose and the wing tips. */
float segD(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

/* The shape of the plane. The nose points along +x. The units
   are u_planeSize.

   The three out values are: "inside", which is negative in the
   shape; "edge", which is the exact distance to the outline; and
   "wing", which tells you the fold that holds this pixel. The
   two folds get different colours, which draws the centre line at
   no cost. */
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
    /* The path A, B, C, D, A goes round the whole shape. The
       point C is the notch between the wings, so the outline goes
       in to it. */
    edge = min(min(segD(q, A, B), segD(q, B, C)), min(segD(q, C, D), segD(q, D, A)));
}

/* ---------------- beacons ----------------
   A beacon always stands on a cone that reaches the top level.
   Thus the shader knows its drawn height and reads nothing. */
/* Do not add a box test on d here to leave this function early.
   We tried that, and it made the frame 3 percent slower. The
   tests below are cheap selects on a uniform branch, and one more
   return costs more than they do. */
bool markPixel(vec3 m, vec2 cell, float me, vec3 under, out vec3 col) {
    col = under;
    if (m.z < 0.0) return false;

    vec2 ms = m.xy - u_cam;
    if (ms.x < -80.0 || ms.x > u_res.x + 80.0) return false;
    if (ms.y < -80.0 || ms.y > u_res.y + 40.0) return false;

    /* Remove the lift to find the map row of the terrain at
       this pixel. A smaller row is nearer to the camera, and the
       nearer row wins. */
    float srcY = cell.y + u_cam.y - me * u_lift;
    if (srcY < m.y - 1.0) return false;

    vec2 d = cell - (ms + vec2(0.0, LEVELS * u_lift));
    float glow = m.z;
    vec3 hot = mix(accentColor(), vec3(1.0), 0.35 * glow);

    if (u_markStyle == 1) {                       // Beacon
        /* A lamp on a thin mast, with a halo that grows and
           then goes away. The shader mixes the halo with the
           colour below it. Thus the halo looks like light on the
           snow, and not like a solid ring. */
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
            /* A line at each third cell. The block then looks like a
               pile of stones. */
            bool seam = mod(d.y, 3.0) < 1.0;
            col = seam ? inkColor() : mix(inkColor(), vec3(0.68), 0.7);
            return true;
        }
        if (d.y >= 13.0 && d.y < 15.5 && abs(d.x) < 1.6) { col = hot; return true; }
    } else {                                      // Flag
        if (abs(d.x) < 0.6 && d.y >= 0.0 && d.y < 15.0) { col = inkColor(); return true; }
        /* An edge with two steps is enough. The flag then looks
           like cloth in the wind. */
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
       The lines follow the layer that you see, and not the flat
       map. Thus the ink goes round the stack of cut paper. The
       line below a stack becomes the edge of its cliff. */
    float line = 0.0;
    if (u_inkMode == 1) {
        line = (me != lft || me != bel) ? 1.0 : 0.0;
    } else if (u_inkMode == 2) {
        /* Index contours, as on a paper map. Each fifth level
           gets a full line. The other levels get a weak line. You
           can then count the height without a count of every
           line. */
        if (me != lft || me != bel) {
            float hi = max(me, max(lft, bel));
            line = mod(hi, 5.0) < 0.5 ? 1.0 : 0.34;
        }
    } else if (u_inkMode == 3) {
        /* Cliffs only. Do not draw a line at a small step. Draw
           a line only where the stack makes a large step. */
        line = (abs(me - lft) >= 3.0 || abs(me - bel) >= 3.0) ? 1.0 : 0.0;
    }

    vec2  src   = cell + u_cam - vec2(0.0, me * u_lift);   // map row it came from
    vec2  srcC  = cell - vec2(0.0, me * u_lift);           // ...in screen cells
    float h     = me / LEVELS;
    bool  water = me <= u_sea + 0.5;
    /* Pass 1 put this in the green channel of the height
       texture, in map space. Thus the forest stays on the same
       terrain while the camera moves. */
    float forest = texture2D(u_height, heightUV(srcC)).g;

    vec3 fill = paletteFill(h, forest, water);

    if (water && u_waterStyle == 1) {
        /* The shader makes each flooded valley flat. So the
           water has no contour line, and it looks empty.

           These lines of light move slowly. The noise is much
           wider than it is tall, so the light makes long
           horizontal marks and not round spots. The water then
           has movement, and it does not fight the ink. */
        float ripple = vnoise(vec2(src.x * 0.055, src.y * 0.34) + vec2(u_time * 0.5, 0.0));
        fill = mix(fill, fill * 1.09, step(0.63, ripple));
    } else if (water && u_waterStyle == 2) {
        /* A pattern of two colours that does not move. The
           water then looks like an old printed sea chart. */
        fill = mix(fill, fill * 1.13, mod(floor(src.x * 0.5) + floor(src.y * 0.5), 2.0));
    }

    /* ---- relief shade ----
       The shader reads the flat height field at two cells to each
       side. It does not read the layer at one cell.

       A one-cell difference of a whole-number field is almost
       always 0 or 1. That gives a rough result. The layer also
       holds the steps of the stack. Those steps would put light
       on a cliff that is not there. */
    if (u_light == 1) {
        vec2 g = vec2(levelAt(srcC + vec2(2.0, 0.0)) - levelAt(srcC - vec2(2.0, 0.0)),
                      levelAt(srcC + vec2(0.0, 2.0)) - levelAt(srcC - vec2(0.0, 2.0))) / 4.0;
        /* The light comes from the north west. A slope that
           rises to the east turns its face to the west. That face
           gets the light. */
        float lambert = clamp(0.5 + 1.15 * (0.707 * g.x - 0.707 * g.y), 0.0, 1.0);
        fill *= mix(0.70, 1.26, lambert);
    } else if (u_light == 2) {
        /* Rim. A bright band goes inside each step that faces
           west. It starts two cells back, so it is next to the
           contour line and not below it. */
        if (me > visibleLayer(cell - vec2(2.0, 0.0))) fill = mix(fill, vec3(1.0), 0.22);
        if (me < visibleLayer(cell + vec2(2.0, 0.0))) fill *= 0.86;
    }

    if (u_clouds > 0.5) {
        /* Cloud shadows move slowly across the map. The shader
           cuts them into four steps. They then stay pixel art,
           and they do not become a smooth gradient. */
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

    /* ---- the plane, its shadow and its trail ----
       All three are in a narrow column above the map position of
       the plane. The lift moves an item up the screen only.

       A pixel outside that column stops here. It reads no height,
       it reads no trail point, and it does no shape mathematics.
       That is more than 90 percent of the screen. */
    float dxPlane = abs(cell.x - (u_plane.x - u_cam.x));
    bool nearTrail = u_trailMode > 0 && dxPlane < 80.0;
    bool nearPlane = dxPlane < 13.0;

    if (nearTrail || nearPlane) {
        vec2  ps    = u_plane.xy - u_cam;
        float pl    = levelAt(ps);
        /* Lift the ground position by the terrain to get the
           shadow. Lift it by the terrain and the hover to get the
           plane. The gap between the two shows the height above
           the ground. The gap closes at a summit. */
        vec2  pFoot = ps + vec2(0.0, pl * u_lift);
        vec2  pBody = ps + vec2(0.0, (pl + u_hover) * u_lift);
        float wing, shape, edge;

        if (nearTrail && abs(cell.y - pBody.y) < 110.0) {
            for (int i = 0; i < 10; i++) {
                vec3 t = u_trail[i];
                if (t.z <= 0.0) continue;
                vec2 tp = (t.xy - u_cam) + vec2(0.0, (levelAt(t.xy - u_cam) + u_hover) * u_lift);
                if (u_trailMode == 1) {
                    if (distance(cell + 0.5, tp) < 0.4 + 1.3 * t.z) {
                        color = mix(color, paperLight(), 0.30 * t.z);
                    }
                } else if (i < 9) {
                    /* A ribbon joins each point to the next one.
                       It does not draw a set of separate dots. */
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

        if (nearPlane) {
            if (u_shadowOn > 0.5 && abs(cell.y - pFoot.y) < 13.0) {
                vec2 q = turn(cell - pFoot);
                q.y *= 2.3;                          // squashed onto the ground
                planeShape(q / u_planeSize, shape, edge, wing);
                if (shape < EPS) color *= 0.60;
            }

            if (u_planeOn > 0.5 && abs(cell.y - pBody.y) < 13.0) {
                bool hidden = u_occlude > 0.5 &&
                              (cell.y + u_cam.y - me * u_lift) < u_plane.y - 1.0;
                if (!hidden) {
                    vec2 q = turn(cell - pBody) / u_planeSize;
                    /* A roll makes the wings look shorter. A
                       larger local y makes the tested shape more
                       narrow. That is the same wing from the
                       front. */
                    q.y *= u_bankScale;
                    planeShape(q, shape, edge, wing);
                    if (shape < EPS) {
                        /* Blocky keeps the red of the old walker.
                           Thus a change to it is clear. */
                        color = u_planeKind == 5 ? vec3(0.85, 0.16, 0.10)
                                                 : (wing < 0.5 ? paperLight() : paperDark());
                    } else if (edge < 0.17) {
                        color = inkColor();
                    }
                }
            }
        }
    }

    gl_FragColor = vec4(color, 1.0);
}
`;
