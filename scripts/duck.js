// The duck: a pixel sprite that follows the cursor (idle / walk / fly), can be
// named, and dies when the "Don't press here" button is clicked. A named duck
// explodes into a permanent gravestone and joins the shared graveyard; an
// unnamed one just plays its death animation. Driven by main's loop via
// update(dt) (dt is in ~60fps frame units).
const DuckState = {
  IDLE: { image: "animation/raven_idle.png", frames: 5, cls: "idle" },
  WALK: { image: "animation/raven_walk.png", frames: 4, cls: "walking" },
  FLY: { image: "animation/raven_fly.png", frames: 6, cls: "flying" },
  DEAD: { image: "animation/raven_death.png", frames: 24, cls: "dead" },
};

class Duck {
  constructor({ scene, graveyard }) {
    this.scene = scene;
    this.graveyard = graveyard;

    this.el = document.getElementById("pet");
    this.text = document.getElementById("text");
    this.nameWrap = document.getElementById("nameDuckWrap");
    this.nameButton = document.getElementById("nameDuck");
    this.nameForm = document.getElementById("nameForm");
    this.nameInput = document.getElementById("nameInput");

    this.label = this.mount("duck-name");
    this.label.style.display = "none";
    this.shadowEl = this.mount("duck-shadow");

    this.SCALE = 2;
    this.FW = 27;
    this.FH = 27;
    this.name = null;
    this.born = Date.now();
    this.state = DuckState.WALK;
    this.frame = 0;
    this.frameT = 0;
    this.deadT = 0;
    this.particles = [];
    this.loc = { x: innerWidth / 2, y: innerHeight / 4 };
    this.target = { ...this.loc };

    Object.assign(this.el.style, {
      width: `${this.FW * this.SCALE}px`, height: `${this.FH * this.SCALE}px`,
      position: "absolute", backgroundRepeat: "no-repeat", backgroundSize: "auto 100%",
      imageRendering: "pixelated", backgroundImage: `url('${this.state.image}')`,
    });

    document.addEventListener("mousemove", (e) => {
      if (this.dead) return;
      this.target = { x: e.clientX, y: e.clientY };
    });
    document.getElementById("trigger").addEventListener("click", () => this.die());
    this.nameButton.addEventListener("click", () => {
      this.nameButton.hidden = true;
      this.nameForm.hidden = false;
      this.nameInput.focus();
    });
    this.nameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = this.nameInput.value.trim();
      if (!v) return;
      this.name = v;
      this.nameForm.hidden = true;
      this.label.textContent = v;
      this.label.style.display = "block";
    });
  }

  get dead() { return this.state === DuckState.DEAD; }

  mount(cls) {
    const el = document.createElement("div");
    el.className = cls;
    document.body.appendChild(el);
    return el;
  }

  update(dt) {
    this.stepParticles(dt);
    if (this.dead) { this.animateDeath(dt / 60); return; }

    const dx = this.target.x - this.loc.x, dy = this.target.y - this.loc.y;
    const dist = Math.hypot(dx, dy);
    this.el.style.transform = dx > 0 ? "scaleX(-1)" : "scaleX(1)";

    const st = dist > 1000 ? DuckState.FLY : dist > 20 ? DuckState.WALK : DuckState.IDLE;
    if (st !== this.state) this.setState(st);

    const sec = dt / 60;
    if (st !== DuckState.IDLE) {
      const speed = (st === DuckState.FLY ? 120 : 40) * sec;
      this.loc.x += Math.sign(dx) * speed;
      this.loc.y += Math.sign(dy) * speed;
    }
    if ((this.frameT += sec) >= 0.09) {
      this.frameT -= 0.09;
      if (st === DuckState.IDLE) this.idleStep();
      else this.frame = (this.frame + 1) % st.frames;
    }
    this.setFrame(this.frame);
    this.position();
  }

  setState(st) {
    for (const k in DuckState) this.el.classList.remove(DuckState[k].cls);
    this.el.classList.add(st.cls);
    this.el.style.backgroundImage = `url('${st.image}')`;
    this.state = st;
    this.frame = 0;
  }

  // The original's charmingly random idle blink/preen.
  idleStep() {
    const f = this.frame;
    if (f === 0 && Math.random() < 0.01) this.frame = 1;
    else if (f === 1 && Math.random() < 0.1) this.frame = 2;
    else if (f === 2 && Math.random() < 0.001) this.frame = 3;
    else if (f === 3 && Math.random() < 0.1) this.frame = 4;
    else if (f === 4 && Math.random() < 0.01) this.frame = 0;
  }

  setFrame(frame) {
    this.el.style.backgroundPosition = `${-(frame * this.FW * this.SCALE)}px 0px`;
  }

  position() {
    const x = Math.round(this.loc.x), y = Math.round(this.loc.y);
    const c = (this.SCALE * this.FW) / 2;
    this.el.style.left = `${x - c}px`;
    this.el.style.top = `${y - c}px`;
    this.shadowEl.style.left = `${x + 3}px`;
    this.shadowEl.style.top = `${y + c * 0.5}px`;
    if (this.name) {
      this.label.style.left = `${x}px`;
      this.label.style.top = `${y - c - 4}px`;
    }
  }

  // ---- death ---------------------------------------------------------------

  die() {
    if (this.dead) return;
    this.nameWrap.style.display = "none";
    if (this.name) return this.explodeAndBury();

    this.setState(DuckState.DEAD);
    setTimeout(() => this.typeOut(this.text, ["Why", " did", " you", " kill", " me", ".", ".", ".", "?"], 400), 2000);
  }

  animateDeath(sec) {
    if (this.frame >= DuckState.DEAD.frames - 1) return;
    if ((this.deadT += sec) >= 0.07) {
      this.deadT -= 0.07;
      this.frame++;
      this.setFrame(this.frame);
    }
  }

  explodeAndBury() {
    this.state = DuckState.DEAD;
    this.el.classList.add(DuckState.DEAD.cls);
    this.el.style.display = "none";
    this.label.style.display = "none";
    this.shadowEl.style.display = "none";

    const { x, y } = this.loc;
    const duck = { name: this.name, died: new Date().toISOString(), age: (Date.now() - this.born) / 1000 };
    this.spawnExplosion(x, y);
    this.graveyard.addGrave(duck, x, y, this.scene.depthAt(y));
    this.graveyard.record(duck);
    this.text.innerText = `Here lies ${this.name}.`;
    this.graveyard.reveal(this.name);
  }

  typeOut(el, parts, ms) {
    el.innerText = "";
    let i = 0;
    const id = setInterval(() => {
      el.innerText += parts[i++];
      if (i >= parts.length) clearInterval(id);
    }, ms);
  }

  // ---- explosion particles -------------------------------------------------

  spawnExplosion(x, y) {
    for (let i = 0; i < 24; i++) {
      const el = this.mount("duck-particle");
      el.style.background = Math.random() < 0.72 ? "#2b2733" : "#6a58a0";
      const ang = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4.5;
      this.particles.push({
        el, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 2.5,
        life: 0, dur: (550 + Math.random() * 350) / 16.67,
      });
    }
  }

  stepParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const k = (p.life += dt) / p.dur;
      if (k >= 1) { p.el.remove(); this.particles.splice(i, 1); continue; }
      p.vy += 0.28 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.el.style.left = `${p.x}px`;
      p.el.style.top = `${p.y}px`;
      p.el.style.opacity = `${1 - k}`;
    }
  }
}
