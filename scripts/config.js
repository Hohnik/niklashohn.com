/* ============================================================
   config.js — the feature registry.

   Every part of the site that exists in more than one version is
   declared here once. The dev bar renders itself from this list,
   the renderer reads values from it, and nothing else needs to
   know which variants exist. Adding a variant means adding an
   entry to `options` — no other file changes.
   ============================================================ */
window.NH = window.NH || {};

const STORE_KEY = 'nh.dev.v2';

/* type 'cycle': click steps through options, each {label, value}.
   type 'toggle': a switch, value is the boolean itself.
   `group` only decides where the dividers fall in the dev bar. */
NH.FEATURES = [
  { key: 'palette', label: 'Preset', group: 'world', type: 'cycle', def: 0,
    hint: 'Colour scheme of the terrain',
    options: [
      { label: 'Alpine', value: 0 }, { label: 'Dusk', value: 1 },
      { label: 'Sand',   value: 2 }, { label: 'Mono', value: 3 },
      { label: 'Neon',   value: 4 } ] },

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

  { key: 'plane', label: 'Plane', group: 'flight', type: 'cycle', def: 0,
    hint: 'Which fold the paper took',
    options: [ { label: 'Dart', value: 0 }, { label: 'Glider', value: 1 },
               { label: 'Delta', value: 2 }, { label: 'Blocky', value: 3 } ] },

  { key: 'control', label: 'Control', group: 'flight', type: 'cycle', def: 0,
    hint: 'Glide: steer left/right. Direct: 8-way. Chase: follows the pointer',
    options: [ { label: 'Glide', value: 'glide' }, { label: 'Direct', value: 'direct' },
               { label: 'Chase', value: 'chase' } ] },

  { key: 'marker', label: 'Marker', group: 'flight', type: 'cycle', def: 1,
    hint: 'What sits on top of each landmark mountain',
    options: [ { label: 'Flag', value: 0 }, { label: 'Beacon', value: 1 },
               { label: 'Monolith', value: 2 } ] },

  { key: 'panel', label: 'Panel', group: 'ui', type: 'cycle', def: 0,
    hint: 'Look of the About / Projects sheets',
    options: [ { label: 'Paper', value: 'paper' }, { label: 'Card', value: 'card' },
               { label: 'Terminal', value: 'terminal' } ] },

  { key: 'hud', label: 'HUD', group: 'ui', type: 'cycle', def: 0,
    hint: 'How you find the landmarks from a distance',
    options: [ { label: 'Radar', value: 'radar' }, { label: 'Arrows', value: 'arrows' },
               { label: 'Compass', value: 'compass' }, { label: 'Off', value: 'off' } ] },

  { key: 'projects', label: 'Source', group: 'ui', type: 'cycle', def: 0,
    hint: 'Read the project list live from the GitHub API, or use the bundled copy',
    options: [ { label: 'Live', value: 'live' }, { label: 'Static', value: 'static' } ] },

  { key: 'ink',     label: 'Ink',     group: 'sw', type: 'toggle', def: true,
    hint: 'Contour lines along the visible layer' },
  { key: 'shadow',  label: 'Shadow',  group: 'sw', type: 'toggle', def: true,
    hint: 'Drop shadow on the ground below the plane' },
  { key: 'trail',   label: 'Trail',   group: 'sw', type: 'toggle', def: true,
    hint: 'Vapour trail behind the plane' },
  { key: 'waves',   label: 'Waves',   group: 'sw', type: 'toggle', def: true,
    hint: 'Slow light drifting across the flooded valleys' },
  { key: 'fog',     label: 'Fog',     group: 'sw', type: 'toggle', def: false,
    hint: 'Haze towards the top of the screen' },
  { key: 'occlude', label: 'Occlude', group: 'sw', type: 'toggle', def: false,
    hint: 'Let nearer terrain hide the plane' },
  { key: 'labels',  label: 'Labels',  group: 'sw', type: 'toggle', def: true,
    hint: 'Floating names above the landmarks' },
  { key: 'fps',     label: 'FPS',     group: 'sw', type: 'toggle', def: false,
    hint: 'Frame counter' }
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
  set: function (key, index) {
    const f = byKey[key];
    state[key] = f.type === 'toggle' ? !!index
      : ((index % f.options.length) + f.options.length) % f.options.length;
    save();
    NH.emit('config', key);
  },
  step: function (key, dir) {
    const f = byKey[key];
    if (f.type === 'toggle') NH.cfg.set(key, !state[key]);
    else NH.cfg.set(key, state[key] + (dir || 1));
  },
  reset: function () {
    NH.FEATURES.forEach(function (f) { state[f.key] = f.def; });
    save();
    NH.emit('config', '*');
  }
};

load();
