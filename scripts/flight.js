/* flight.js — the paper plane, and thus the movement.

   You do not click a link to move. The plane is the pointer.

   Fly to within ARRIVE cells of a beacon. The plane then starts a
   slow orbit, the camera stops on the mountain, and the sheet for
   that beacon opens. Touch a control again. The plane then leaves
   the orbit and the sheet closes.

   The quick nav, the #hash links and the keys all use the same
   two steps. The autopilot gives them to the same state machine.
   Thus there is only one way to get to a beacon. */
window.NH = window.NH || {};

NH.Flight = (function () {
  const SPEED = 70;        // cells per second
  const BOOST = 1.9;
  const TURN = 2.3;        // radians per second
  const ORBIT_R = 36;
  const ORBIT_W = 0.6;     // radians per second around a landmark
  const TRAIL_EVERY = 0.055;   // seconds between trail points
  const TRAIL_POINTS = 10;     // must match the array in the shader
  const RANGE = 1200;      // beyond this the map gently steers you back
  const LOOK_AHEAD = 58;   // cells the 'lead' camera runs in front of the nose

  /* One point for each slot that the shader can draw. This
     function makes them one time. The loop then writes into them,
     and it throws none of them away. */
  function makeTrail() {
    const out = [];
    for (let i = 0; i < TRAIL_POINTS; i++) out.push({ x: 0, y: 0, life: 0 });
    return out;
  }

  const state = {
    pos: { x: 0, y: -323 },
    heading: Math.PI / 2,
    bank: 0,               // radians of roll, from the rate of turn
    cam: { x: 0, y: 0 },
    mode: 'fly',           // 'fly' | 'orbit'
    at: null,              // the id of the beacon in the orbit
    auto: null,            // the id of the beacon for the autopilot
    orbitAngle: 0,
    trail: makeTrail(),
    trailClock: 0,
    suppress: {},          // beacon ids that need a departure first
    camReady: false
  };

  const keys = {};
  let pointer = null;      // {x,y} in CSS pixels, while a pointer turns the plane
  let pointerHeld = false;

  function markById(id) {
    for (let i = 0; i < NH.MARKS.length; i++) if (NH.MARKS[i].id === id) return NH.MARKS[i];
    return null;
  }

  const angleDelta = NH.util.angleDelta;
  const typing = NH.util.typing;

  /* A result of -1 is right, +1 is left, and 0 is no turn. */
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

  function lift() { return NH.cfg.v.view === 'flat' ? 0 : NH.cfg.v.lift; }

  /* Where the camera must be, in world cells, for the bottom left
     of the screen. The result goes into one object that this file
     keeps. The function runs on each frame, and a new object on
     each frame gives work to the garbage collector. */
  const camWant = { x: 0, y: 0 };

  function camTarget() {
    const c = NH.World.cells;
    const L = lift();
    if (state.mode === 'orbit') {
      const m = markById(state.at);
      if (m) {
        /* Put the drawn summit in the frame, and not the map
           position. If you use the map position, the mountain
           goes off the top of the screen.

           Then move the view away from the sheet. On a wide
           screen the sheet is at the left. On a narrow screen it
           is along the bottom. Thus the beacon stays in sight
           while you read about it. */
        let ox = 0, oy = 0;
        if (NH.sheetOpen) {
          const w = window.innerWidth;
          if (w >= 960) ox = c.w * 0.17;          // sheet at the left
          else if (w <= 640) oy = c.h * 0.17;     // sheet along the bottom
          else oy = c.h * 0.28;                   // sheet in the middle
        }
        camWant.x = m.world.x - c.w / 2 - ox;
        camWant.y = m.world.y - c.h / 2 + NH.LEVELS * L * 0.62 - oy;
        return camWant;
      }
    }
    /* Terrain of a middle height is the usual case. This offset
       keeps the plane near the middle of the screen. Without it,
       the plane goes to the top edge. */
    let ax = 0, ay = 0;
    if (NH.cfg.v.camera === 'lead') {
      /* Look where you go. Put the view in front of the nose. */
      ax = Math.cos(state.heading) * LOOK_AHEAD;
      ay = Math.sin(state.heading) * LOOK_AHEAD;
    }
    camWant.x = state.pos.x - c.w / 2 + ax;
    camWant.y = state.pos.y - c.h / 2 + (14 + NH.HOVER) * L + ay;
    return camWant;
  }

  /* How quickly the camera follows its target. */
  function camStiffness() {
    if (state.mode === 'orbit') return 3.2;
    return NH.cfg.v.camera === 'lazy' ? 2.4 : 6.5;
  }

  /* The trail is a fixed set of points. The loop writes into
     them. The list does not grow, and it does not get shorter. A
     point with a life of 0 or less is off. */
  function pushTrail(dt) {
    const trail = state.trail;
    for (let i = 0; i < trail.length; i++) trail[i].life -= dt * 0.85;

    state.trailClock += dt;
    if (state.trailClock < TRAIL_EVERY) return;
    state.trailClock = 0;

    /* Move each point back one slot. Then write the new point
       into the front. The list holds ten points, so this costs
       less than a new object for each point. */
    for (let i = trail.length - 1; i > 0; i--) {
      trail[i].x = trail[i - 1].x;
      trail[i].y = trail[i - 1].y;
      trail[i].life = trail[i - 1].life;
    }
    trail[0].x = state.pos.x;
    trail[0].y = state.pos.y;
    trail[0].life = 1;
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

  /* Put the plane on a beacon immediately. A direct link uses
     this. A flight from off the screen would look like a fault. */
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
    /* Do not increase the speed near the goal. The turn circle
       would then be wider than the arrival radius. The plane
       would go round the beacon and never reach it. */
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
        if (NH.cfg.v.control === 'direct' && !pointerHeld) {
          /* Eight directions. Make a velocity from the keys. The
             nose then turns to that direction. */
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
      } else if (NH.cfg.v.control === 'chase' && pointer) {
        const w = pointerWorld();
        if (w) speedMul = steerToward(w, dt, true);
      } else if (boosting()) {
        speedMul = BOOST;
      }

      /* A soft edge. Past RANGE the map turns the plane back.
         Thus you cannot lose the beacons in an endless field of
         noise. */
      const far = Math.hypot(state.pos.x, state.pos.y);
      if (far > RANGE) {
        const home = Math.atan2(-state.pos.y, -state.pos.x);
        const pull = Math.min(1, (far - RANGE) / 400);
        state.heading += angleDelta(state.heading, home) * pull * dt * 1.6;
      }

      const v = SPEED * speedMul;
      state.pos.x += Math.cos(state.heading) * v * dt;
      state.pos.y += Math.sin(state.heading) * v * dt;

      // arrival, and the release of a beacon after a departure
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

    /* Roll into the turn. A real paper plane rolls, and the
       lower wing then looks shorter. The shader makes the shape
       more narrow by cos(roll).

       Thus the turn looks like a turn, and not like a spin on the
       spot. The value changes slowly, or the plane would jump. */
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

  /* Put a world position into CSS pixels, for the overlays in the
     DOM. The value `liftLevels` gives the lift of the item, in
     levels. The result goes into one object that this file keeps.
     Read the result before you call this function again. */
  const projected = { x: 0, y: 0 };

  function project(world, liftLevels) {
    const c = NH.World.cells;
    const cy = world.y - state.cam.y + (liftLevels || 0) * lift();
    projected.x = (world.x - state.cam.x) * c.pixel;
    projected.y = (c.h - cy) * c.pixel;
    return projected;
  }

  function bind(canvas) {
    window.addEventListener('keydown', function (e) {
      keys[e.key] = true;
      if (e.key === 'Shift') keys.Shift = true;
      if (!typing() && [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
        e.preventDefault();     // hold the page still below the canvas
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
      if (NH.cfg.v.control !== 'chase') pointer = null;
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
    markById: markById
  };
})();
