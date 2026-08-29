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
panel that swaps out every part of the page while it runs. Left click steps
a setting forward, right click steps back. Choices are kept in
`localStorage`, so a look you like survives a reload.

**World** — Terrain (Rolling · Ridged · Dunes · Islands · Plateaus) ·
Scale (Near · Mid · Far) · View (Stacked · Flat) · Lift (1 · 2 · 3) ·
Pixel (3 · 4 · 6 · 8)

**Look** — Preset (Alpine · Dusk · Sand · Mono · Neon · Blueprint · Autumn) ·
Ink (Off · Every level · Index contours · Cliffs only) ·
Light (Flat · Hillshade · Rim) · Water (Still · Drift · Dither) ·
Clouds · Fog

**Flight** — Plane (Dart · Glider · Delta · Wing · Arrow · Blocky) ·
Control (Glide · Direct · Chase) · Camera (Centre · Lead · Lazy) ·
Trail (Off · Dots · Ribbon) · Shadow · Occlude

**Interface** — Marker (Flag · Beacon · Monolith · Ring · Cairn) ·
Panel (Paper · Card · Terminal · Blueprint) ·
HUD (Radar · Arrows · Compass · Off) · Source (Live · Static) ·
Labels · FPS

Twenty-three settings, seventy-six states, on the order of 10¹¹
combinations. Six named presets — Paper, Topo, Alpine, Dusk, Arcade,
Draft — bundle the ones worth keeping together, and **Random** rolls the
lot. **New world** re-seeds the terrain noise without moving the beacons.

**Copy link** puts the whole configuration in a URL — one base-36
character per setting behind a version digit, so
`?look=101011011100001110100010` opens the page looking exactly like
yours. A link written before a feature existed fails its length check and
is ignored rather than applied to the wrong settings. **Save PNG**
downloads the current frame, named after the look that produced it.

## How the landscape is drawn

Three fragment shader passes per frame, all at *cell* resolution — the
canvas backing store is `width / pixelSize` across and CSS scales it back
up by an exact integer factor, so the pixel grid is real rather than
faked by rounding.

1. **Height.** One fragment per map cell. One of five generators — plain
   fbm, a ridged multifractal, a domain-warped field, an island mask, or a
   banded mesa profile — quantised into 28 levels and flooded flat below
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

3. **Shading.** Palette, contour ink, relief shading, water, cloud
   shadows, landmarks, the plane, its shadow and its trail. The plane is
   drawn as maths rather than a sprite: two triangles as half-planes, so
   it turns to any angle for free and still lands on whole cells.

The gap between the plane and its shadow is what reads as altitude, and it
closes by itself when the plane crosses a peak.

Passes 1 and 2 depend only on where the camera is and how the terrain is
configured, never on the plane — so they are skipped entirely on any frame
where none of that changed. That is most of the frame's work saved
whenever the camera settles, which is exactly when a sheet is open and
someone is reading.

## Layout

```
index.html          the page: canvas, sheets, HUD, help, dev bar
styles.css          everything on top of the canvas
scripts/util.js     the few helpers more than one file needs
scripts/shaders.js  the three GLSL passes
scripts/config.js   the feature registry — the dev bar renders itself from it
scripts/content.js  landmark positions, bundled project list
scripts/world.js    the renderer
scripts/flight.js   flight model, arrival, orbit, camera
scripts/projects.js the GitHub list, live with a bundled fallback
scripts/hud.js      labels, radar, arrows, compass
scripts/ui.js       sheets, help, routing, keyboard
scripts/devbar.js   the variant switcher
scripts/main.js     wiring and the frame loop
tools/verify.mjs    the browser test suite
tools/serve.mjs     a static server for local work
legacy/             the previous site (the raven), still runnable
```

The site itself is static files with no build step and no dependencies:
open `index.html` and it runs, from `file://` as well as from a server.
`package.json` exists only for the tests.

Adding a new version of something means adding one entry to
`NH.FEATURES` in `scripts/config.js`. The dev bar, the tooltip, the
storage and the reset all follow from that.

Without WebGL the page falls back to the three sheets stacked and
scrollable, so the content is never behind the graphics.

## Tests

```
npm install
npm test              # npm run test:keep leaves the screenshots behind
```

`tools/verify.mjs` serves the directory and drives a headless Chromium
through 83 checks: that the world renders, that flying to a beacon opens
the right sheet and updates the URL, that typing in the project filter
does not steer the plane, that **every** variant of every feature compiles,
draws something, and draws something *different* from its neighbours, that
the layout holds at three viewport sizes with the dev bar open, that
choices survive a reload, that the no-WebGL and reduced-motion paths still
give you the content, that a shared look link restores the look and a
malformed one is refused, and that the terrain passes really are skipped
once the camera settles. It runs on every push
(`.github/workflows/verify.yml`) and uploads the screenshots when it fails.

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
