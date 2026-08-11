// The meadow scene: a grass field seen at a shallow angle (bottom = near, top =
// far, hazing into the horizon) with rain and muddy puddles. Light comes from
// the TOP-LEFT. Static art (turf + puddles) is baked once per resize; blades,
// flowers, rain and ripples are redrawn each frame into a small offscreen buffer
// and blitted up nearest-neighbour for chunky pixels.
//
// Driven by main's loop via update(dt, time) + draw(). Other objects subscribe
// to landings via onLanding(cb) and read perspective via depthAt(screenY).
class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.buf = document.createElement("canvas");
    this.bctx = this.buf.getContext("2d");
    this.grass = document.createElement("canvas");
    this.gctx = this.grass.getContext("2d");

    this.PIXEL = 4;
    this.time = 0;
    this.drops = [];
    this.ripples = [];
    this.splashes = [];
    this.puddles = [];
    this.blades = [];
    this.flowers = [];
    this.landingCbs = [];

    // Turf palette (dark -> light) + a dry yellow-green tint for variation.
    this.greens = [[58, 104, 56], [80, 140, 64], [104, 168, 74], [132, 192, 86], [156, 202, 92]];
    this.dryTint = [172, 184, 88];
    this.hazeTint = [206, 226, 168];
    this.gBase = [92, 156, 70];
    this.gHi = [158, 204, 96];
    // Puddle water 3-tone + mud.
    this.wHi = [150, 186, 176];
    this.wBase = [74, 122, 122];
    this.wSh = [40, 78, 86];
    this.mud = [96, 84, 54];
    this.mudDark = [70, 60, 40];
    this.dampGrass = [56, 96, 54];
    this.petals = ["#f2f2f5", "#f4b8d0", "#ef6d8a", "#e8d24a", "#c79be6"];

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.bw = Math.ceil(this.W / this.PIXEL);
    this.bh = Math.ceil(this.H / this.PIXEL);
    this.buf.width = this.grass.width = this.bw;
    this.buf.height = this.grass.height = this.bh;
    this.ctx.imageSmoothingEnabled = false;
    this.bctx.imageSmoothingEnabled = false;

    this.placePuddles();
    this.placeBlades();
    this.placeFlowers();
    this.bakeGround();

    this.drops = [];
    const target = Math.round(this.bw / 7);
    for (let i = 0; i < target; i++) this.drops.push(this.newDrop(true));
  }

  depthAtBuf(by) { return Math.min(1, Math.max(0, by / this.bh)); }
  depthAt(screenY) { return Math.min(1, Math.max(0, screenY / this.H)); }
  onLanding(cb) { this.landingCbs.push(cb); }
  lerpC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  rgb(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }

  // ---- placement -----------------------------------------------------------

  placePuddles() {
    this.puddles = [];
    const n = Math.max(4, Math.round(this.bw / 55));
    for (let i = 0; i < n; i++) {
      const by = this.bh * (0.36 + Math.random() * 0.6);
      const depth = this.depthAtBuf(by);
      const rx = 7 + depth * 15;
      const p = { x: Math.random() * this.bw, y: by, rx, ry: rx * (0.34 + depth * 0.22), flat: 0.34 + depth * 0.22, tint: Math.random(), radii: [] };
      const S = 22, seed = Math.random() * 100;
      for (let k = 0; k < S; k++) {
        const ang = (k / S) * Math.PI * 2;
        p.radii.push(0.72 + this.vnoise(Math.cos(ang) * 1.7 + seed, Math.sin(ang) * 1.7 + seed) * 0.28);
      }
      this.puddles.push(p);
    }
  }

  placeBlades() {
    this.blades = [];
    const n = Math.round((this.bw * this.bh) / 150);
    let guard = 0;
    while (this.blades.length < n && guard++ < n * 3) {
      const by = this.bh * (0.2 + Math.pow(Math.random(), 0.7) * 0.79); // biased near
      const bx = Math.floor(Math.random() * this.bw);
      if (this.puddleAt(bx, by)) continue;
      const depth = this.depthAtBuf(by);
      this.blades.push({
        x: bx, y: by, h: 2 + Math.round(depth * 7),
        lean: (Math.random() * 2 - 1) * (1 + depth), flex: 0.8 + depth * 1.6,
        phase: Math.random() * Math.PI * 2, shade: Math.random(),
      });
    }
    this.blades.sort((a, b) => a.y - b.y);
  }

  placeFlowers() {
    this.flowers = [];
    const n = Math.round((this.bw * this.bh) / 2600);
    for (let i = 0; i < n; i++) {
      this.flowers.push({
        x: Math.floor(Math.random() * this.bw),
        y: this.bh * (0.32 + Math.random() * 0.64),
        color: this.petals[Math.floor(Math.random() * this.petals.length)],
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ---- baking --------------------------------------------------------------

  bakeGround() {
    const g = this.gctx;
    const img = g.createImageData(this.bw, this.bh);
    const d = img.data;
    for (let y = 0; y < this.bh; y++) {
      for (let x = 0; x < this.bw; x++) {
        const idx = Math.min(4, Math.floor(this.fbm(x * 0.045, y * 0.085) * 5));
        let c = this.greens[idx].slice();
        const dry = this.fbm(x * 0.02 + 40, y * 0.03 + 40);
        if (dry > 0.62) c = this.lerpC(c, this.dryTint, Math.min(0.7, (dry - 0.62) * 2.2));
        const fleck = this.vnoise(x * 0.7 + 11, y * 0.7 + 7);
        if (fleck > 0.83) c = this.lerpC(c, this.greens[Math.min(4, idx + 1)], 0.5);
        else if (fleck < 0.15) c = this.lerpC(c, this.greens[Math.max(0, idx - 1)], 0.5);
        const haze = Math.max(0, 1 - this.depthAtBuf(y) / 0.34);
        if (haze > 0) c = this.lerpC(c, this.hazeTint, haze * 0.82);
        const o = (y * this.bw + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    for (const p of this.puddles) this.drawPuddle(g, p);
  }

  radiusAt(p, ang) {
    const S = p.radii.length;
    const t = ((((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * S;
    const i = Math.floor(t), f = t - i;
    return p.radii[i % S] * (1 - f) + p.radii[(i + 1) % S] * f;
  }

  drawPuddle(g, p) {
    const set = (x, y, c) => { g.fillStyle = this.rgb(c); g.fillRect(x, y, 1, 1); };
    const wBase = this.lerpC(this.wBase, this.mud, p.tint * 0.55);
    const wSh = this.lerpC(this.wSh, this.mudDark, p.tint * 0.55);
    const wHi = this.lerpC(this.wHi, this.mud, p.tint * 0.3);
    const x0 = Math.floor(p.x - p.rx * 1.25 - 1), x1 = Math.ceil(p.x + p.rx * 1.25 + 1);
    const y0 = Math.floor(p.y - p.ry * 1.25 - 1), y1 = Math.ceil(p.y + p.ry * 1.25 + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - p.x) / p.rx, dy = (y - p.y) / p.ry;
        const R = this.radiusAt(p, Math.atan2(dy, dx));
        const d = Math.hypot(dx, dy) / R;
        if (d > 1.22) continue;
        const jit = this.vnoise(x * 0.5 + 3, y * 0.5 + 9);
        let c;
        if (d > 1.0) {
          if (jit < 0.4 + (1.18 - d) * 2) c = this.lerpC(this.dampGrass, this.mudDark, 0.4);
          else continue;
        } else if (d > 0.82) {
          c = jit > 0.5 ? this.mud : this.mudDark;
        } else if (dy < -0.12 && dx < 0.12 && d > 0.28 && d < 0.7) {
          c = wHi;
        } else if (dy > 0.16 && dx > 0.0) {
          c = wSh;
        } else {
          c = jit > 0.55 ? this.lerpC(wBase, wHi, 0.25) : wBase;
        }
        set(x, y, c);
      }
    }
    set(Math.round(p.x - p.rx * 0.32), Math.round(p.y - p.ry * 0.42), [212, 236, 240]);
  }

  // ---- rain / ripples ------------------------------------------------------

  newDrop(scatter) {
    return {
      x: Math.floor(Math.random() * this.bw),
      y: scatter ? Math.random() * this.bh : -Math.random() * this.bh * 0.5,
      vy: 0.9 + Math.random() * 0.9, len: 2 + Math.floor(Math.random() * 3),
    };
  }

  puddleAt(bx, by) {
    for (const p of this.puddles) {
      const dx = (bx - p.x) / p.rx, dy = (by - p.y) / p.ry;
      if (Math.hypot(dx, dy) <= this.radiusAt(p, Math.atan2(dy, dx))) return p;
    }
    return null;
  }

  ripple(x, y, flat, maxR) {
    this.ripples.push({ x, y, t: 0, dur: 0.7 + flat, maxR, flat });
    if (this.ripples.length > 200) this.ripples.shift();
  }

  land(bx, by) {
    const p = this.puddleAt(bx, by);
    if (p) this.ripple(bx, by, p.flat, p.rx * 0.66);
    else {
      this.splashes.push({ x: bx, y: by, t: 0 });
      if (this.splashes.length > 40) this.splashes.shift();
    }
    const screen = { x: bx * this.PIXEL, y: by * this.PIXEL, depth: this.depthAtBuf(by) };
    for (const cb of this.landingCbs) cb(screen);
  }

  update(dt, time) {
    this.time = time;
    const secs = (dt * 16.67) / 1000;
    for (const d of this.drops) {
      d.y += d.vy * dt * (0.6 + this.depthAtBuf(d.y));
      const prob = 0.02 * (0.05 + Math.pow(this.depthAtBuf(d.y), 1.6)) * dt;
      if (d.y >= this.bh) { this.land(d.x, this.bh - 1); Object.assign(d, this.newDrop(false)); }
      else if (d.y > 0 && Math.random() < prob) { this.land(d.x, Math.floor(d.y)); Object.assign(d, this.newDrop(false)); }
    }
    for (const p of this.puddles) {
      if (Math.random() < 0.03 * dt) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.5;
        this.ripple(p.x + Math.cos(a) * p.rx * rr, p.y + Math.sin(a) * p.ry * rr, p.flat, p.rx * 0.55);
      }
    }
    for (let i = this.ripples.length - 1; i >= 0; i--)
      if ((this.ripples[i].t += secs) >= this.ripples[i].dur) this.ripples.splice(i, 1);
    for (let i = this.splashes.length - 1; i >= 0; i--)
      if ((this.splashes[i].t += secs) >= 0.25) this.splashes.splice(i, 1);
  }

  draw() {
    const b = this.bctx;
    b.clearRect(0, 0, this.bw, this.bh);
    b.drawImage(this.grass, 0, 0);

    // Blades cast shadows to the lower-right (light top-left)...
    b.fillStyle = "rgba(34,64,42,0.22)";
    for (const bl of this.blades) {
      const shl = Math.max(1, Math.round(bl.h * 0.3));
      for (let k = 1; k <= shl; k++) b.fillRect(bl.x + k, bl.y, 1, 1);
    }
    // ...then the lit, swaying blades (base body, highlighted tip).
    for (const bl of this.blades) {
      const sway = Math.sin(this.time * 1.4 + bl.phase) * bl.flex;
      for (let i = 0; i < bl.h; i++) {
        const off = Math.round((bl.lean + sway) * (i / bl.h));
        b.fillStyle = this.rgb(i >= bl.h - 2 || bl.shade > 0.7 ? this.gHi : this.gBase);
        b.fillRect(bl.x + off, bl.y - i, 1, 1);
      }
    }

    for (const fl of this.flowers) {
      const sway = Math.round(Math.sin(this.time * 1.4 + fl.phase));
      const cx = fl.x + sway, cy = fl.y - 3;
      b.fillStyle = "rgb(70,128,60)";
      b.fillRect(fl.x, fl.y - 1, 1, 1);
      b.fillRect(fl.x, fl.y - 2, 1, 1);
      b.fillStyle = fl.color;
      b.fillRect(cx, cy - 1, 1, 1); b.fillRect(cx - 1, cy, 1, 1);
      b.fillRect(cx + 1, cy, 1, 1); b.fillRect(cx, cy + 1, 1, 1);
      b.fillStyle = "#f2d24c";
      b.fillRect(cx, cy, 1, 1);
    }

    for (const rp of this.ripples) {
      const prog = rp.t / rp.dur, rx = rp.maxR * prog + 0.5;
      b.strokeStyle = `rgba(198,224,228,${(1 - prog) * 0.5})`;
      b.lineWidth = 1;
      b.beginPath();
      b.ellipse(rp.x + 0.5, rp.y + 0.5, rx, rx * rp.flat, 0, 0, Math.PI * 2);
      b.stroke();
    }

    for (const s of this.splashes) {
      b.fillStyle = "rgba(206,232,200,0.5)";
      b.fillRect(s.x, s.y - 1, 1, 1); b.fillRect(s.x - 1, s.y, 1, 1); b.fillRect(s.x + 1, s.y, 1, 1);
    }

    for (const d of this.drops) {
      if (d.y < 0) continue;
      const depth = this.depthAtBuf(d.y);
      const len = Math.max(1, Math.round(d.len * (0.5 + depth * 0.7)));
      b.fillStyle = `rgba(224,238,244,${0.2 + depth * 0.38})`;
      b.fillRect(d.x, Math.floor(d.y) - len, 1, len);
    }

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.ctx.drawImage(this.buf, 0, 0, this.bw, this.bh, 0, 0, this.W, this.H);
  }

  // ---- value noise ---------------------------------------------------------

  hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }
  vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const tl = this.hash(xi, yi), tr = this.hash(xi + 1, yi);
    const bl = this.hash(xi, yi + 1), br = this.hash(xi + 1, yi + 1);
    return (tl + (tr - tl) * u) * (1 - v) + (bl + (br - bl) * u) * v;
  }
  fbm(x, y) {
    let a = 0, amp = 0.5, f = 1;
    for (let i = 0; i < 3; i++) { a += this.vnoise(x * f, y * f) * amp; f *= 2; amp *= 0.5; }
    return Math.min(1, a);
  }
}
