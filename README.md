# niklashohn.com

A pixel-art portfolio landing page. A duck follows your cursor across a rainy
grass meadow; name it and press the button you're told not to, and it explodes
into a permanent gravestone in a **shared** graveyard that every visitor adds to.

Static site, vanilla JS + `<canvas>`, no build step.

## Architecture

Loaded in order from `index.html`; wired together by `main.js` — no globals.

| File | Responsibility |
| --- | --- |
| `scripts/scene.js` | `Scene` — the meadow: baked grass + muddy puddles, swaying blades, flowers, rain and ripples. Exposes `update(dt, time)`, `draw()`, `onLanding(cb)`, `depthAt(y)`. |
| `scripts/graveyard.js` | `Graveyard` — JSONBin data (`fetch`/`record`), the mound-and-cross graves (`addGrave`) with a click-to-read popup, and the raindrop-driven `reveal`. |
| `scripts/duck.js` | `Duck` — cursor-following sprite (idle/walk/fly), naming, death animation, explosion, grave. |
| `scripts/main.js` | Boots the three objects, runs one `requestAnimationFrame` loop, and the uptime clock. |

Art is generated pixel-by-pixel: `tools/gen_grave.py` (Pillow) builds
`animation/graves.png`. Lighting convention throughout: **light from the
top-left**, so faces are lit or shadowed but not both, and objects cast ground
shadows.

## Data

Killed-and-named ducks are stored in a public JSONBin bin as `{ "ducks": [...] }`.
The access key in `graveyard.js` is bin-scoped and intentionally client-side —
nothing sensitive lives there.

## Develop

Serve the folder statically and open it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```
