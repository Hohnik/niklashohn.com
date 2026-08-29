/* ============================================================
   main.js — start everything and run the frame loop.
   ============================================================ */
window.NH = window.NH || {};

(function () {
  const canvas = document.getElementById('world');

  /* A fixed seed by default: the landscape should be the same one
     every time you visit, so the route to a beacon is something
     you can actually learn. Dev mode can re-roll it. */
  NH.seed = { x: 41.7, y: 13.2 };
  NH.newWorld = function () {
    NH.seed = { x: Math.random() * 900, y: Math.random() * 900 };
    NH.World.invalidate();
  };

  if (!NH.World.init(canvas)) {
    /* No map means nothing to fly, so the page becomes what it
       would have been without the idea: the three sheets, stacked
       and scrollable. Everything that only makes sense with a
       plane in the air is hidden by the no-gl class in the CSS
       rather than by poking inline styles from here. */
    document.body.classList.add('no-gl', 'panel-paper');
    const fail = document.getElementById('glfail');
    fail.hidden = false;
    if (NH.World.error) {
      const p = document.createElement('p');
      p.className = 'quiet';
      p.textContent = NH.World.error;
      fail.appendChild(p);
    }
    document.getElementById('panel').hidden = false;
    NH.MARKS.forEach(function (m) {
      const d = document.getElementById('doc-' + m.id);
      if (d) d.classList.add('on');
    });
    NH.Projects.init();
    NH.Projects.refresh();
    return;
  }

  /* A ?look=... link opens the page with someone else's settings.
     It is applied after the stored ones so the link wins, and it
     is only trusted if it decodes cleanly against the current
     registry. */
  const look = new URLSearchParams(location.search).get('look');
  if (look) NH.cfg.decode(look);

  /* Saving the canvas has to happen in the same task as the draw:
     the drawing buffer is not preserved, so by the next tick it is
     already gone. The flag is read at the bottom of the frame. */
  let captureWanted = false;
  NH.capture = function () { captureWanted = true; };
  function runCapture() {
    captureWanted = false;
    let url;
    try { url = canvas.toDataURL('image/png'); } catch (e) { return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = 'niklashohn-' + NH.cfg.encode() + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  NH.Flight.bind(canvas);
  NH.Projects.init();
  NH.UI.init();
  NH.DevBar.init();

  NH.on('config', function (key) {
    /* Cell size and lift both change how big the offscreen height
       texture has to be, so they need a rebuild rather than just a
       different uniform. */
    if (key === 'pixel' || key === 'lift' || key === 'view' || key === '*') NH.World.resize();
  });

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    /* The browser fires resize continuously while a window edge is
       dragged; rebuilding the height texture on every one of those
       is pure waste. Wait until the size has been still. */
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { NH.World.resize(); }, 120);
  });

  let last = performance.now();
  function frame(now) {
    /* Clamp dt so a backgrounded tab does not resume with the
       plane teleported halfway across the map. */
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    NH.Flight.update(dt);

    const st = NH.Flight.state;
    const pulse = (Math.sin(now / 620) + 1) / 2;
    const marks = NH.MARKS.map(function (m) {
      const near = Math.hypot(st.pos.x - m.world.x, st.pos.y - m.world.y) < NH.DEPART * 2;
      return { x: m.world.x, y: m.world.y, glow: near ? pulse : pulse * 0.55 };
    });

    NH.World.render({
      time: now / 1000,
      cam: st.cam,
      plane: { x: st.pos.x, y: st.pos.y, heading: st.heading, bank: st.bank },
      marks: marks,
      trail: st.trail,
      seed: NH.seed
    });
    NH.UI.frame(dt);
    if (captureWanted) runCapture();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
