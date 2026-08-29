/* ============================================================
   config.js — the feature registry.

   Every part of the site that exists in more than one version is
   declared here once. The dev bar renders itself from this list,
   the renderer reads values from it, and nothing else needs to
   know which variants exist. Adding a variant means adding an
   entry to `options` — no other file changes.
   ============================================================ */
window.NH = window.NH || {};

const STORE_KEY = 'nh.dev.v3';

/* type 'cycle': click steps through options, each {label, value}.
   type 'toggle': a switch, value is the boolean itself.
   `group` decides which cluster of the dev bar it lands in. */
NH.GROUPS = [
  { id: 'world',  label: 'World' },
  { id: 'look',   label: 'Look' },
  { id: 'flight', label: 'Flight' },
  { id: 'ui',     label: 'Interface' }
];

NH.FEATURES = [
  // ---------------------------------------------------- world
  { key: 'terrain', label: 'Terrain', group: 'world', type: 'cycle', def: 0,
    hint: 'Which generator builds the height field',
    options: [
      { label: 'Rolling',     value: 0 }, { label: 'Ridged',   value: 1 },
      { label: 'Dunes',       value: 2 }, { label: 'Islands',  value: 3 },
      { label: 'Plateaus',    value: 4 } ] },

  { key: 'scale', label: 'Scale', group: 'world', type: 'cycle', def: 1,
    hint: 'Size of the terrain features, in cells',
    options: [ { label: 'Near', value: 1 / 400 }, { label: 'Mid', value: 1 / 260 },
               { label: 'Far',  value: 1 / 165 } ] },

  { key: 'view', label: 'View', group: 'world', type: 'cycle', def: 0,
    hint: 'Stacked layers (fake perspective) or a plain top-down map',
    options: [ { label: 'Stacked', value: 'stacked' }, { label: 'Flat', value: 'flat' } ] },

  { key: 'lift', label: 'Lift', group: 'world', type: 'cycle', def: 1,
    hint: 'How far each terrain level is pushed up the screen',
    options: [ { label: '1', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 } ] },

  { key: 'pixel', label: 'Pixel', group: 'world', type: 'cycle', def: 1,
    hint: 'Size of one rendered cell, in screen pixels',
    options: [ { label: '3', value: 3 }, { label: '4', value: 4 },
               { label: '6', value: 6 }, { label: '8', value: 8 } ] },

  // ----------------------------------------------------- look
  { key: 'palette', label: 'Preset', group: 'look', type: 'cycle', def: 0,
    hint: 'Colour scheme of the terrain',
    options: [
      { label: 'Alpine',    value: 0 }, { label: 'Dusk',   value: 1 },
      { label: 'Sand',      value: 2 }, { label: 'Mono',   value: 3 },
      { label: 'Neon',      value: 4 }, { label: 'Blueprint', value: 5 },
      { label: 'Autumn',    value: 6 } ] },

  { key: 'ink', label: 'Ink', group: 'look', type: 'cycle', def: 1,
    hint: 'Contour lines: every level, index contours every fifth, or cliffs only',
    options: [ { label: 'Off', value: 0 }, { label: 'Every', value: 1 },
               { label: 'Index', value: 2 }, { label: 'Cliffs', value: 3 } ] },

  { key: 'light', label: 'Light', group: 'look', type: 'cycle', def: 1,
    hint: 'Relief shading from the north west, or a rim on every sunward riser',
    options: [ { label: 'Flat', value: 0 }, { label: 'Hillshade', value: 1 },
               { label: 'Rim', value: 2 } ] },

  { key: 'water', label: 'Water', group: 'look', type: 'cycle', def: 1,
    hint: 'The flooded valleys carry no contours, so they need something else',
    options: [ { label: 'Still', value: 0 }, { label: 'Drift', value: 1 },
               { label: 'Dither', value: 2 } ] },

  { key: 'clouds', label: 'Clouds', group: 'look', type: 'toggle', def: false,
    hint: 'Cloud shadows drifting across the map' },
  { key: 'fog', label: 'Fog', group: 'look', type: 'toggle', def: false,
    hint: 'Haze towards the top of the screen' },

  // --------------------------------------------------- flight
  { key: 'plane', label: 'Plane', group: 'flight', type: 'cycle', def: 0,
    hint: 'Which fold the paper took',
    options: [ { label: 'Dart', value: 0 }, { label: 'Glider', value: 1 },
               { label: 'Delta', value: 2 }, { label: 'Wing', value: 3 },
               { label: 'Arrow', value: 4 }, { label: 'Blocky', value: 5 } ] },

  { key: 'control', label: 'Control', group: 'flight', type: 'cycle', def: 0,
    hint: 'Glide: steer left/right. Direct: 8-way. Chase: follows the pointer',
    options: [ { label: 'Glide', value: 'glide' }, { label: 'Direct', value: 'direct' },
               { label: 'Chase', value: 'chase' } ] },

  { key: 'camera', label: 'Camera', group: 'flight', type: 'cycle', def: 1,
    hint: 'Centred on the plane, looking ahead of it, or trailing behind',
    options: [ { label: 'Centre', value: 'centre' }, { label: 'Lead', value: 'lead' },
               { label: 'Lazy', value: 'lazy' } ] },

  { key: 'trail', label: 'Trail', group: 'flight', type: 'cycle', def: 1,
    hint: 'What the plane leaves behind it',
    options: [ { label: 'Off', value: 0 }, { label: 'Dots', value: 1 },
               { label: 'Ribbon', value: 2 } ] },

  { key: 'shadow', label: 'Shadow', group: 'flight', type: 'toggle', def: true,
    hint: 'Drop shadow on the ground below the plane — the gap is the altitude' },
  { key: 'occlude', label: 'Occlude', group: 'flight', type: 'toggle', def: false,
    hint: 'Let nearer terrain hide the plane' },

  // ------------------------------------------------ interface
  { key: 'marker', label: 'Marker', group: 'ui', type: 'cycle', def: 1,
    hint: 'What sits on top of each landmark mountain',
    options: [ { label: 'Flag', value: 0 }, { label: 'Beacon', value: 1 },
               { label: 'Monolith', value: 2 }, { label: 'Ring', value: 3 },
               { label: 'Cairn', value: 4 } ] },

  { key: 'panel', label: 'Panel', group: 'ui', type: 'cycle', def: 0,
    hint: 'Look of the About / Projects sheets',
    options: [ { label: 'Paper', value: 'paper' }, { label: 'Card', value: 'card' },
               { label: 'Terminal', value: 'terminal' }, { label: 'Blueprint', value: 'blueprint' } ] },

  { key: 'hud', label: 'HUD', group: 'ui', type: 'cycle', def: 0,
    hint: 'How you find the landmarks from a distance',
    options: [ { label: 'Radar', value: 'radar' }, { label: 'Arrows', value: 'arrows' },
               { label: 'Compass', value: 'compass' }, { label: 'Off', value: 'off' } ] },

  { key: 'projects', label: 'Source', group: 'ui', type: 'cycle', def: 0,
    hint: 'Read the project list live from the GitHub API, or use the bundled copy',
    options: [ { label: 'Live', value: 'live' }, { label: 'Static', value: 'static' } ] },

  { key: 'labels', label: 'Labels', group: 'ui', type: 'toggle', def: true,
    hint: 'Floating names above the landmarks' },
  { key: 'fps', label: 'FPS', group: 'ui', type: 'toggle', def: false,
    hint: 'Frame counter and cell grid size' }
];

/* Whole looks, applied in one click. Each names only the settings
   it actually cares about; everything else stays where it is, so
   a preset is a starting point rather than a reset. */
NH.PRESETS = [
  { name: 'Paper',   set: { palette: 0, ink: 1, light: 1, water: 1, marker: 1, panel: 0, clouds: false, fog: false } },
  { name: 'Topo',    set: { palette: 3, ink: 2, light: 1, water: 2, marker: 0, panel: 0, terrain: 0, clouds: false } },
  { name: 'Alpine',  set: { palette: 0, terrain: 1, ink: 1, light: 1, water: 1, marker: 4, clouds: true, fog: true, lift: 2 } },
  { name: 'Dusk',    set: { palette: 1, terrain: 2, ink: 1, light: 1, water: 1, marker: 2, panel: 1, fog: true } },
  { name: 'Arcade',  set: { palette: 4, terrain: 4, ink: 1, light: 2, water: 0, marker: 3, panel: 2, plane: 4, trail: 2 } },
  { name: 'Draft',   set: { palette: 5, terrain: 3, ink: 1, light: 0, water: 2, marker: 3, panel: 3, plane: 3, trail: 0 } }
];

/* ---- tiny event bus, so nothing has to import anything ---- */
const listeners = {};
NH.on = function (event, fn) { (listeners[event] = listeners[event] || []).push(fn); };
NH.emit = function (event, arg) { (listeners[event] || []).forEach(function (fn) { fn(arg); }); };

/* ---- current selection ---- */
const byKey = {};
NH.FEATURES.forEach(function (f) { byKey[f.key] = f; });

const state = {};
NH.FEATURES.forEach(function (f) { state[f.key] = f.def; });

function load() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { saved = {}; }
  NH.FEATURES.forEach(function (f) {
    const v = saved[f.key];
    if (v === undefined) return;
    if (f.type === 'toggle' && typeof v === 'boolean') state[f.key] = v;
    if (f.type === 'cycle' && Number.isInteger(v) && v >= 0 && v < f.options.length) state[f.key] = v;
  });
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
}

NH.cfg = {
  /* The resolved value: the option's `value` for cycles, the
     boolean for toggles. Callers never see indexes. */
  get: function (key) {
    const f = byKey[key];
    return f.type === 'toggle' ? state[key] : f.options[state[key]].value;
  },
  label: function (key) {
    const f = byKey[key];
    return f.type === 'toggle' ? (state[key] ? 'On' : 'Off') : f.options[state[key]].label;
  },
  index: function (key) { return state[key]; },
  feature: function (key) { return byKey[key]; },

  set: function (key, index, quiet) {
    const f = byKey[key];
    if (!f) return;
    state[key] = f.type === 'toggle' ? !!index
      : ((index % f.options.length) + f.options.length) % f.options.length;
    if (!quiet) { save(); NH.emit('config', key); }
  },
  step: function (key, dir) {
    const f = byKey[key];
    if (f.type === 'toggle') NH.cfg.set(key, !state[key]);
    else NH.cfg.set(key, state[key] + (dir || 1));
  },
  /* Several keys at once, with a single notification — otherwise
     applying a preset would rebuild the renderer six times. */
  apply: function (obj) {
    Object.keys(obj).forEach(function (k) { NH.cfg.set(k, obj[k], true); });
    save();
    NH.emit('config', '*');
  },
  reset: function () {
    NH.FEATURES.forEach(function (f) { state[f.key] = f.def; });
    save();
    NH.emit('config', '*');
  },
  /* ---- shareable looks ----
     One base-36 character per feature, in registry order, behind a
     version digit. Short enough to paste into a message, and the
     length check means a link made before a feature was added is
     rejected rather than silently applied to the wrong settings. */
  encode: function () {
    return '1' + NH.FEATURES.map(function (f) {
      return (f.type === 'toggle' ? (state[f.key] ? 1 : 0) : state[f.key]).toString(36);
    }).join('');
  },
  decode: function (str) {
    if (typeof str !== 'string' || str.charAt(0) !== '1') return false;
    const body = str.slice(1);
    if (body.length !== NH.FEATURES.length) return false;
    const next = {};
    for (let i = 0; i < NH.FEATURES.length; i++) {
      const f = NH.FEATURES[i];
      const v = parseInt(body.charAt(i), 36);
      if (isNaN(v)) return false;
      if (f.type === 'toggle') { if (v > 1) return false; next[f.key] = !!v; }
      else { if (v >= f.options.length) return false; next[f.key] = v; }
    }
    Object.keys(next).forEach(function (k) { state[k] = next[k]; });
    save();
    NH.emit('config', '*');
    return true;
  },

  randomise: function () {
    NH.FEATURES.forEach(function (f) {
      /* Leave the two that are about how the page behaves rather
         than how it looks: rolling a random data source or hiding
         the labels is a worse page, not a different one. */
      if (f.key === 'projects' || f.key === 'labels') return;
      state[f.key] = f.type === 'toggle'
        ? Math.random() < 0.5
        : Math.floor(Math.random() * f.options.length);
    });
    save();
    NH.emit('config', '*');
  }
};

load();
