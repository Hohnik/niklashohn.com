/* main.js — the start-up steps and the frame loop. */
window.NH = window.NH || {};

(function () {
  const canvas = document.getElementById('world');

  /* This seed does not change. Each visit gives the same
     landscape. Thus you can learn the route to a beacon. Dev mode
     makes a new seed. */
  NH.seed = { x: 41.7, y: 13.2 };
  NH.newWorld = function () {
    NH.seed = { x: Math.random() * 900, y: Math.random() * 900 };
    NH.World.invalidate();
  };

  if (!NH.World.init(canvas)) {
    /* With no map there is nothing to fly. So the page becomes
       three sheets, one after the other, and you scroll them.

       The no-gl class in the CSS hides each part that needs a
       plane in the air. This function does not set a style. */
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

  /* A ?look= link opens the page with the settings of a different
     person. This code runs after the browser reads its own stored
     settings, so the link wins. The site uses the link only when
     it decodes correctly against the registry. */
  const look = new URLSearchParams(location.search).get('look');
  if (look) NH.cfg.decode(look);

  /* The save of the canvas must occur in the same task as the
     draw. The browser does not keep the draw buffer, so the pixels
     are gone at the next tick. The frame loop tests this flag at
     the end of the frame. */
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

  /* The loop compares this to a squared distance. Thus it needs
     no square root. */
  const NEAR_SQ = (NH.DEPART * 2) * (NH.DEPART * 2);

  NH.Flight.bind(canvas);
  NH.Projects.init();
  NH.UI.init();
  NH.DevBar.init();

  NH.on('config', function (key) {
    /* The cell size and the lift both change how large the
       offscreen height texture must be. They need a rebuild, not
       only a different uniform. */
    if (key === 'pixel' || key === 'lift' || key === 'view' || key === '*') NH.World.resize();
    NH.World.settingsChanged();
  });

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    /* The browser sends many resize events while a person moves
       the edge of the window. To make the height texture again for
       each one is waste. So wait until the size is stable. */
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { NH.World.resize(); }, 120);
  });

  /* The frame loop makes no new object. This code makes each
     object here one time. The loop then writes into them.

     A new object for each of these, 60 times a second, gives work
     to the garbage collector. That work causes a pause that you
     can see. */
  const marks = NH.MARKS.map(function (m) { return { x: m.world.x, y: m.world.y, glow: 0 }; });
  const scene = {
    time: 0,
    cam: null,
    plane: { x: 0, y: 0, heading: 0, bank: 0 },
    marks: marks,
    trail: null,
    seed: NH.seed
  };

  let last = performance.now();

  function frame(now) {
    /* Keep dt small. A tab that comes back after a minute must
       not put the plane on the other side of the map. */
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    NH.Flight.update(dt);

    const st = NH.Flight.state;
    const pulse = (Math.sin(now / 620) + 1) / 2;
    for (let i = 0; i < marks.length; i++) {
      const w = NH.MARKS[i].world;
      const dx = st.pos.x - w.x, dy = st.pos.y - w.y;
      const near = dx * dx + dy * dy < NEAR_SQ;
      marks[i].glow = near ? pulse : pulse * 0.55;
    }

    scene.time = now / 1000;
    scene.cam = st.cam;
    scene.plane.x = st.pos.x;
    scene.plane.y = st.pos.y;
    scene.plane.heading = st.heading;
    scene.plane.bank = st.bank;
    scene.trail = st.trail;
    scene.seed = NH.seed;

    NH.World.render(scene);
    NH.UI.frame(dt);
    if (captureWanted) runCapture();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
