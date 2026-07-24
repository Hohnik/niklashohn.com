// Isometric pixel rain over a grass field with water puddles.
//
// The page is a grass meadow seen at a shallow angle: the BOTTOM of the screen
// is "near" and the TOP is "far" (fading into a hazy horizon). The ground is
// noise-shaded pixel-art grass with scattered accent blades that sway in the
// wind. Rain falls across the whole field; where a drop hits one of the
// scattered water puddles it spawns an ELLIPTICAL ripple (flat, perspective
// pools), and the puddles shimmer with the odd ripple of their own.
//
// Everything is drawn into a small offscreen buffer and blitted up with
// nearest-neighbour scaling, so it stays chunky pixel art. The static grass +
// puddles are baked once per resize; only rain, ripples and swaying blades are
// redrawn each frame. Other scripts subscribe via rainScene.onLanding(cb) —
// used to reveal a gravestone per raindrop.

class RainScene {
  constructor() {
    this.canvas = document.getElementById("rainCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.PIXEL = 4; // size of one chunky pixel, in screen px
    this.buf = document.createElement("canvas");
    this.bctx = this.buf.getContext("2d");
    this.grass = document.createElement("canvas"); // baked static ground
    this.gctx = this.grass.getContext("2d");

    this.drops = [];
    this.ripples = [];
    this.splashes = [];
    this.puddles = [];
    this.tufts = [];
    this.landingCbs = [];
    this.lastTime = performance.now();

    // Grass shades (dark -> light) and haze/water palettes.
    this.greens = [
      [58, 111, 55], [76, 138, 66], [95, 166, 77], [116, 194, 90], [142, 217, 104],
    ];
    this.hazeTint = [200, 226, 172];
    this.water = { rim: [53, 97, 122], mid: [79, 151, 192], hi: [150, 205, 226], spark: [200, 236, 245] };

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
    this.bakeGround();

    this.drops = [];
    const target = Math.round(this.bw / 7);
    for (let i = 0; i < target; i++) this.drops.push(this.newDrop(true));
  }

  // 0 at the top (far) .. 1 at the bottom (near).
  depthAtBuf(by) {
    return Math.min(1, Math.max(0, by / this.bh));
  }
  depthAt(screenY) {
    return Math.min(1, Math.max(0, screenY / this.H));
  }

  // ---- static ground -------------------------------------------------------

  placePuddles() {
    this.puddles = [];
    const n = Math.max(5, Math.round(this.bw / 45));
    for (let i = 0; i < n; i++) {
      const by = this.bh * (0.32 + Math.random() * 0.63);
      const depth = this.depthAtBuf(by);
      const rx = 6 + depth * 16;
      this.puddles.push({
        x: Math.random() * this.bw,
        y: by,
        rx,
        ry: rx * (0.35 + depth * 0.25),
        flat: 0.35 + depth * 0.25,
      });
    }
  }

  placeTufts() {
    this.tufts = [];
    const n = Math.round((this.bw * this.bh) / 900);
    for (let i = 0; i < n; i++) {
      const by = this.bh * (0.18 + Math.random() * 0.8);
      this.tufts.push({
        x: Math.floor(Math.random() * this.bw),
        y: by,
        h: 2 + Math.floor(this.depthAtBuf(by) * 3),
        shade: Math.random() < 0.5 ? 3 : 4,
        phase: Math.random() * Math.PI * 2,
        flower: Math.random() < 0.08,
      });
    }
  }

  bakeGround() {
    const g = this.gctx;
    const img = g.createImageData(this.bw, this.bh);
    const d = img.data;
    for (let y = 0; y < this.bh; y++) {
      for (let x = 0; x < this.bw; x++) {
        // Blobby noise-based colour variation, gently stretched horizontally.
        const n = this.fbm(x * 0.05, y * 0.09);
        let idx = Math.min(this.greens.length - 1, Math.floor(n * this.greens.length));
        let [r, gg, b] = this.greens[idx];
        // Haze into the far horizon.
        const haze = Math.max(0, 1 - this.depthAtBuf(y) / 0.34);
        if (haze > 0) {
          const a = haze * 0.8;
          r = r + (this.hazeTint[0] - r) * a;
          gg = gg + (this.hazeTint[1] - gg) * a;
          b = b + (this.hazeTint[2] - b) * a;
        }
        const o = (y * this.bw + x) * 4;
        d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // Bake the puddles on top of the grass.
    for (const p of this.puddles) this.drawPuddle(g, p);
  }

  drawPuddle(g, p) {
    const { water } = this;
    const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
    // rim
    g.fillStyle = rgb(water.rim);
    this.fillEllipse(g, p.x, p.y, p.rx + 1, p.ry + 1);
    // body
    g.fillStyle = rgb(water.mid);
    this.fillEllipse(g, p.x, p.y, p.rx, p.ry);
    // inner highlight (upper part)
    g.fillStyle = rgb(water.hi);
    this.fillEllipse(g, p.x, p.y - p.ry * 0.35, p.rx * 0.55, p.ry * 0.4);
    g.fillStyle = rgb(water.mid);
    this.fillEllipse(g, p.x, p.y - p.ry * 0.1, p.rx * 0.7, p.ry * 0.5);
  }

  fillEllipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
    ctx.fill();
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

  onLanding(cb) {
    this.landingCbs.push(cb);
  }

  puddleAt(bx, by) {
    for (const p of this.puddles) {
      const dx = (bx - p.x) / p.rx;
      const dy = (by - p.y) / p.ry;
      if (dx * dx + dy * dy <= 1) return p;
    }
    return null;
  }

  ripple(x, y, flat, maxR) {
    this.ripples.push({ x, y, t: 0, dur: 0.7 + flat, maxR, flat });
    if (this.ripples.length > 200) this.ripples.shift();
  }

  land(bx, by) {
    const p = this.puddleAt(bx, by);
    if (p) {
      this.ripple(bx, by, p.flat, p.rx * 0.7);
    } else {
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
      if (d.y >= this.bh) {
        this.land(d.x, this.bh - 1);
        Object.assign(d, this.newDrop(false));
      } else if (d.y > 0 && Math.random() < p) {
        this.land(d.x, Math.floor(d.y));
        Object.assign(d, this.newDrop(false));
      }
    }

    // Ambient shimmer: the odd raindrop on each pool even without a direct hit.
    for (const pd of this.puddles) {
      if (Math.random() < 0.03 * dt) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * 0.5;
        this.ripple(pd.x + Math.cos(a) * pd.rx * rr, pd.y + Math.sin(a) * pd.ry * rr, pd.flat, pd.rx * 0.6);
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

    // Swaying accent grass blades.
    for (const t of this.tufts) {
      const sway = Math.round(Math.sin(this.time * 1.6 + t.phase) * 1);
      const col = this.greens[t.shade];
      b.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      for (let i = 0; i < t.h; i++) {
        const off = i === t.h - 1 ? sway : 0;
        b.fillRect(t.x + off, t.y - i, 1, 1);
      }
      if (t.flower) {
        b.fillStyle = Math.random() < 0.5 ? "#f2d24c" : "#eef2f5";
        b.fillRect(t.x + sway, t.y - t.h, 1, 1);
      }
    }

    // Puddle ripples (elliptical rings).
    for (const rp of this.ripples) {
      const prog = rp.t / rp.dur;
      const alpha = (1 - prog) * 0.6;
      const rx = rp.maxR * prog + 0.5;
      const ry = rx * rp.flat;
      b.strokeStyle = `rgba(${this.water.spark[0]},${this.water.spark[1]},${this.water.spark[2]},${alpha})`;
      b.lineWidth = 1;
      b.beginPath();
      b.ellipse(rp.x + 0.5, rp.y + 0.5, rx, ry, 0, 0, Math.PI * 2);
      b.stroke();
    }

    // Tiny splashes where rain hits the grass.
    for (const s of this.splashes) {
      b.fillStyle = "rgba(210,235,205,0.5)";
      b.fillRect(s.x, s.y - 1, 1, 1);
      b.fillRect(s.x - 1, s.y, 1, 1);
      b.fillRect(s.x + 1, s.y, 1, 1);
    }

    // Falling rain streaks (fainter/shorter when far).
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
    for (let i = 0; i < 3; i++) {
      a += this.vnoise(x * f, y * f) * amp;
      f *= 2;
      amp *= 0.5;
    }
    return Math.min(1, a);
  }
}

window.addEventListener("load", () => {
  window.rainScene = new RainScene();
});
