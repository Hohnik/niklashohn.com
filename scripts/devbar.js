/* ============================================================
   devbar.js — the variant switcher.

   Rendered entirely from NH.FEATURES, so it can never drift out
   of sync with what actually exists. Press ~ (or the chip in the
   corner, or load with ?dev) to open it.
   ============================================================ */
window.NH = window.NH || {};

NH.DevBar = (function () {
  const bar = document.getElementById('devbar');
  const chip = document.getElementById('devchip');
  const widgets = [];
  let open = false;

  function build() {
    let lastGroup = null;
    NH.FEATURES.forEach(function (f) {
      if (lastGroup !== null && f.group !== lastGroup) bar.appendChild(document.createElement('hr'));
      lastGroup = f.group;

      const item = document.createElement('div');
      item.className = 'dev-item';

      const label = document.createElement('label');
      label.textContent = f.label;
      label.id = 'devlbl-' + f.key;
      item.appendChild(label);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = f.hint || f.label;
      btn.setAttribute('aria-labelledby', label.id);

      if (f.type === 'toggle') {
        btn.className = 'dev-toggle';
        btn.addEventListener('click', function () { NH.cfg.step(f.key); });
      } else {
        btn.className = 'dev-cycle';
        /* Left click steps forward, right click steps back — handy
           when a preset list is long and you overshot. */
        btn.addEventListener('click', function () { NH.cfg.step(f.key, 1); });
        btn.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          NH.cfg.step(f.key, -1);
        });
      }
      item.appendChild(btn);
      bar.appendChild(item);
      widgets.push({ f: f, btn: btn });
    });

    bar.appendChild(document.createElement('hr'));

    const actions = document.createElement('div');
    actions.className = 'dev-actions';

    const seedBtn = document.createElement('button');
    seedBtn.type = 'button';
    seedBtn.textContent = 'New world';
    seedBtn.title = 'Re-roll the terrain noise. The beacons stay where they are.';
    seedBtn.addEventListener('click', function () { NH.newWorld(); });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Back to the defaults';
    resetBtn.addEventListener('click', function () { NH.cfg.reset(); });

    actions.appendChild(seedBtn);
    actions.appendChild(resetBtn);
    bar.appendChild(actions);
  }

  function sync() {
    widgets.forEach(function (w) {
      if (w.f.type === 'toggle') {
        w.btn.setAttribute('aria-pressed', String(NH.cfg.get(w.f.key)));
      } else {
        w.btn.textContent = NH.cfg.label(w.f.key);
      }
    });
  }

  function setOpen(v) {
    open = v;
    bar.hidden = !v;
    document.body.classList.toggle('dev-on', v);
    chip.setAttribute('aria-pressed', String(v));
  }

  function init() {
    build();
    sync();
    NH.on('config', sync);

    chip.addEventListener('click', function () { setOpen(!open); });
    window.addEventListener('keydown', function (e) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === '`' || e.key === '~' || e.key === '^') { e.preventDefault(); setOpen(!open); }
    });

    const params = new URLSearchParams(location.search);
    setOpen(params.has('dev'));
  }

  return { init: init, get open() { return open; }, setOpen: setOpen };
})();
