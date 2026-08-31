# niklashohn.com

A portfolio site that you fly through. The site is one WebGL landscape.
The paper plane is the pointer. You do not click a link to move. You fly
to a beacon, and the sheet for that beacon opens.

The live site is at <https://niklashohn.com>.

All the documentation in this repository is in ASD-STE100 Simplified
Technical English. Section 7 gives the rules.

## 1 How to move

| Control | Result |
|---|---|
| `←` `→` or `A` `D` | Turn the plane |
| `shift` or `W` | Increase the speed |
| `1` `2` `3` | Fly to Start, About or Projects |
| `H` | Fly to Start |
| `esc` | Leave the beacon and close the sheet |
| `~` | Open dev mode |
| `?` | Show the list of keys |

On a touch screen, hold a finger on the map. The plane flies to your
finger.

The addresses `#about` and `#projects` are direct links. Each one puts
the plane at that beacon immediately.

## 2 Dev mode

To open dev mode, do one of these steps:

- Push the `~` key.
- Add `?dev` to the address.
- Click the small button in the bottom right corner.

Dev mode shows a panel. The panel changes each part of the page while
the page runs. Click a control to go forward through its options. Click
it with the right button to go back. The browser keeps your choices, so
they stay after you load the page again.

### 2.1 The settings

The panel puts the settings in four groups.

World:

- Terrain: Rolling, Ridged, Dunes, Islands, Plateaus.
- Scale: Near, Mid, Far.
- View: Stacked, Flat.
- Lift: 1, 2, 3.
- Pixel: 3, 4, 6, 8.

Look:

- Preset: Alpine, Dusk, Sand, Mono, Neon, Blueprint, Autumn.
- Ink: Off, Every level, Index, Cliffs.
- Light: Flat, Hillshade, Rim.
- Water: Still, Drift, Dither.
- Clouds: on or off.
- Fog: on or off.

Flight:

- Plane: Dart, Glider, Delta, Wing, Arrow, Blocky.
- Control: Glide, Direct, Chase.
- Camera: Centre, Lead, Lazy.
- Trail: Off, Dots, Ribbon.
- Shadow: on or off.
- Occlude: on or off.

Interface:

- Marker: Flag, Beacon, Monolith, Ring, Cairn.
- Panel: Paper, Card, Terminal, Blueprint.
- HUD: Radar, Arrows, Compass, Off.
- Source: Live, Static.
- Labels: on or off.
- FPS: on or off.

There are 23 settings and 76 states. Together they give more than 10^11
combinations.

### 2.2 The buttons

| Button | Result |
|---|---|
| Paper, Topo, Alpine, Dusk, Arcade, Draft | Apply a group of settings that go well together |
| Random | Set every look at random |
| New world | Make new terrain noise. The beacons do not move |
| Copy link | Copy an address that holds all your settings |
| Save PNG | Save the frame on the screen |
| Reset | Go back to the default settings |

**Copy link** writes one base-36 character for each setting, after a
version digit. An example is `?look=101011011100001110100010`. The
length test refuses a link that a person made before you added a
setting. It does not apply that link to the wrong settings.

## 3 How the site draws the landscape

The site draws three shader passes for each frame. All three work in
*cells*, not in screen pixels. The canvas is `width / pixelSize` cells
wide. CSS then makes it larger by an exact whole number. Therefore the
pixel grid is real. The site does not make it from rounded values.

### 3.1 Pass 1: the height field

Pass 1 draws one fragment for each map cell. One of five generators
gives the height:

- Rolling: plain fbm noise.
- Ridged: a ridged multifractal.
- Dunes: a field that pulls its own coordinates sideways.
- Islands: an fbm field that a slower noise mask cuts into groups.
- Plateaus: a field in eight bands with steep sides.

Pass 1 then cuts the height into 28 levels. It makes all levels below
the sea line flat.

Each beacon adds a cone. The cone reaches the top level at its centre.
Therefore every beacon has a mountain that you see from a distance. The
height at the centre is always the top level. JavaScript knows this
number, so it can put the HTML labels on the summit. It does not ask the
GPU.

Pass 1 also writes a forest mask into the green channel. The mask
depends only on the world position. Therefore pass 1 calculates it one
time for each cell, and not one time for each pixel of each frame.

### 3.2 Pass 2: the visible layer

Pass 2 makes the false perspective. The site must draw level *L* at
*L × lift* cells higher than the map says. The levels then stack like
cut paper that you look at from the front.

A fragment shader can give itself a colour. It cannot move itself. So
each pixel asks a different question: *which layer lands on me?* Layer
*L* comes from *L × lift* cells below. The shader looks there. If the
terrain is *L* high or higher, layer *L* covers this pixel. The shader
starts at the top level and goes down. The first hit wins.

Pass 2 is a separate pass because pass 3 needs this answer three times
for each pixel. It needs the pixel and its two neighbours to find the
contour edges. One calculation for each cell, plus two texture reads,
costs one third of three calculations.

### 3.3 Pass 3: the picture

Pass 3 draws these parts of the picture:

- The terrain colours and the contour ink.
- The relief shade and the water.
- The cloud shadows.
- The beacons and their markers.
- The plane, its shadow and its trail.

The shader draws the plane from mathematics, and not from a sprite. It
uses two triangles as half-planes. Therefore the plane turns to any
angle at no cost, and it still lands on whole cells. The plane also
rolls into its turns. The shader makes the shape more narrow by
`cos(roll)`, which is the same wing from the front.

The gap between the plane and its shadow shows the height above the
ground. The gap closes when the plane goes over a summit.

### 3.4 What the site does not draw again

Pass 1 and pass 2 depend only on the camera position and the terrain
settings. They do not depend on the plane. So the site draws them again
only after one of those changes. When the camera stops, the site keeps
the two textures from the last frame. This is the usual condition when a
sheet is open and a person reads it.

If the browser takes the GPU away, the site does not fail. A phone does
this when you change to a different tab. One function makes everything
that belongs to the context, so it can make it again. The renderer stops
until the context comes back.

## 4 Speed

Measurements come from a software rasteriser (SwiftShader) on a shared
CPU. A real GPU is much faster. Use these numbers to compare one change
against another, and not as a target.

- The JavaScript work is 0.4 ms of a 40 ms frame. The frame loop makes
  no new objects. It makes the scene object, the marker objects and
  the trail points one time. Then it writes into them.
- Pass 3 sends about 10 uniforms for each frame. The other 22 go to the
  GPU only after a setting changes.
- If you turn off almost all the shader options, the frame time falls
  from 38 ms to 32 ms. Therefore the fixed cost for each draw controls
  this environment, and not the work for each pixel.

Three rules come from these measurements:

1. Measure a change. Do not assume it.
2. A test to leave a shader function early is not always faster. One
   such test made the frame 3 percent slower. We took it out again.
3. Do not make a limit from a number that the machine controls. A
   limit of 12 frames a second stopped a build at 11, and the next
   build of the same commit gave 34. The test suite now reports the
   rate and counts the passes that it did not do.

## 5 Files

```
index.html          The page: canvas, sheets, HUD, help, dev bar
styles.css          Everything above the canvas
og.png              The preview image, from tools/og.mjs
scripts/util.js     The helpers that more than one file needs
scripts/shaders.js  The three GLSL passes
scripts/config.js   The settings registry
scripts/content.js  Beacon positions and the bundled project list
scripts/world.js    The renderer
scripts/flight.js   The flight model, arrival, orbit and camera
scripts/projects.js The GitHub list, live with a bundled copy
scripts/hud.js      Labels, radar, arrows and compass
scripts/ui.js       Sheets, help, addresses and keys
scripts/devbar.js   The settings panel
scripts/main.js     The start-up steps and the frame loop
tools/verify.mjs    The browser tests
tools/contrast.mjs  The check for the text contrast
tools/ste-check.mjs The check for ASD-STE100
tools/og.mjs        Makes og.png from the live page
tools/serve.mjs     `npm start`
tools/static-server.mjs   The one server that all four tools use
```

The site is static files. It has no build step and no dependency. Open
`index.html` and it runs, from a `file://` address or from a server.
`package.json` is only for the tests.

To add a new option, add one entry to `NH.FEATURES` in
`scripts/config.js`. The dev bar, the help text, the storage and the
reset then work without more changes.

If the browser has no WebGL, the page shows the three sheets one after
the other. You can read all the content without the graphics.

## 6 Tests

```
npm install
npm test              # The language check, the browser tests, the contrast
npm run lint:ste      # The language check only
npm run test:browser  # The browser tests only
npm run test:keep     # The browser tests, and keep the screenshots
npm run test:contrast # The contrast check only
npm start             # Serve this directory on port 8743
npm run og            # Make og.png again from the live page
```

`tools/verify.mjs` serves the directory. It then drives a headless
Chromium through 144 checks. The checks include these:

- The world draws.
- A flight to a beacon opens the correct sheet and changes the address.
- The autopilot lands on the beacon that you ask for, at four screen
  sizes. A flight can go near a beacon that you did not ask for.
- Text in the project filter does not turn the plane.
- Every option of every setting compiles, draws, and draws something
  different from its neighbours.
- The layout stays correct at four screen sizes with the dev bar open.
- The browser keeps the settings after a reload.
- A shared look link gives that look, and the renderer uses the cell
  size in that link for the build. A damaged link does nothing.
- The page without WebGL and the page with less motion both show the
  content.
- The site does not draw the terrain passes again after the camera
  stops. This is the check for the cost of a frame, because the count
  is the same on each machine. The rate in frames a second is
  information only: the tests use a CPU rasteriser on a machine that
  it shares, and the same commit gave 11 frames a second in one build
  and 34 in the next.
- The page draws again after it loses the GPU and gets it back.
- The page starts with storage that throws on each read, and with
  saved settings that are not correct.
- A hostile answer from the GitHub API puts no element and no script
  in the page, and makes no link that is not http or https.
- The tab key reaches each control, each stop shows a focus ring, and
  the help card keeps the focus while it is open.
- Forty flight requests in one tick end at the last one.
- The tag that counts a visit is in the page, it has a full https
  address, and it does not hold up the first frame.

`tools/contrast.mjs` measures the text against its background on all
four sheet skins and all three sheets. The limits are the limits of
WCAG AA: 4.5 to 1 for normal text, and 3 to 1 for large text. The tool
puts each clear background on the one below it, and it keeps the worst
of the elements that a selector finds.

The tests run after every push. Refer to `.github/workflows/verify.yml`.
The workflow keeps the screenshots when a test fails.

## 7 Language of this document

All documentation in this repository, and all comments in the code, use
ASD-STE100 Simplified Technical English. The text that a visitor reads
on the site is content, and it does not follow these rules.

`npm run lint:ste` tests the documentation and the comments. The test
also runs before the browser tests, and on every push. These are the
main rules:

- Use the approved word, and use it in one part of speech only.
- Keep instruction sentences to 20 words or fewer.
- Keep descriptive sentences to 25 words or fewer.
- Give one instruction in each sentence.
- Use the active voice.
- Use simple verb tenses.
- Keep paragraphs to six sentences or fewer.
- Use vertical lists for steps and for sets of items.
- Use the same word for the same thing every time.

These are the technical names that this repository uses. Do not replace
them with other words:

| Name | Meaning |
|---|---|
| cell | One square of the pixel grid |
| level | One of the 28 steps of the terrain |
| layer | The level that you see at a screen cell |
| pass | One of the three shader stages |
| beacon | One of the three places you can fly to |
| sheet | The panel of text at a beacon |
| lift | The cells that the site adds for each level |
| look | A complete set of settings |
| heading | The direction of the nose of the plane |
| bearing | The direction from the plane to a beacon |

## 8 Ideas for later

1. A hover animation that is not standard, in the style of
   [hilights](https://raphaelameaume.com/).
2. An animation for the text when it appears, in the style of
   [soulwire](https://soulwire.co.uk/).
3. Work from [NatureOfCode](https://natureofcode.com), fractal flames or
   height lines.
4. Photographs of the landscape near Moosburg.
5. More [projects](https://100.antfu.me/) for people to look at.
6. Make the duck larger when it stands on something high.
7. A background with a dither pattern, in the style of
   [xtcjs](https://xtcjs.app).

### 8.1 A vector that draws an image

1. Find the edges of an
   [image](https://miro.medium.com/v2/resize:fit:644/1*S60hg-pTDfj_MPBY-HkXrA.png).
2. Move a vector in a random direction. The vector draws one continuous
   line. Give it a higher probability to move to an edge.
