/* ui.js — the sheets, the addresses and the keys.

   The HUD is in hud.js. This file controls each part with words in
   it. It also keeps the address in step with the plane. */
window.NH = window.NH || {};
NH.sheetOpen = false;

NH.UI = (function () {
  const panel = document.getElementById('panel');
  const hint = document.getElementById('hint');
  const fpsBox = document.getElementById('fps');
  const quicknav = document.getElementById('quicknav');
  const help = document.getElementById('help');
  const announce = document.getElementById('announce');

  const PANEL_SKINS = ['paper', 'card', 'terminal', 'blueprint'];
  const HUD_MODES = ['radar', 'arrows', 'compass', 'off'];

  let openId = null;
  let hashWeSet = '';
  let hintHidden = false;
  let fpsAvg = 60;

  /* ---------------- sheets ---------------- */

  function openSheet(id) {
    openId = id;
    NH.sheetOpen = true;
    panel.hidden = false;
    /* Start the entry animation again. One sheet can replace
       another while the element stays in the DOM. */
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

    const mark = NH.Flight.markById(id);
    if (announce && mark) announce.textContent = 'Arrived at ' + mark.name + '.';
  }

  function closeSheet() {
    openId = null;
    NH.sheetOpen = false;
    panel.hidden = true;
    setHash('');
    syncNav();
    document.body.classList.remove('sheet-open');
    if (announce) announce.textContent = 'Flying.';
  }

  /* Use replaceState, and not location.hash. It changes the
     address bar and sends no hashchange event. Thus a flight of
     our own never looks like a request from the person. */
  function setHash(h) {
    hashWeSet = h;
    try { history.replaceState(null, '', location.pathname + location.search + h); }
    catch (e) { /* file:// */ }
  }

  function syncNav() {
    Array.prototype.forEach.call(quicknav.querySelectorAll('button[data-fly]'), function (b) {
      b.setAttribute('aria-current', String(b.dataset.fly === openId));
    });
  }

  /* ---------------- help ---------------- */

  let helpOpener = null;

  function toggleHelp(force) {
    const show = force === undefined ? help.hidden : force;
    help.hidden = !show;
    if (show) {
      /* Keep the element that had the focus. The close step then
         gives the focus back to it. If it does not, a person with
         a keyboard goes to the top of the page each time. */
      helpOpener = document.activeElement;
      const close = help.querySelector('.help-close');
      if (close) close.focus();
    } else if (helpOpener && helpOpener.focus) {
      helpOpener.focus();
      helpOpener = null;
    }
  }

  /* ---------------- per-frame ---------------- */

  function frame(dt) {
    NH.Hud.frame(dt);

    if (NH.cfg.v.fps) {
      fpsBox.hidden = false;
      if (dt > 0) fpsAvg += (1 / dt - fpsAvg) * 0.08;
      const st = NH.World.stats;
      const total = st.passesRun + st.passesSkipped;
      fpsBox.textContent = Math.round(fpsAvg) + ' fps · ' +
        NH.World.cells.w + '×' + NH.World.cells.h + ' cells · terrain pass skipped ' +
        (total ? Math.round(st.passesSkipped / total * 100) : 0) + '%';
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
    PANEL_SKINS.forEach(function (v) { b.classList.toggle('panel-' + v, NH.cfg.v.panel === v); });
    HUD_MODES.forEach(function (v) { b.classList.toggle('hud-' + v, NH.cfg.v.hud === v); });
    NH.Hud.reset();
  }

  /* ---------------- start-up ---------------- */

  function routeFromHash() {
    const id = (location.hash || '').replace('#', '');
    return NH.Flight.markById(id) ? id : null;
  }

  function onKey(e) {
    if (NH.util.typing()) return;
    if (e.key === 'Escape') {
      if (!help.hidden) { toggleHelp(false); return; }
      NH.Flight.depart('esc');
      return;
    }
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); toggleHelp(); return; }
    if (e.key === 'h' || e.key === 'H') { dropHint(); NH.Flight.flyTo('home'); return; }
    const n = ['1', '2', '3'].indexOf(e.key);
    if (n >= 0 && NH.MARKS[n]) { dropHint(); NH.Flight.flyTo(NH.MARKS[n].id); return; }
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].indexOf(e.key) >= 0) dropHint();
  }

  /* The default hint names keys. That is wrong on a phone. A
     coarse pointer shows that there is no keyboard. So tell the
     person the gesture that works there. */
  function tuneHintForTouch() {
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
    hint.innerHTML = 'hold anywhere to fly &middot; reach a beacon';
  }

  function init() {
    tuneHintForTouch();
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-help-toggle]'), function (b) {
      b.addEventListener('click', function () { toggleHelp(); });
    });
    help.addEventListener('click', function (e) {
      if (e.target === help) toggleHelp(false);
    });

    window.addEventListener('hashchange', function () {
      if ((location.hash || '') === hashWeSet) return;   // our own replaceState echo
      const id = routeFromHash();
      if (id) NH.Flight.flyTo(id);
      else if (openId) NH.Flight.depart('hash');
    });

    window.addEventListener('keydown', onKey);
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
      /* The first flight looks good, but it also makes you wait
         two seconds for the first words. A person who asks for
         less motion gets the words immediately. */
      NH.Flight.placeAt('home');
    }
  }

  return { init: init, frame: frame, get openId() { return openId; } };
})();
