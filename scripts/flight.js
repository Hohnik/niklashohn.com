/* ============================================================
   flight.js — the paper plane, and therefore the navigation.

   There are no links to click to move around: the plane IS the
   cursor. Fly within ARRIVE cells of a landmark and it slips
   into a slow orbit, the camera settles on the mountain and the
   sheet for that landmark opens. Touch the controls again and it
   peels off and the sheet closes. Everything else — the quick
   nav, the #hash links, the keyboard shortcuts — is just
   autopilot handing the same two moves to the same state machine,
   so there is only ever one way to arrive somewhere.
   ============================================================ */
window.NH = window.NH || {};

NH.Flight = (function () {
  const SPEED = 70;        // cells per second
  const BOOST = 1.9;
  const TURN = 2.3;        // radians per second
  const ORBIT_R = 36;
  const ORBIT_W = 0.6;     // radians per second around a landmark
  const TRAIL_EVERY = 0.055;
  const RANGE = 1200;      // beyond this the map gently steers you back
  const LOOK_AHEAD = 58;   // cells the 'lead' camera runs in front of the nose

  const state = {
    pos: { x: 0, y: -323 },
    heading: Math.PI / 2,
    bank: 0,               // radians of roll, from how hard it is turning
    cam: { x: 0, y: 0 },
    mode: 'fly',           // 'fly' | 'orbit'
    at: null,              // landmark id being orbited
    auto: null,            // landmark id the autopilot is aiming for
    orbitAngle: 0,
    trail: [],
    trailClock: 0,
    suppress: {},          // landmark ids that must be left before re-arming
    camReady: false
  };

  const keys = {};
  let pointer = null;      // {x,y} in CSS pixels, while a pointer is steering
  let pointerHeld = false;

  function markById(id) {
    for (let i = 0; i < NH.MARKS.length; i++) if (NH.MARKS[i].id === id) return NH.MARKS[i];
    return null;
  }

  const angleDelta = NH.util.angleDelta;
  const typing = NH.util.typing;

  /* -1 = right, +1 = left, 0 = none. */
  function steerInput() {
    if (typing()) return 0;
    let s = 0;
    if (keys.ArrowLeft || keys.a) s += 1;
    if (keys.ArrowRight || keys.d) s -= 1;
    return s;
  }
  function thrustInput() {
    if (typing()) return 0;
    let t = 0;
    if (keys.ArrowUp || keys.w) t += 1;
    if (keys.ArrowDown || keys.s) t -= 1;
    return t;
  }
  function boosting() { return !typing() && (!!keys.Shift || thrustInput() > 0); }

  function lift() { return NH.cfg.get('view') === 'flat' ? 0 : NH.cfg.get('lift'); }

  /* Where the camera wants to be, in world cells, for the bottom
     left of the screen. */
  function camTarget() {
    const c = NH.World.cells;
    const L = lift();
    if (state.mode === 'orbit') {
      const m = markById(state.at);
      if (m) {
        /* Frame the landmark's drawn peak rather than its map
           position, otherwise the mountain sits off the top. And
           lean the view away from wherever the sheet is docked —
           left of the screen on wide viewports, along the bottom
           on narrow ones — so the beacon you flew to stays in
           sight while you read about it. */
        let ox = 0, oy = 0;
        if (NH.sheetOpen) {
          const w = window.innerWidth;
          if (w >= 960) ox = c.w * 0.17;          // sheet docked left
          else if (w <= 640) oy = c.h * 0.17;     // sheet is a bottom drawer
          else oy = c.h * 0.28;                   // sheet centred, tallest of the three
        }
        return {
          x: m.world.x - c.w / 2 - ox,
          y: m.world.y - c.h / 2 + NH.LEVELS * L * 0.62 - oy
        };
      }
    }
    /* Mid-height terrain is the common case, so leaning the
       camera by that much keeps the plane near the middle of the
       screen instead of riding the top edge. */
    let ax = 0, ay = 0;
    if (NH.cfg.get('camera') === 'lead') {
      /* Look where you are going: push the view ahead along the
         heading so there is more map in front of the nose than
         behind the tail. */
      ax = Math.cos(state.heading) * LOOK_AHEAD;
      ay = Math.sin(state.heading) * LOOK_AHEAD;
    }
    return {
      x: state.pos.x - c.w / 2 + ax,
      y: state.pos.y - c.h / 2 + (14 + NH.HOVER) * L + ay
    };
  }

  /* How hard the camera chases its target, per control mode. */
  function camStiffness() {
    if (state.mode === 'orbit') return 3.2;
    return NH.cfg.get('camera') === 'lazy' ? 2.4 : 6.5;
  }

  function pushTrail(dt) {
    state.trailClock += dt;
    for (let i = 0; i < state.trail.length; i++) state.trail[i].life -= dt * 0.85;
    while (state.trail.length && state.trail[state.trail.length - 1].life <= 0) state.trail.pop();
    if (state.trailClock >= TRAIL_EVERY) {
      state.trailClock = 0;
      state.trail.unshift({ x: state.pos.x, y: state.pos.y, life: 1 });
      if (state.trail.length > NH.World.trailSlots) state.trail.length = NH.World.trailSlots;
    }
  }

  function arrive(mark) {
    state.mode = 'orbit';
    state.at = mark.id;
    state.auto = null;
    const dx = state.pos.x - mark.world.x, dy = state.pos.y - mark.world.y;
    state.orbitAngle = Math.atan2(dy, dx);
    NH.emit('arrive', mark.id);
  }

  function depart(reason) {
    if (state.mode !== 'orbit') return;
    const id = state.at;
    state.suppress[id] = true;   // cleared once we are DEPART cells away
    state.mode = 'fly';
    state.at = null;
    NH.emit('depart', { id: id, reason: reason || 'input' });
  }

  function flyTo(id) {
    const m = markById(id);
    if (!m) return;
    if (state.mode === 'orbit') {
      if (state.at === id) return;
      depart('nav');
    }
    delete state.suppress[id];
    state.auto = id;
    NH.emit('heading-to', id);
  }

  /* Drop the plane straight onto a landmark — used for deep links,
     where flying in from off-screen would just look like a bug. */
  function placeAt(id) {
    const m = markById(id);
    if (!m) return;
    state.pos.x = m.world.x + ORBIT_R;
    state.pos.y = m.world.y;
    state.heading = Math.PI / 2;
    state.camReady = false;
    arrive(m);
  }

  function pointerWorld() {
    if (!pointer) return null;
    const c = NH.World.cells;
    return {
      x: state.cam.x + pointer.x / c.pixel,
      y: state.cam.y + (c.h - pointer.y / c.pixel)
    };
  }

  function steerToward(target, dt, allowBoost) {
    const dx = target.x - state.pos.x, dy = target.y - state.pos.y;
    const dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const d = angleDelta(state.heading, want);
    const rate = TURN * dt;
    state.heading += Math.max(-rate, Math.min(rate, d));
    /* Boosting near the goal would make the turn circle wider
       than the arrival radius, and the plane would loop around
       the landmark forever without ever landing on it. */
    return dist > 160 && allowBoost ? BOOST : 1;
  }

  function update(dt) {
    const headingWas = state.heading;
    const steer = steerInput();
    const manual = steer !== 0 || (pointerHeld && pointer);

    if (state.mode === 'orbit') {
      if (manual) depart('input');
    }

    if (state.mode === 'orbit') {
      const m = markById(state.at);
      state.orbitAngle += ORBIT_W * dt;
      state.pos.x = m.world.x + Math.cos(state.orbitAngle) * ORBIT_R;
      state.pos.y = m.world.y + Math.sin(state.orbitAngle) * ORBIT_R;
      state.heading = state.orbitAngle + Math.PI / 2;
    } else {
      let speedMul = 1;

      if (manual) {
        state.auto = null;
        if (NH.cfg.get('control') === 'direct' && !pointerHeld) {
          /* 8-way: build a velocity from the keys and let the nose
             swing round to match it. */
          let vx = 0, vy = 0;
          if (keys.ArrowLeft || keys.a) vx -= 1;
          if (keys.ArrowRight || keys.d) vx += 1;
          if (keys.ArrowUp || keys.w) vy += 1;
          if (keys.ArrowDown || keys.s) vy -= 1;
          if (vx || vy) {
            const want = Math.atan2(vy, vx);
            const d = angleDelta(state.heading, want);
            const rate = TURN * 2.4 * dt;
            state.heading += Math.max(-rate, Math.min(rate, d));
          }
          if (keys.Shift) speedMul = BOOST;
        } else if (pointerHeld && pointer) {
          const w = pointerWorld();
          if (w) speedMul = steerToward(w, dt, true);
        } else {
          state.heading += steer * TURN * dt;
          if (boosting()) speedMul = BOOST;
        }
      } else if (state.auto) {
        const m = markById(state.auto);
        if (m) speedMul = steerToward(m.world, dt, true);
      } else if (NH.cfg.get('control') === 'chase' && pointer) {
        const w = pointerWorld();
        if (w) speedMul = steerToward(w, dt, true);
      } else if (boosting()) {
        speedMul = BOOST;
      }

      /* Soft boundary: past RANGE the plane is nudged back so you
         can never lose the landmarks in an endless noise field. */
      const far = Math.hypot(state.pos.x, state.pos.y);
      if (far > RANGE) {
        const home = Math.atan2(-state.pos.y, -state.pos.x);
        const pull = Math.min(1, (far - RANGE) / 400);
        state.heading += angleDelta(state.heading, home) * pull * dt * 1.6;
      }

      const v = SPEED * speedMul;
      state.pos.x += Math.cos(state.heading) * v * dt;
      state.pos.y += Math.sin(state.heading) * v * dt;

      // arrival / re-arming
      for (let i = 0; i < NH.MARKS.length; i++) {
        const m = NH.MARKS[i];
        const dist = Math.hypot(state.pos.x - m.world.x, state.pos.y - m.world.y);
        if (state.suppress[m.id]) {
          if (dist > NH.DEPART) delete state.suppress[m.id];
          continue;
        }
        if (dist < NH.ARRIVE) { arrive(m); break; }
      }
    }

    /* Roll into the turn. A real paper plane banks, and the wing
       it drops is foreshortened — the shader narrows the shape by
       cos(bank), which is what sells the turn as a turn rather
       than a spin on the spot. Smoothed, or it would snap. */
    const turnRate = dt > 0 ? angleDelta(headingWas, state.heading) / dt : 0;
    const wantBank = NH.util.clamp(turnRate * 0.45, -1.05, 1.05);
    state.bank += (wantBank - state.bank) * (1 - Math.exp(-7.0 * dt));

    state.heading = (state.heading % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    pushTrail(dt);

    const t = camTarget();
    if (!state.camReady) {
      state.cam.x = t.x; state.cam.y = t.y; state.camReady = true;
    } else {
      const k = 1 - Math.exp(-camStiffness() * dt);
      state.cam.x += (t.x - state.cam.x) * k;
      state.cam.y += (t.y - state.cam.y) * k;
    }
  }

  /* Project a world position to CSS pixels, for the DOM overlays.
     `liftLevels` is how far up the thing is drawn, in levels. */
  function project(world, liftLevels) {
    const c = NH.World.cells;
    const L = lift();
    const cx = world.x - state.cam.x;
    const cy = world.y - state.cam.y + (liftLevels || 0) * L;
    return { x: cx * c.pixel, y: (c.h - cy) * c.pixel, cellX: cx, cellY: cy };
  }

  function bind(canvas) {
    window.addEventListener('keydown', function (e) {
      keys[e.key] = true;
      if (e.key === 'Shift') keys.Shift = true;
      if (!typing() && [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
        e.preventDefault();     // stop the page from scrolling under the canvas
      }
    });
    window.addEventListener('keyup', function (e) {
      keys[e.key] = false;
      if (e.key === 'Shift') keys.Shift = false;
    });
    window.addEventListener('blur', function () {
      for (const k in keys) keys[k] = false;
      pointerHeld = false;
    });

    canvas.addEventListener('pointermove', function (e) {
      pointer = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerdown', function (e) {
      pointer = { x: e.clientX, y: e.clientY };
      pointerHeld = true;
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
    });
    const release = function () { pointerHeld = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', function () {
      pointerHeld = false;
      if (NH.cfg.get('control') !== 'chase') pointer = null;
    });
  }

  return {
    state: state,
    update: update,
    project: project,
    bind: bind,
    flyTo: flyTo,
    placeAt: placeAt,
    depart: depart,
    markById: markById,
    get keys() { return keys; }
  };
})();
