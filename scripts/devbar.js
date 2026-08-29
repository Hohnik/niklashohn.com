/* ============================================================
   devbar.js — the variant switcher.

   Rendered entirely from NH.GROUPS / NH.FEATURES / NH.PRESETS, so
   it can never drift out of sync with what actually exists: a new
   variant is one entry in config.js and it appears here with its
   label, its tooltip and its persistence already working.

   Press ~ (or the chip in the corner, or load with ?dev).
   ============================================================ */
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
      /* Left click steps forward, right click steps back — the
         option lists run to seven now, and overshooting the one
         you wanted should not mean going round again. */
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

  /* Say what happened on the button itself: there is nowhere else
     in this bar for a status line to live. */
  function flash(btn, text) {
    const was = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = was; }, 1400);
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

  /* Clipboard access needs a secure context, which file:// is not. */
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
        w.btn.setAttribute('aria-pressed', String(NH.cfg.get(w.f.key)));
      } else {
        w.btn.textContent = NH.cfg.label(w.f.key);
      }
    });
  }

  /* The bar wraps to a different number of rows depending on the
     window width, and the radar and the sheets both have to stay
     clear of it. Rather than guess a height in CSS, measure the
     real one and publish it as a custom property. */
  function publishHeight() {
    const h = bar.hidden ? 0 : bar.offsetHeight;
    document.body.style.setProperty('--devbar-h', h + 'px');
  }

  function setOpen(v) {
    open = v;
    bar.hidden = !v;
    document.body.classList.toggle('dev-on', v);
    chip.setAttribute('aria-pressed', String(v));
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
    /* A preset can change a label's width and reflow the rows. */
    NH.on('config', publishHeight);
  }

  return { init: init, get open() { return open; }, setOpen: setOpen };
})();
