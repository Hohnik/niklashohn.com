// The shared duck graveyard: a JSONBin-backed list of every named, killed duck,
// plus the pixel-art tombstones that surface one-per-raindrop after you bury
// your own duck.
//
// NOTE: the access key is intentionally in the client (static site, throwaway
// bin — nothing sensitive).
class Graveyard {
  constructor(scene) {
    this.scene = scene;
    this.container = document.getElementById("graveyard");
    this.sprite = new Image();
    this.sprite.src = "animation/gravestones.png";
    this.queue = null;

    this.BIN = "6a63195df5f4af5e29ba3b47";
    this.KEY = "$2a$10$B7e3qwOWlelT5ySxHv4TU.exMmly0VBgd6P0bvANf/gSKV0O2dKpS";
    this.BASE = "https://api.jsonbin.io/v3/b";
  }

  // ---- data ----------------------------------------------------------------

  async fetch() {
    try {
      const res = await window.fetch(`${this.BASE}/${this.BIN}/latest`, {
        headers: { "X-Access-Key": this.KEY, "X-Bin-Meta": "false" },
      });
      if (!res.ok) throw new Error(`GET ${res.status}`);
      const data = await res.json();
      return Array.isArray(data.ducks) ? data.ducks : [];
    } catch (err) {
      console.warn("Graveyard: could not load ducks", err);
      return [];
    }
  }

  async record(duck) {
    try {
      const ducks = await this.fetch();
      ducks.push(duck);
      const res = await window.fetch(`${this.BASE}/${this.BIN}`, {
        method: "PUT",
        headers: { "X-Access-Key": this.KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ ducks }),
      });
      if (!res.ok) throw new Error(`PUT ${res.status}`);
    } catch (err) {
      console.warn("Graveyard: could not record duck", err);
    }
  }

  // ---- tombstones ----------------------------------------------------------

  // Build one tombstone at screen point (x, y). Perspective: nearer (lower on
  // screen) => larger and drawn on top; farther => smaller, sinking into fog.
  addStone(name, x, y, depth) {
    const grave = document.createElement("div");
    grave.className = "gravestone";
    grave.style.left = `${x}px`;
    grave.style.top = `${y}px`;
    grave.style.zIndex = String(Math.round(y));

    const lift = document.createElement("div");
    lift.className = "lift";
    lift.style.setProperty("--s", (0.55 + depth * 0.6).toFixed(2));

    const stone = document.createElement("canvas");
    stone.className = "stone";
    stone.width = Graveyard.W;
    stone.height = Graveyard.H;
    stone.style.width = `${Graveyard.W * Graveyard.DISP}px`;
    stone.style.height = `${Graveyard.H * Graveyard.DISP}px`;
    const ctx = stone.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const v = Math.floor(Math.random() * Graveyard.VARIANTS);

    const paint = () => {
      ctx.clearRect(0, 0, Graveyard.W, Graveyard.H);
      ctx.drawImage(this.sprite, v * Graveyard.W, 0, Graveyard.W, Graveyard.H, 0, 0, Graveyard.W, Graveyard.H);
      PixelFont.drawBox(ctx, name, 6, 23, 28, 17, "#3a3850"); // engrave the name
    };
    if (this.sprite.complete && this.sprite.naturalWidth) paint();
    else this.sprite.addEventListener("load", paint, { once: true });

    lift.append(stone);
    grave.append(lift);
    this.container.appendChild(grave);
  }

  // ---- reveal --------------------------------------------------------------

  // After you bury your own duck, every raindrop raises one of the other fallen
  // ducks until the whole graveyard has surfaced out of the fog.
  async reveal(myName) {
    const all = await this.fetch();
    const mine = all.findIndex((d) => d && d.name === myName);
    if (mine >= 0) all.splice(mine, 1); // we already planted our own stone
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    this.queue = all.slice(0, 80);
    let last = 0;
    this.scene.onLanding((p) => {
      if (!this.queue || this.queue.length === 0) return;
      const now = performance.now();
      if (now - last < 260) return; // one stone per few raindrops
      last = now;
      const duck = this.queue.shift();
      const y = Math.min(window.innerHeight * 0.88, Math.max(window.innerHeight * 0.16, p.y));
      this.addStone(duck.name || "Unknown", p.x, y, this.scene.depthAt(y));
    });
  }
}
// Sprite sheet: VARIANTS frames of W x H, shown at DISP scale.
Graveyard.W = 40;
Graveyard.H = 48;
Graveyard.VARIANTS = 7;
Graveyard.DISP = 1.6;
