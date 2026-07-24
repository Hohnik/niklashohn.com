// Isometric pixel rain over a water plane.
//
// The whole page is treated as water seen at a shallow angle: the BOTTOM of the
// screen is "near" and the TOP is "far". Raindrops fall and, at each pixel they
// pass, have a probability of hitting the surface — that probability grows as
// they get lower (nearer), so far/high landings are rare and there is visibly
// "more space" to fall through up top. Where a drop lands it spawns an
// ELLIPTICAL ripple (flatter and smaller the further away it is), because we're
// looking across the water rather than straight down.
//
// Everything is drawn into a small offscreen buffer and blitted up with
// nearest-neighbour scaling, so it stays chunky pixel art. Other scripts can
// subscribe via rainScene.onLanding(cb) — used to reveal a gravestone per drop.

class RainScene {
  constructor() {
    this.canvas = document.getElementById("rainCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.PIXEL = 4; // size of one chunky pixel, in screen px
    this.buf = document.createElement("canvas");
    this.bctx = this.buf.getContext("2d");

    this.drops = [];
    this.ripples = [];
    this.landingCbs = [];

    this.lastTime = performance.now();

    // Water palette (theme purple #9a84cc), far/hazy at top -> deep at bottom.
    this.waterFar = [166, 147, 214];
    this.waterNear = [120, 99, 176];

    this.resize();
    window.addEventListener("resize", () => this.resize());
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.bw = Math.ceil(this.W / this.PIXEL);
    this.bh = Math.ceil(this.H / this.PIXEL);
    this.buf.width = this.bw;
    this.buf.height = this.bh;
    this.ctx.imageSmoothingEnabled = false;
    this.bctx.imageSmoothingEnabled = false;

    // Populate drops relative to screen size.
    const target = Math.round(this.bw / 7);
    this.drops = [];
    for (let i = 0; i < target; i++) this.drops.push(this.newDrop(true));
  }

  // 0 at the top (far) .. 1 at the bottom (near). Buffer-space y.
  depthAtBuf(by) {
    return Math.min(1, Math.max(0, by / this.bh));
  }
  // Screen-space convenience for other scripts.
  depthAt(screenY) {
    return Math.min(1, Math.max(0, screenY / this.H));
  }

  newDrop(scatter) {
    return {
      x: Math.floor(Math.random() * this.bw),
      y: scatter ? Math.random() * this.bh : -Math.random() * this.bh * 0.5,
      vy: 0.9 + Math.random() * 0.9, // buffer px per frame-ish (scaled by dt)
      len: 2 + Math.floor(Math.random() * 3),
    };
  }

  onLanding(cb) {
    this.landingCbs.push(cb);
  }

  land(bx, by) {
    const depth = this.depthAtBuf(by);
    // Ripple grows/flattens with perspective: big & rounder near, tiny & flat far.
    this.ripples.push({
      x: bx,
      y: by,
      t: 0,
      dur: 0.6 + depth * 0.7,
      maxR: 1.5 + depth * 9,
      flat: 0.30 + depth * 0.32, // ry / rx
      rings: depth > 0.45 ? 2 : 1,
    });
    if (this.ripples.length > 240) this.ripples.shift();

    const screen = { x: bx * this.PIXEL, y: by * this.PIXEL, depth };
    for (const cb of this.landingCbs) cb(screen);
  }

  loop(now) {
    let dt = (now - this.lastTime) / 16.67; // ~frames elapsed
    this.lastTime = now;
    if (dt > 3) dt = 3; // clamp after tab was backgrounded
    this.time = now / 1000;

    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const hit = 0.02;
    for (const d of this.drops) {
      d.y += d.vy * dt * (0.6 + this.depthAtBuf(d.y)); // a touch faster when near
      const depth = this.depthAtBuf(d.y);
      const p = hit * (0.05 + Math.pow(depth, 1.6)) * dt;
      if (d.y >= this.bh) {
        this.land(d.x, this.bh - 1);
        Object.assign(d, this.newDrop(false));
      } else if (d.y > 0 && Math.random() < p) {
        this.land(d.x, Math.floor(d.y));
        Object.assign(d, this.newDrop(false));
      }
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += (dt * 16.67) / 1000;
      if (this.ripples[i].t >= this.ripples[i].dur) this.ripples.splice(i, 1);
    }
  }

  draw() {
    const b = this.bctx;
    // Water: per-row vertical gradient with a faint moving shimmer band.
    for (let y = 0; y < this.bh; y++) {
      const f = y / this.bh;
      const shimmer = Math.sin(y * 0.25 + this.time * 1.2) * 3;
      const r = this.lerp(this.waterFar[0], this.waterNear[0], f) + shimmer;
      const g = this.lerp(this.waterFar[1], this.waterNear[1], f) + shimmer;
      const bl = this.lerp(this.waterFar[2], this.waterNear[2], f) + shimmer;
      b.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
      b.fillRect(0, y, this.bw, 1);
    }

    // Ripples (elliptical rings).
    for (const rp of this.ripples) {
      const prog = rp.t / rp.dur;
      const alpha = (1 - prog) * 0.5;
      const rx = rp.maxR * prog + 0.5;
      const ry = rx * rp.flat;
      b.strokeStyle = `rgba(232,226,246,${alpha})`;
      b.lineWidth = 1;
      b.beginPath();
      b.ellipse(rp.x + 0.5, rp.y + 0.5, rx, ry, 0, 0, Math.PI * 2);
      b.stroke();
      if (rp.rings === 2 && prog > 0.25) {
        b.strokeStyle = `rgba(232,226,246,${alpha * 0.55})`;
        b.beginPath();
        b.ellipse(rp.x + 0.5, rp.y + 0.5, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
        b.stroke();
      }
    }

    // Falling rain streaks (fainter/shorter when far).
    for (const d of this.drops) {
      if (d.y < 0) continue;
      const depth = this.depthAtBuf(d.y);
      const a = 0.25 + depth * 0.45;
      const len = Math.max(1, Math.round(d.len * (0.5 + depth * 0.7)));
      b.fillStyle = `rgba(228,222,246,${a})`;
      b.fillRect(d.x, Math.floor(d.y) - len, 1, len);
    }

    // Blit the buffer up to full resolution, nearest-neighbour.
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.ctx.drawImage(this.buf, 0, 0, this.bw, this.bh, 0, 0, this.W, this.H);
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }
}

window.addEventListener("load", () => {
  window.rainScene = new RainScene();
});
