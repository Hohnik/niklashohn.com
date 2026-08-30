/* devbar.js — the panel that changes the settings.

   This file draws the panel from NH.GROUPS, NH.FEATURES and
   NH.PRESETS. Thus the panel always agrees with the registry.

   A new option is one entry in config.js. It then appears here
   with its label and its help text. The browser also keeps it.

   To open the panel, push ~, or click the small button in the
   corner, or load the page with ?dev. */
window.NH = window.NH || {};

NH.DevBar = (function () {
  const bar = document.getElementById('devbar');
  const chip = document.getElementById('devchip');
  const widgets = [];
  let open = false;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildControl(f) {
    const item = el('div', 'dev-item');
    const label = el('label', null, f.label);
    label.id = 'devlbl-' + f.key;
    item.appendChild(label);

    const btn = el('button');
    btn.type = 'button';
    btn.title = f.hint || f.label;
    btn.setAttribute('aria-labelledby', label.id);
    btn.dataset.key = f.key;

    if (f.type === 'toggle') {
      btn.className = 'dev-toggle';
      btn.addEventListener('click', function () { NH.cfg.step(f.key); });
    } else {
      btn.className = 'dev-cycle';
      /* The left button steps forward. The right button steps
         back. One list has seven options. If you go past the
         option that you want, you must not go round again. */
      btn.addEventListener('click', function () { NH.cfg.step(f.key, 1); });
      btn.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        NH.cfg.step(f.key, -1);
      });
    }
    item.appendChild(btn);
    widgets.push({ f: f, btn: btn });
    return item;
  }

  function buildHead() {
    const head = el('div', 'devbar-head');
    head.appendChild(el('span', 'devbar-title', 'Dev'));

    const presets = el('div', 'devbar-presets');
    NH.PRESETS.forEach(function (p) {
      const b = el('button', 'dev-preset', p.name);
      b.type = 'button';
      b.title = 'Apply the ' + p.name + ' look';
      b.addEventListener('click', function () { NH.cfg.apply(p.set); });
      presets.appendChild(b);
    });
    head.appendChild(presets);

    const actions = el('div', 'devbar-actions');
    [
      ['Random', 'Roll every visual setting at once', function () { NH.cfg.randomise(); }],
      ['New world', 'Re-roll the terrain noise. The beacons stay where they are.',
        function () { NH.newWorld(); }],
      ['Copy link', 'A link that opens the site with exactly these settings', copyLook],
      ['Save PNG', 'Download the current frame', function () { NH.capture(); }],
      ['Reset', 'Back to the defaults', function () { NH.cfg.reset(); }]
    ].forEach(function (a) {
      const b = el('button', 'dev-action', a[0]);
      b.type = 'button';
      b.title = a[1];
      b.addEventListener('click', function () { a[2](b); });
      actions.appendChild(b);
    });
    head.appendChild(actions);
    return head;
  }

  /* Show the result on the button. The bar has no other place for
     a line of status. */
  function flash(btn, text) {
    /* Keep the first label on the button, and stop a wait that is
       not complete. Two clicks in less than the wait would
       otherwise make the message the new label, and the button
       would keep it. */
    if (btn._label === undefined) btn._label = btn.textContent;
    clearTimeout(btn._flash);
    btn.textContent = text;
    btn._flash = setTimeout(function () { btn.textContent = btn._label; }, 1400);
  }

  function copyLook(btn) {
    const url = location.origin + location.pathname + '?dev&look=' + NH.cfg.encode();
    const done = function () { flash(btn, 'Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url, btn); });
    } else {
      fallbackCopy(url, btn);
    }
  }

  /* The clipboard needs a secure context. A file:// address is
     not one. */
  function fallbackCopy(url, btn) {
    const box = document.createElement('input');
    box.value = url;
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(box);
    flash(btn, ok ? 'Copied' : 'Copy failed');
  }

  function build() {
    bar.appendChild(buildHead());

    const groups = el('div', 'devbar-groups');
    NH.GROUPS.forEach(function (g) {
      const section = el('section', 'dev-group');
      section.appendChild(el('h4', null, g.label));
      const row = el('div', 'dev-row');
      NH.FEATURES.filter(function (f) { return f.group === g.id; })
        .forEach(function (f) { row.appendChild(buildControl(f)); });
      section.appendChild(row);
      groups.appendChild(section);
    });
    bar.appendChild(groups);

    bar.appendChild(el('p', 'devbar-foot',
      'Click a control to step forward, right-click to step back. Choices are kept in this browser.'));
  }

  function sync() {
    widgets.forEach(function (w) {
      if (w.f.type === 'toggle') {
        w.btn.setAttribute('aria-pressed', String(NH.cfg.v[w.f.key]));
      } else {
        w.btn.textContent = NH.cfg.label(w.f.key);
      }
    });
  }

  /* The number of rows in the bar changes with the width of the
     window. The radar and the sheets must stay clear of the bar.
     So this function measures the real height. It then writes the
     height into a custom property. A guess in the CSS would be
     wrong at some widths. */
  function publishHeight() {
    const h = bar.hidden ? 0 : bar.offsetHeight;
    document.body.style.setProperty('--devbar-h', h + 'px');
  }

  function setOpen(v) {
    open = v;
    bar.hidden = !v;
    document.body.classList.toggle('dev-on', v);
    chip.setAttribute('aria-pressed', String(v));
    NH.Hud.devMode(v);
    publishHeight();
  }

  function init() {
    build();
    sync();
    NH.on('config', sync);

    chip.addEventListener('click', function () { setOpen(!open); });
    window.addEventListener('keydown', function (e) {
      if (NH.util.typing()) return;
      if (e.key === '`' || e.key === '~' || e.key === '^') { e.preventDefault(); setOpen(!open); }
    });

    setOpen(new URLSearchParams(location.search).has('dev'));

    if (window.ResizeObserver) {
      new ResizeObserver(publishHeight).observe(bar);
    } else {
      window.addEventListener('resize', publishHeight);
    }
    /* A preset can change the width of a label. The rows then
       flow again. */
    NH.on('config', publishHeight);
  }

  return { init: init };
})();
