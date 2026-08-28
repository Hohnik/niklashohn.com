/* ============================================================
   ui.js — everything drawn in DOM on top of the canvas:
   the sheets, the landmark labels, the three HUD variants and
   the routing that keeps the URL in step with the plane.
   ============================================================ */
window.NH = window.NH || {};
NH.sheetOpen = false;

NH.UI = (function () {
  const panel = document.getElementById('panel');
  const labelsBox = document.getElementById('labels');
  const arrowsBox = document.getElementById('arrows');
  const compassStrip = document.querySelector('.compass-strip');
  const radar = document.getElementById('radar');
  const hint = document.getElementById('hint');
  const fpsBox = document.getElementById('fps');
  const quicknav = document.getElementById('quicknav');

  const labels = {};
  const arrows = {};
  let openId = null;
  let hashWeSet = '';
  let hintHidden = false;
  let fpsAvg = 60;
  let radarCtx = null;

  const RADAR_RANGE = 460;     // world cells from the middle to the rim

  function angleDelta(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* ---------------- sheets ---------------- */

  function openSheet(id) {
    openId = id;
    NH.sheetOpen = true;
    panel.hidden = false;
    /* Re-trigger the entry animation even when one sheet replaces
       another without the element ever leaving the DOM. */
    panel.style.animation = 'none';
    void panel.offsetWidth;
    panel.style.animation = '';
    panel.scrollTop = 0;

    NH.MARKS.forEach(function (m) {
      const doc = document.getElementById('doc-' + m.id);
      if (doc) doc.classList.toggle('on', m.id === id);
    });
    if (id === 'projects') NH.Projects.refresh();

    setHash(id === 'home' ? '' : '#' + id);
    syncNav();
    document.body.classList.add('sheet-open');
  }

  function closeSheet() {
    openId = null;
    NH.sheetOpen = false;
    panel.hidden = true;
    setHash('');
    syncNav();
    document.body.classList.remove('sheet-open');
  }

  /* replaceState instead of location.hash: it updates the address
     bar without firing hashchange, so our own arrivals never look
     like a navigation request coming back at us. */
  function setHash(h) {
    hashWeSet = h;
    const url = location.pathname + location.search + h;
    try { history.replaceState(null, '', url); } catch (e) { /* file:// */ }
  }

  function syncNav() {
    Array.prototype.forEach.call(quicknav.querySelectorAll('button[data-fly]'), function (b) {
      b.setAttribute('aria-current', String(b.dataset.fly === openId));
    });
  }

  /* ---------------- landmark labels ---------------- */

  function ensureLabel(mark) {
    if (labels[mark.id]) return labels[mark.id];
    const el = document.createElement('div');
    el.className = 'mark-label';
    el.innerHTML = '<b></b><span></span>';
    labelsBox.appendChild(el);
    labels[mark.id] = el;
    return el;
  }

  /* Text is rewritten at 8 Hz, not 60. The distance counts down a
     cell at a time and nobody can read that fast, but every write
     invalidates layout — and the clamp below has to measure the
     pill, so a per-frame rewrite means a forced reflow per label
     per frame. */
  let labelClock = 0;

  function updateLabels(dt) {
    const on = NH.cfg.get('labels');
    const p = NH.Flight.state.pos;
    labelClock += dt;
    const retext = labelClock >= 0.125;
    if (retext) labelClock = 0;

    NH.MARKS.forEach(function (m) {
      const el = ensureLabel(m);
      if (!on) { el.style.display = 'none'; return; }
      /* Landmarks always sit on a cone that reaches the top
         level, so their drawn height is known exactly — no need
         to ask the GPU where the ground is. */
      const s = NH.Flight.project(m.world, NH.LEVELS);
      const dist = Math.round(Math.hypot(p.x - m.world.x, p.y - m.world.y));
      const W = window.innerWidth, H = window.innerHeight;
      /* Only label a beacon whose top is actually on screen. Past
         that the HUD takes over — a label pinned to the edge for a
         beacon you cannot see is just noise next to the arrow that
         already says where it is. */
      if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';

      if (retext || !el._w) {
        const sub = dist < NH.ARRIVE ? m.tag : dist + ' cells';
        if (el._name !== m.name) { el.querySelector('b').textContent = m.name; el._name = m.name; }
        if (el._sub !== sub) { el.querySelector('span').textContent = sub; el._sub = sub; }
        el.classList.toggle('near', dist < NH.DEPART);
        el._w = el.offsetWidth;      // one reflow per label, eight times a second
        el._h = el.offsetHeight;
      }

      /* Clear the tallest marker sprite (18 cells) plus a gap, in
         screen pixels, so the label never sits on the beacon. */
      const top = s.y - 19 * NH.World.cells.pixel - 6;
      /* Then keep the whole pill on screen. A label sliding off the
         edge loses exactly the half that says how far away the
         thing is, which is the half worth reading. */
      const halfW = el._w / 2 + 8;
      const x = Math.min(Math.max(s.x, halfW), W - halfW);
      const y = Math.min(Math.max(top, el._h + 8), H - 8);
      /* Positioned with a transform rather than left/top: a
         transform is composited and never touches layout. */
      el.style.transform = 'translate(-50%, -100%) translate(' +
        Math.round(x) + 'px,' + Math.round(y) + 'px)';
      el.style.opacity = (x !== s.x || y !== top) ? '.6' : '1';
    });
  }

  /* ---------------- HUD: edge arrows ---------------- */

  function ensureArrow(mark) {
    if (arrows[mark.id]) return arrows[mark.id];
    const el = document.createElement('div');
    el.className = 'arrow';
    el.innerHTML = '<i></i><em></em>';
    arrowsBox.appendChild(el);
    arrows[mark.id] = el;
    return el;
  }

  let arrowClock = 0, retextArrows = true;

  function updateArrows(dt) {
    /* Same reason as the labels: reposition every frame, but only
       rewrite the distance text eight times a second. */
    arrowClock += dt;
    retextArrows = arrowClock >= 0.125;
    if (retextArrows) arrowClock = 0;
    const p = NH.Flight.state.pos;
    const W = window.innerWidth, H = window.innerHeight;
    const cx = W / 2, cy = H / 2;
    const padX = Math.min(70, W * 0.12);
    const padY = Math.min(70, H * 0.14);
    /* Asymmetric insets: the dev bar owns the top strip and the
       quick nav owns the bottom one, and both sit above the HUD. */
    const rect = {
      l: padX, r: W - padX,
      t: padY + (document.body.classList.contains('dev-on') ? 58 : 0),
      b: H - padY - 34
    };

    NH.MARKS.forEach(function (m) {
      const el = ensureArrow(m);
      const s = NH.Flight.project(m.world, NH.LEVELS);
      const inside = s.x > rect.l && s.x < rect.r && s.y > rect.t && s.y < rect.b;
      if (inside) { el.style.display = 'none'; return; }
      el.style.display = '';

      /* Cast a ray from the middle of the screen along the bearing
         and stop it at the first wall of that rectangle. */
      let dx = s.x - cx, dy = s.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      let t = Infinity;
      if (dx > 0.0001) t = Math.min(t, (rect.r - cx) / dx);
      if (dx < -0.0001) t = Math.min(t, (rect.l - cx) / dx);
      if (dy > 0.0001) t = Math.min(t, (rect.b - cy) / dy);
      if (dy < -0.0001) t = Math.min(t, (rect.t - cy) / dy);
      if (!isFinite(t)) t = 0;

      el.style.transform = 'translate(-50%, -50%) translate(' +
        Math.round(cx + dx * t) + 'px,' + Math.round(cy + dy * t) + 'px)';
      /* The triangle points up by default; rotate it onto the bearing. */
      el.querySelector('i').style.transform =
        'rotate(' + Math.round(Math.atan2(dy, dx) * 180 / Math.PI + 90) + 'deg)';
      if (retextArrows) {
        el.querySelector('em').textContent =
          m.name + ' ' + Math.round(Math.hypot(p.x - m.world.x, p.y - m.world.y));
      }
    });
  }

  /* ---------------- HUD: compass strip ---------------- */

  const compassItems = [];
  function updateCompass() {
    const FOV = 1.25;                       // radians shown either side of the nose
    const w = compassStrip.parentElement.clientWidth;
    const heading = NH.Flight.state.heading;
    const p = NH.Flight.state.pos;

    const entries = [
      { label: 'N', card: true, bearing: Math.PI / 2 },
      { label: 'E', card: true, bearing: 0 },
      { label: 'S', card: true, bearing: -Math.PI / 2 },
      { label: 'W', card: true, bearing: Math.PI }
    ].concat(NH.MARKS.map(function (m) {
      return {
        label: m.name + ' ' + Math.round(Math.hypot(p.x - m.world.x, p.y - m.world.y)),
        card: false,
        bearing: Math.atan2(m.world.y - p.y, m.world.x - p.x)
      };
    }));

    while (compassItems.length < entries.length) {
      const el = document.createElement('span');
      el.className = 'compass-tick';
      compassStrip.appendChild(el);
      compassItems.push(el);
    }
    entries.forEach(function (e, i) {
      const el = compassItems[i];
      const rel = angleDelta(heading, e.bearing);
      if (Math.abs(rel) > FOV) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.className = 'compass-tick' + (e.card ? ' card' : '');
      el.style.left = (w / 2 + (rel / FOV) * (w / 2 - 12)) + 'px';
      el.style.opacity = String(1 - Math.abs(rel) / FOV * 0.65);
      el.textContent = e.label;
    });
    for (let i = entries.length; i < compassItems.length; i++) compassItems[i].style.display = 'none';
  }

  /* ---------------- HUD: radar ---------------- */

  function updateRadar() {
    if (!radarCtx) radarCtx = radar.getContext('2d');
    const ctx = radarCtx;
    const size = radar.width, r = size / 2 - 6, cx = size / 2, cy = size / 2;
    const p = NH.Flight.state.pos;
    const scale = r / RADAR_RANGE;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(14,14,17,.72)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 10);

    NH.MARKS.forEach(function (m) {
      /* World y points up, canvas y points down. */
      let dx = (m.world.x - p.x) * scale;
      let dy = -(m.world.y - p.y) * scale;
      const d = Math.hypot(dx, dy);
      /* Out of range: pin it to the rim rather than drop it, so the
         bearing is still readable when you have flown too far. */
      const beyond = d > r - 9;
      if (beyond && d > 0) { dx *= (r - 9) / d; dy *= (r - 9) / d; }

      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, beyond ? 3 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = beyond ? 'rgba(255,233,168,.6)' : '#ffe9a8';
      ctx.fill();
      ctx.fillStyle = beyond ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.92)';
      ctx.fillText(m.initial, cx + dx, cy + dy - 7);
    });

    // the plane itself, always in the middle, nose along its heading
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-NH.Flight.state.heading);
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, 4.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-5, -4.5);
    ctx.closePath();
    ctx.fillStyle = '#fbfaf5';
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- per-frame ---------------- */

  function frame(dt) {
    updateLabels(dt);
    const mode = NH.cfg.get('hud');
    if (mode === 'arrows') updateArrows(dt);
    else if (mode === 'compass') updateCompass();
    else if (mode === 'radar') updateRadar();

    if (NH.cfg.get('fps')) {
      fpsBox.hidden = false;
      if (dt > 0) fpsAvg += (1 / dt - fpsAvg) * 0.08;
      fpsBox.textContent = Math.round(fpsAvg) + ' fps · ' +
        NH.World.cells.w + '×' + NH.World.cells.h + ' cells';
    } else {
      fpsBox.hidden = true;
    }
  }

  function dropHint() {
    if (hintHidden) return;
    hintHidden = true;
    hint.classList.add('gone');
    setTimeout(function () { hint.hidden = true; }, 700);
  }

  /* ---------------- body classes from config ---------------- */

  function applyConfig() {
    const b = document.body;
    ['paper', 'card', 'terminal'].forEach(function (v) {
      b.classList.toggle('panel-' + v, NH.cfg.get('panel') === v);
    });
    ['radar', 'arrows', 'compass', 'off'].forEach(function (v) {
      b.classList.toggle('hud-' + v, NH.cfg.get('hud') === v);
    });
    Object.keys(arrows).forEach(function (k) { arrows[k].style.display = 'none'; });
    compassItems.forEach(function (el) { el.style.display = 'none'; });
  }

  /* ---------------- wiring ---------------- */

  function routeFromHash() {
    const id = (location.hash || '').replace('#', '');
    return NH.Flight.markById(id) ? id : null;
  }

  function init() {
    applyConfig();
    NH.on('config', applyConfig);

    NH.on('arrive', openSheet);
    NH.on('depart', function () { closeSheet(); });

    document.getElementById('panel-close').addEventListener('click', function () {
      NH.Flight.depart('close');
    });

    Array.prototype.forEach.call(quicknav.querySelectorAll('button[data-fly]'), function (b) {
      b.addEventListener('click', function () {
        dropHint();
        NH.Flight.flyTo(b.dataset.fly);
      });
    });

    window.addEventListener('hashchange', function () {
      const h = location.hash || '';
      if (h === hashWeSet) return;          // our own replaceState echo
      const id = routeFromHash();
      if (id) NH.Flight.flyTo(id);
      else if (openId) NH.Flight.depart('hash');
    });

    window.addEventListener('keydown', function (e) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') { NH.Flight.depart('esc'); return; }
      if (e.key === 'h' || e.key === 'H') { dropHint(); NH.Flight.flyTo('home'); return; }
      const n = ['1', '2', '3'].indexOf(e.key);
      if (n >= 0 && NH.MARKS[n]) { dropHint(); NH.Flight.flyTo(NH.MARKS[n].id); }
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].indexOf(e.key) >= 0) dropHint();
    });
    window.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.id === 'world') dropHint();
    });
    setTimeout(dropHint, 11000);

    // A deep link should land on the beacon, not fly in from off-screen.
    const start = routeFromHash();
    if (start) {
      NH.Flight.placeAt(start);
    } else if (window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      /* The opening fly-in is a nice touch but it is also a
         two-second wait before any words appear. Anyone who has
         asked for less motion gets the words straight away. */
      NH.Flight.placeAt('home');
    }
  }

  return { init: init, frame: frame, dropHint: dropHint, get openId() { return openId; } };
})();
