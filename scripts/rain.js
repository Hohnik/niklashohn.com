// Isometric pixel rain over a hand-drawn grass meadow with water puddles.
//
// The page is a grass field seen at a shallow angle: the BOTTOM is "near", the
// TOP is "far" and hazes into the horizon. The ground is noise-shaded pixel-art
// grass with fleck texture, tufts of accent blades that sway in the wind, and
// little flowers. Soft cloud shadows drift across it. Scattered water puddles
// have irregular, hand-drawn outlines (no perfect ellipses) and ripple where
// the rain hits them.
//
// Static art (grass, texture, puddles) is baked once per resize into an
// offscreen buffer; only rain, ripples, swaying blades and the drifting clouds
// are redrawn each frame, then the whole thing is blitted up nearest-neighbour
// for chunky pixels. Other scripts subscribe via rainScene.onLanding(cb).

class RainScene {
  constructor() {
    this.canvas = document.getElementById("rainCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.PIXEL = 4;
    this.buf = document.createElement("canvas");
    this.bctx = this.buf.getContext("2d");
    this.grass = document.createElement("canvas"); // baked ground
    this.gctx = this.grass.getContext("2d");
    this.cloudTex = document.createElement("canvas"); // drifting cloud shadows
    this.cctx = this.cloudTex.getContext("2d");

    this.drops = [];
    this.ripples = [];
    this.splashes = [];
    this.puddles = [];
    this.tufts = [];
    this.flowers = [];
    this.landingCbs = [];
    this.lastTime = performance.now();

    this.greens = [
      [52, 99, 50], [70, 128, 60], [90, 158, 72], [112, 188, 86], [140, 214, 102],
    ];
    this.hazeTint = [202, 227, 174];
    this.water = { rim: [46, 88, 112], deep: [66, 132, 172], mid: [86, 160, 198], hi: [156, 210, 230], spark: [212, 240, 248] };
    this.petals = ["#f2f2f5", "#f4b8d0", "#ef6d8a", "#e8d24a", "#c79be6"];

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
    for (const c of [this.buf, this.grass]) {
      c.width = this.bw;
      c.height = this.bh;
    }
    this.ctx.imageSmoothingEnabled = false;
    this.bctx.imageSmoothingEnabled = false;

    this.placePuddles();
    this.placeTufts();
    this.placeFlowers();
    this.bakeGround();
    this.bakeClouds();

    this.drops = [];
    const target = Math.round(this.bw / 7);
    for (let i = 0; i < target; i++) this.drops.push(this.newDrop(true));
  }

  depthAtBuf(by) { return Math.min(1, Math.max(0, by / this.bh)); }
  depthAt(screenY) { return Math.min(1, Math.max(0, screenY / this.H)); }
  lerpC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // ---- placement -----------------------------------------------------------

  placePuddles() {
    this.puddles = [];
    const n = Math.max(5, Math.round(this.bw / 42));
    for (let i = 0; i < n; i++) {
      const by = this.bh * (0.34 + Math.random() * 0.62);
      const depth = this.depthAtBuf(by);
      const rx = 7 + depth * 17;
      const p = {
        x: Math.random() * this.bw,
        y: by,
        rx,
        ry: rx * (0.34 + depth * 0.24),
        flat: 0.34 + depth * 0.24,
        radii: [],
      };
      // Wobbly hand-drawn outline: a smooth noise ring, 0.68..1.0 of the radius.
      const S = 20;
      const seed = Math.random() * 100;
      for (let k = 0; k < S; k++) {
        const ang = (k / S) * Math.PI * 2;
        const nz = this.vnoise(Math.cos(ang) * 1.6 + seed, Math.sin(ang) * 1.6 + seed);
        p.radii.push(0.7 + nz * 0.3);
      }
      this.puddles.push(p);
    }
  }

  placeTufts() {
    this.tufts = [];
    const n = Math.round((this.bw * this.bh) / 480);
    for (let i = 0; i < n; i++) {
      const by = this.bh * (0.16 + Math.random() * 0.82);
      this.tufts.push({
        x: Math.floor(Math.random() * this.bw),
        y: by,
        h: 2 + Math.floor(this.depthAtBuf(by) * 3),
        shade: Math.random() < 0.5 ? 0 : 4, // darker or brighter than the ground
        phase: Math.random() * Math.PI * 2,
        bend: Math.random() < 0.5 ? 1 : -1,
      });
    }
  }

  placeFlowers() {
    this.flowers = [];
    const n = Math.round((this.bw * this.bh) / 2600);
    for (let i = 0; i < n; i++) {
      const by = this.bh * (0.3 + Math.random() * 0.66);
      this.flowers.push({
        x: Math.floor(Math.random() * this.bw),
        y: by,
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
        const n = this.fbm(x * 0.045, y * 0.085);
        let idx = Math.min(this.greens.length - 1, Math.floor(n * this.greens.length));
        let c = this.greens[idx].slice();
        // fine fleck texture
        const fleck = this.vnoise(x * 0.7 + 11, y * 0.7 + 7);
        if (fleck > 0.82) c = this.lerpC(c, this.greens[Math.min(4, idx + 1)], 0.6);
        else if (fleck < 0.16) c = this.lerpC(c, this.greens[Math.max(0, idx - 1)], 0.6);
        // horizon haze
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
    const t = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * S;
    const i = Math.floor(t);
    const f = t - i;
    return p.radii[i % S] * (1 - f) + p.radii[(i + 1) % S] * f;
  }

  drawPuddle(g, p) {
    const set = (x, y, c) => { g.fillStyle = `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; g.fillRect(x, y, 1, 1); };
    const x0 = Math.floor(p.x - p.rx - 2), x1 = Math.ceil(p.x + p.rx + 2);
    const y0 = Math.floor(p.y - p.ry - 2), y1 = Math.ceil(p.y + p.ry + 2);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - p.x) / p.rx;
        const dy = (y - p.y) / p.ry;
        const dist = Math.hypot(dx, dy);
        const R = this.radiusAt(p, Math.atan2(dy, dx));
        if (dist > R) continue;
        let c;
        if (dist > R - 0.14) c = this.water.rim;                         // wobbly rim
        else if (dy < -0.12 && dist > 0.3 && dist < 0.72) c = this.water.hi; // top highlight crescent
        else {
          const shimmer = this.vnoise(x * 0.35, y * 0.35);
          c = shimmer > 0.6 ? this.water.mid : this.water.deep;         // dithered water body
        }
        set(x, y, c);
      }
    }
    // sparkles
    g.fillStyle = `rgb(${this.water.spark.join(",")})`;
    g.fillRect(Math.round(p.x - p.rx * 0.3), Math.round(p.y - p.ry * 0.4), 1, 1);
    g.fillRect(Math.round(p.x - p.rx * 0.1), Math.round(p.y - p.ry * 0.5), 1, 1);
  }

  bakeClouds() {
    this.cloudTex.width = this.bw;
    this.cloudTex.height = this.bh;
    const c = this.cctx;
    c.clearRect(0, 0, this.bw, this.bh);
    // A few big soft dark blobs, kept off the edges so the horizontal wrap is seamless enough.
    const blobs = Math.max(3, Math.round(this.bw / 90));
    for (let i = 0; i < blobs; i++) {
      const cx = this.bw * (0.15 + Math.random() * 0.7);
      const cy = this.bh * Math.random();
      const r = this.bh * (0.25 + Math.random() * 0.35);
      const grad = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(20,40,25,0.30)");
      grad.addColorStop(1, "rgba(20,40,25,0)");
      c.fillStyle = grad;
      c.beginPath();
      c.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ---- rain / ripples ------------------------------------------------------

  newDrop(scatter) {
    return {
      x: Math.floor(Math.random() * this.bw),
      y: scatter ? Math.random() * this.bh : -Math.random() * this.bh * 0.5,
      vy: 0.9 + Math.random() * 0.9,
      len: 2 + Math.floor(Math.random() * 3),
    };
  }

  onLanding(cb) { this.landingCbs.push(cb); }

  puddleAt(bx, by) {
    for (const p of this.puddles) {
      const dx = (bx - p.x) / p.rx;
      const dy = (by - p.y) / p.ry;
      const dist = Math.hypot(dx, dy);
      if (dist <= this.radiusAt(p, Math.atan2(dy, dx))) return p;
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
    const depth = this.depthAtBuf(by);
    const screen = { x: bx * this.PIXEL, y: by * this.PIXEL, depth };
    for (const cb of this.landingCbs) cb(screen);
  }

  loop(now) {
    let dt = (now - this.lastTime) / 16.67;
    this.lastTime = now;
    if (dt > 3) dt = 3;
    this.time = now / 1000;
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const hit = 0.02;
    for (const d of this.drops) {
      d.y += d.vy * dt * (0.6 + this.depthAtBuf(d.y));
      const depth = this.depthAtBuf(d.y);
      const p = hit * (0.05 + Math.pow(depth, 1.6)) * dt;
      if (d.y >= this.bh) { this.land(d.x, this.bh - 1); Object.assign(d, this.newDrop(false)); }
      else if (d.y > 0 && Math.random() < p) { this.land(d.x, Math.floor(d.y)); Object.assign(d, this.newDrop(false)); }
    }
    for (const pd of this.puddles) {
      if (Math.random() < 0.03 * dt) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * 0.5;
        this.ripple(pd.x + Math.cos(a) * pd.rx * rr, pd.y + Math.sin(a) * pd.ry * rr, pd.flat, pd.rx * 0.55);
      }
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += (dt * 16.67) / 1000;
      if (this.ripples[i].t >= this.ripples[i].dur) this.ripples.splice(i, 1);
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].t += (dt * 16.67) / 1000;
      if (this.splashes[i].t >= 0.25) this.splashes.splice(i, 1);
    }
  }

  draw() {
    const b = this.bctx;
    b.clearRect(0, 0, this.bw, this.bh);
    b.drawImage(this.grass, 0, 0);

    // Drifting cloud shadows (seamless horizontal wrap).
    const drift = Math.floor((this.time * 6) % this.bw);
    b.drawImage(this.cloudTex, -drift, 0);
    b.drawImage(this.cloudTex, this.bw - drift, 0);

    // Swaying accent grass blades (curved).
    for (const t of this.tufts) {
      const sway = Math.sin(this.time * 1.6 + t.phase);
      const col = this.greens[t.shade];
      b.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      for (let i = 0; i < t.h; i++) {
        const bendAmt = Math.round((i / t.h) * t.bend + sway * (i / t.h));
        b.fillRect(t.x + bendAmt, t.y - i, 1, 1);
      }
    }

    // Little flowers, gently nodding.
    for (const f of this.flowers) {
      const sway = Math.round(Math.sin(this.time * 1.6 + f.phase));
      const cx = f.x + sway, cy = f.y - 2;
      b.fillStyle = f.color;
      b.fillRect(cx, cy - 1, 1, 1);
      b.fillRect(cx - 1, cy, 1, 1);
      b.fillRect(cx + 1, cy, 1, 1);
      b.fillRect(cx, cy + 1, 1, 1);
      b.fillStyle = "#f2d24c";
      b.fillRect(cx, cy, 1, 1);
      b.fillStyle = "rgb(70,128,60)";
      b.fillRect(f.x, f.y - 1, 1, 1); // stem
    }

    // Puddle ripples.
    for (const rp of this.ripples) {
      const prog = rp.t / rp.dur;
      const alpha = (1 - prog) * 0.6;
      const rx = rp.maxR * prog + 0.5;
      b.strokeStyle = `rgba(${this.water.spark[0]},${this.water.spark[1]},${this.water.spark[2]},${alpha})`;
      b.lineWidth = 1;
      b.beginPath();
      b.ellipse(rp.x + 0.5, rp.y + 0.5, rx, rx * rp.flat, 0, 0, Math.PI * 2);
      b.stroke();
    }

    // Grass splashes.
    for (const s of this.splashes) {
      b.fillStyle = "rgba(214,236,208,0.5)";
      b.fillRect(s.x, s.y - 1, 1, 1);
      b.fillRect(s.x - 1, s.y, 1, 1);
      b.fillRect(s.x + 1, s.y, 1, 1);
    }

    // Falling rain streaks.
    for (const d of this.drops) {
      if (d.y < 0) continue;
      const depth = this.depthAtBuf(d.y);
      const a = 0.22 + depth * 0.4;
      const len = Math.max(1, Math.round(d.len * (0.5 + depth * 0.7)));
      b.fillStyle = `rgba(226,240,246,${a})`;
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
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
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

window.addEventListener("load", () => { window.rainScene = new RainScene(); });
