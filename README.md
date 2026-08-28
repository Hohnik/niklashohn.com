# niklashohn.com

A portfolio you fly through. The whole site is one WebGL landscape; the
paper plane is the cursor. There is nothing to click to move around —
you steer to a beacon and the sheet for that beacon opens.

Live: <https://niklashohn.com>

## Getting around

| | |
|---|---|
| `←` `→` / `A` `D` | steer |
| `shift` / `W` | boost |
| `1` `2` `3` | autopilot to Start / About / Projects |
| `H` | fly home |
| `esc` | peel off, close the sheet |
| `~` | dev mode |

On a touch screen, hold a finger anywhere and the plane flies to it.
`#about` and `#projects` are real deep links — they drop the plane
straight onto the beacon.

## Dev mode

Press `~` (or add `?dev` to the URL, or hit the chip in the corner) for a
bar that swaps out every part of the page while it runs. Left click steps
forward through a setting, right click steps back. Choices are kept in
`localStorage`, so a look you like survives a reload.

| Setting | Versions |
|---|---|
| Preset | Alpine · Dusk · Sand · Mono · Neon |
| View | Stacked (fake perspective) · Flat (plain top-down map) |
| Lift | 1 · 2 · 3 cells of rise per terrain level |
| Pixel | 3 · 4 · 6 · 8 screen pixels per cell |
| Plane | Dart · Glider · Delta · Blocky |
| Control | Glide (steer) · Direct (8-way) · Chase (follows the pointer) |
| Marker | Flag · Beacon · Monolith |
| Panel | Paper · Card · Terminal |
| HUD | Radar · Arrows · Compass · Off |
| Source | Projects read live from the GitHub API, or the bundled copy |
| Switches | Ink · Shadow · Trail · Waves · Fog · Occlude · Labels · FPS |

Plus **New world** to re-roll the terrain noise, and **Reset**.

## How the landscape is drawn

Three fragment shader passes per frame, all at *cell* resolution — the
canvas backing store is `width / pixelSize` across and CSS scales it back
up by an exact integer factor, so the pixel grid is real rather than
faked by rounding.

1. **Height.** One fragment per map cell. Four octaves of value noise,
   stretched with `smoothstep` (raw fbm crowds around the middle and would
   leave the map flat), quantised into 28 levels, then flooded flat below
   the water line. Each landmark adds a cone that reaches the top level at
   its centre, so every beacon is guaranteed a mountain you can see from
   across the map — and its exact height is known without asking the GPU,
   which is what lets the HTML labels sit on the summit.

2. **Visible layer.** The fake perspective, asked backwards. We want level
   *L* drawn *L × lift* cells higher than the map says, so the levels stack
   like paper cutouts seen from the front — but a fragment shader can
   colour itself and cannot move itself. So each pixel asks instead: *who
   lands on me?* Layer *L* would have come from *L × lift* cells below;
   look there, and if the terrain is at least *L* high, layer *L* covers
   this pixel. Search top-down, first hit wins. This gets its own pass
   because the answer is needed three times per pixel — here and at two
   neighbours — to find the contour edges.

3. **Shading.** Palette, contour ink, water drift, landmarks, the plane,
   its shadow and its vapour trail. The plane is drawn as maths rather
   than a sprite: two triangles as half-planes, so it turns to any angle
   for free and still lands on whole cells.

The gap between the plane and its shadow is what reads as altitude, and it
closes by itself when the plane crosses a peak.

## Layout

```
index.html          the page: canvas, sheets, HUD, dev bar
styles.css          everything on top of the canvas
scripts/shaders.js  the three GLSL passes
scripts/config.js   the feature registry — the dev bar renders itself from it
scripts/content.js  landmark positions, bundled project list
scripts/world.js    the renderer
scripts/flight.js   flight model, arrival, orbit, camera
scripts/projects.js the GitHub list, live with a bundled fallback
scripts/ui.js       sheets, labels, HUD, routing
scripts/devbar.js   the variant switcher
scripts/main.js     wiring and the frame loop
legacy/             the previous site (the raven), still runnable
```

Static files only — no build step. Anything with a `file://`-hostile
fetch was avoided on purpose; open `index.html` and it runs.

Adding a new version of something means adding one entry to
`NH.FEATURES` in `scripts/config.js`. The dev bar, the storage and the
reset all follow from that.

Without WebGL the page falls back to the three sheets stacked and
scrollable, so the content is never behind the graphics.

## Ideas still on the list

1. Non standard hover animation [hilights](https://raphaelameaume.com/) (text marker style)
2. Text on the website has a appearence [animation](https://soulwire.co.uk/) (fly in like powerpoint, decrypt, etc)
3. Something from [NatureOfCode](https://natureofcode.com) or fractal flames or height lines
4. Beautiful Images (landscape in my area, places)
5. Some [projects](https://100.antfu.me/) for people to explore
6. Increase size of the duck based on if it stands on something or height of the map in the background

### Image drawing vector

1. Generate edges of an [image](https://miro.medium.com/v2/resize:fit:644/1*S60hg-pTDfj_MPBY-HkXrA.png)
2. Have a Vector (that draws a continuous line) move in a random direction
with the probability higher flying towards the edges detected in the image
