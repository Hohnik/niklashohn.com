/* hud.js — four ways to find a beacon that you cannot see.

   The radar, the edge arrows and the compass strip give three
   answers to the same question. Dev mode selects one of them. The
   fourth option is Off, for a person who wants only the map.

   Each function here runs one time in each frame. So obey two
   rules. Do not read the layout and write it in the same step. Do
   not write text 60 times a second when 8 times is enough. */
window.NH = window.NH || {};

NH.Hud = (function () {
  const labelsBox = document.getElementById('labels');
  const arrowsBox = document.getElementById('arrows');
  const compassStrip = document.querySelector('.compass-strip');
  const radar = document.getElementById('radar');

  const labels = {};
  const arrows = {};
  const compassItems = [];
  let radarCtx = null;
  let labelClock = 0, arrowClock = 0, compassClock = 0, retextArrows = true;

  const RADAR_RANGE = 460;   // world cells from the middle to the rim
  const rect = { l: 0, r: 0, t: 0, b: 0 };   // written on each frame
  let devOn = false;
  const TEXT_EVERY = 0.125;  // seconds between text rewrites

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

  function updateLabels(dt) {
    const on = NH.cfg.v.labels;
    const p = NH.Flight.state.pos;
    labelClock += dt;
    const retext = labelClock >= TEXT_EVERY;
    if (retext) labelClock = 0;

    NH.MARKS.forEach(function (m) {
      const el = ensureLabel(m);
      if (!on) { el.style.display = 'none'; return; }
      /* Each beacon stands on a cone that reaches the top
         level. So the drawn height is exact. This code does not
         ask the GPU for the height of the ground. */
      const s = NH.Flight.project(m.world, NH.LEVELS);
      const W = window.innerWidth, H = window.innerHeight;
      /* Put a label only on a beacon with its top on the
         screen. For the other beacons the HUD is enough. A label
         at the edge, for a beacon that you cannot see, adds
         nothing to the arrow that is already there. */
      if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';

      if (retext || !el._w) {
        const dist = Math.round(Math.hypot(p.x - m.world.x, p.y - m.world.y));
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
      /* Then keep the whole label on the screen. A label that
         goes past the edge loses the half with the distance in
         it. That is the half that a person reads. */
      const halfW = el._w / 2 + 8;
      const x = NH.util.clamp(s.x, halfW, W - halfW);
      const y = NH.util.clamp(top, el._h + 8, H - 8);
      /* Use a transform, and not left and top. The browser
         composites a transform and does not touch the layout. */
      el.style.transform = 'translate(-50%, -100%) translate(' +
        Math.round(x) + 'px,' + Math.round(y) + 'px)';
      el.style.opacity = (x !== s.x || y !== top) ? '.6' : '1';
    });
  }

  /* ---------------- edge arrows ---------------- */

  function ensureArrow(mark) {
    if (arrows[mark.id]) return arrows[mark.id];
    const el = document.createElement('div');
    el.className = 'arrow';
    el.innerHTML = '<i></i><em></em>';
    arrowsBox.appendChild(el);
    arrows[mark.id] = el;
    return el;
  }

  function updateArrows(dt) {
    arrowClock += dt;
    retextArrows = arrowClock >= TEXT_EVERY;
    if (retextArrows) arrowClock = 0;

    const p = NH.Flight.state.pos;
    const W = window.innerWidth, H = window.innerHeight;
    const cx = W / 2, cy = H / 2;
    const padX = Math.min(70, W * 0.12);
    const padY = Math.min(70, H * 0.14);
    /* The dev bar owns the top strip and the quick nav owns the
       bottom one, and both are above the HUD. So the box is not
       the same on all four sides. */
    rect.l = padX;
    rect.r = W - padX;
    rect.t = padY + (devOn ? 130 : 0);
    rect.b = H - padY - 34;

    NH.MARKS.forEach(function (m) {
      const el = ensureArrow(m);
      const s = NH.Flight.project(m.world, NH.LEVELS);
      if (s.x > rect.l && s.x < rect.r && s.y > rect.t && s.y < rect.b) {
        el.style.display = 'none';
        return;
      }
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

  /* ---------------- compass strip ---------------- */

  /* The strip shows the four cardinal points and the three
     beacons. This code makes the entries one time and then writes
     into them, because the function runs on each frame. */
  const compassEntries = [
    { label: 'N', card: true, bearing: Math.PI / 2 },
    { label: 'E', card: true, bearing: 0 },
    { label: 'S', card: true, bearing: -Math.PI / 2 },
    { label: 'W', card: true, bearing: Math.PI }
  ];
  NH.MARKS.forEach(function (m) {
    compassEntries.push({ label: m.name, card: false, bearing: 0, mark: m });
  });

  function updateCompass(dt) {
    const FOV = 1.25;                       // radians each side of the nose
    const w = compassStrip.parentElement.clientWidth;
    const heading = NH.Flight.state.heading;
    const p = NH.Flight.state.pos;

    compassClock += dt;
    const retext = compassClock >= TEXT_EVERY;
    if (retext) compassClock = 0;

    for (let i = 0; i < compassEntries.length; i++) {
      const e = compassEntries[i];
      if (e.mark) {
        e.bearing = Math.atan2(e.mark.world.y - p.y, e.mark.world.x - p.x);
      }
      let el = compassItems[i];
      if (!el) {
        el = document.createElement('span');
        el.className = 'compass-tick' + (e.card ? ' card' : '');
        compassStrip.appendChild(el);
        compassItems[i] = el;
      }
      const rel = NH.util.angleDelta(heading, e.bearing);
      if (Math.abs(rel) > FOV) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = (w / 2 + (rel / FOV) * (w / 2 - 12)) + 'px';
      el.style.opacity = String(1 - Math.abs(rel) / FOV * 0.65);
      if (retext) {
        el.textContent = e.mark
          ? e.label + ' ' + Math.round(Math.hypot(p.x - e.mark.world.x, p.y - e.mark.world.y))
          : e.label;
      }
    }
  }

  /* ---------------- radar ---------------- */

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

  /* ---------------- entry points ---------------- */

  function frame(dt) {
    updateLabels(dt);
    const mode = NH.cfg.v.hud;
    if (mode === 'arrows') updateArrows(dt);
    else if (mode === 'compass') updateCompass(dt);
    else if (mode === 'radar') updateRadar();
  }

  /* Remove by hand each item that the previous HUD left on the
     screen. The CSS hides only the container. It does not hide
     the children inside it, which have absolute positions. */
  function reset() {
    /* The CSS hides the container of the HUD that is off. It
       does not hide the children inside it. This code gives each
       child its own position. */
    Object.keys(arrows).forEach(function (k) { arrows[k].style.display = 'none'; });
    compassItems.forEach(function (el) { el.style.display = 'none'; });
  }

  /* The dev bar tells the HUD when it opens, so that the arrows
     keep clear of it. A test of the class on each frame would read
     the DOM sixty times a second to learn something that changes
     when a person clicks. */
  function devMode(on) { devOn = on; }

  return { frame: frame, reset: reset, devMode: devMode };
})();
