// The shared duck graveyard: a JSONBin-backed list of every named, killed duck,
// plus the little earth-mound-and-cross graves that surface one-per-raindrop
// after you bury your own duck. Click a cross to read who lies there.
//
// NOTE: the access key is intentionally in the client (static site, throwaway
// bin — nothing sensitive).
class Graveyard {
  constructor(scene) {
    this.scene = scene;
    this.container = document.getElementById("graveyard");
    this.sprite = new Image();
    this.sprite.src = "animation/graves.png";
    this.queue = null;

    this.BIN = "6a63195df5f4af5e29ba3b47";
    this.KEY = "$2a$10$B7e3qwOWlelT5ySxHv4TU.exMmly0VBgd6P0bvANf/gSKV0O2dKpS";
    this.BASE = "https://api.jsonbin.io/v3/b";

    // Shared info popup, shown when a cross is clicked.
    this.popup = document.createElement("div");
    this.popup.className = "grave-popup";
    this.popup.style.display = "none";
    this.popup.innerHTML = '<div class="gp-name"></div><div class="gp-line gp-died"></div><div class="gp-line gp-age"></div>';
    this.popup.addEventListener("click", (e) => e.stopPropagation());
    document.body.appendChild(this.popup);
    document.addEventListener("click", () => { this.popup.style.display = "none"; });
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

  // ---- graves --------------------------------------------------------------

  // Plant one grave at screen point (x, y). Perspective: nearer (lower) => bigger
  // and drawn on top; farther => smaller, sinking into the fog. `duck` carries
  // { name, died, age } shown when the cross is clicked.
  addGrave(duck, x, y, depth) {
    const grave = document.createElement("div");
    grave.className = "gravestone";
    grave.style.left = `${x}px`;
    grave.style.top = `${y}px`;
    grave.style.zIndex = String(Math.round(y));

    const lift = document.createElement("div");
    lift.className = "lift";
    lift.style.setProperty("--s", (0.55 + depth * 0.6).toFixed(2));

    const cross = document.createElement("canvas");
    cross.className = "cross";
    cross.width = Graveyard.W;
    cross.height = Graveyard.H;
    cross.style.width = `${Graveyard.W * Graveyard.DISP}px`;
    cross.style.height = `${Graveyard.H * Graveyard.DISP}px`;
    const ctx = cross.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const v = Math.floor(Math.random() * Graveyard.VARIANTS);
    const paint = () => {
      ctx.clearRect(0, 0, Graveyard.W, Graveyard.H);
      ctx.drawImage(this.sprite, v * Graveyard.W, 0, Graveyard.W, Graveyard.H, 0, 0, Graveyard.W, Graveyard.H);
    };
    if (this.sprite.complete && this.sprite.naturalWidth) paint();
    else this.sprite.addEventListener("load", paint, { once: true });

    cross.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showInfo(duck, e.clientX, e.clientY);
    });

    lift.append(cross);
    grave.append(lift);
    this.container.appendChild(grave);
  }

  showInfo(duck, cx, cy) {
    this.popup.querySelector(".gp-name").textContent = duck.name || "Unknown";
    this.popup.querySelector(".gp-died").textContent = `† died ${Graveyard.fmtDate(duck.died)}`;
    const age = Graveyard.fmtAge(duck.age);
    this.popup.querySelector(".gp-age").textContent = age ? `lived ${age}` : "age unknown";

    this.popup.style.display = "block";
    const pw = this.popup.offsetWidth, ph = this.popup.offsetHeight;
    const px = cx + pw + 14 > window.innerWidth ? cx - pw - 14 : cx + 14;
    const py = cy + ph + 14 > window.innerHeight ? cy - ph - 14 : cy + 14;
    this.popup.style.left = `${Math.max(6, px)}px`;
    this.popup.style.top = `${Math.max(6, py)}px`;
  }

  // ---- reveal --------------------------------------------------------------

  // After you bury your own duck, every raindrop raises one of the other fallen
  // ducks until the whole graveyard has surfaced out of the fog.
  async reveal(myName) {
    const all = await this.fetch();
    const mine = all.findIndex((d) => d && d.name === myName);
    if (mine >= 0) all.splice(mine, 1); // we already planted our own grave
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    this.queue = all.slice(0, 80);
    let last = 0;
    this.scene.onLanding((p) => {
      if (!this.queue || this.queue.length === 0) return;
      const now = performance.now();
      if (now - last < 260) return; // one grave per few raindrops
      last = now;
      const duck = this.queue.shift();
      const y = Math.min(window.innerHeight * 0.88, Math.max(window.innerHeight * 0.16, p.y));
      this.addGrave(duck, p.x, y, this.scene.depthAt(y));
    });
  }

  static fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "long ago";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  static fmtAge(sec) {
    if (sec == null || isNaN(sec)) return null;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
// Sprite sheet: VARIANTS frames of W x H, shown at DISP scale.
Graveyard.W = 24;
Graveyard.H = 30;
Graveyard.VARIANTS = 4;
Graveyard.DISP = 1.6;
