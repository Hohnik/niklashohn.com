const State = Object.freeze({
  IDLE: { image: "./animation/raven_idle.png", framecount: 5, className: "idle" },
  WALK: { image: "./animation/raven_walk.png", framecount: 4, className: "walking" },
  FLY: { image: "./animation/raven_fly.png", framecount: 6, className: "flying" },
  DEAD: { image: "./animation/raven_death.png", framecount: 24, className: "dead" }
})

class PixelRaven {
  constructor() {
    this.ravenElement = document.getElementById("pet");
    this.deathButton = document.getElementById("trigger");
    this.text = document.getElementById("text");

    // Naming UI.
    this.nameButton = document.getElementById("nameDuck");
    this.nameForm = document.getElementById("nameForm");
    this.nameInput = document.getElementById("nameInput");
    this.nameWrap = document.getElementById("nameDuckWrap");
    this.name = null;
    this.nameLabel = document.createElement("div");
    this.nameLabel.className = "duck-name";
    this.nameLabel.style.display = "none";
    document.body.appendChild(this.nameLabel);

    this.scale = 2;
    this.movementSpeed = 20
    this.frameWidth = 27;
    this.frameHeight = 27;

    this.currentState = State.WALK
    this.currentImage = this.walkImage
    this.currentFrame = 0;
    this.tick = 0;
    this.currentLocation = { x: window.innerWidth / 2, y: window.innerHeight / 4 };
    this.targetLocation = { x: window.innerWidth / 2, y: window.innerHeight / 4 };

    this.setupSprite();
    this.setupEventListeners();
    this.setupNaming();
    this.setupLoop();
  }

  setupSprite() {
    Object.assign(this.ravenElement.style, {
      width: `${this.frameWidth * this.scale}px`,
      height: `${this.frameHeight * this.scale}px`,
      backgroundImage: `url('${this.currentImage}')`,
      backgroundSize: `auto 100%`,
      backgroundRepeat: "no-repeat",
      position: "absolute",
      imageRendering: "pixelated",
    });
  }

  setupEventListeners() {
    document.addEventListener("mousemove", (e) => {
      if (this.currentState == State.DEAD) return
      this.targetLocation = { x: e.clientX, y: e.clientY };
    });

    this.deathButton.addEventListener("click", () => this.die());
  }

  setupNaming() {
    this.nameButton.addEventListener("click", () => {
      this.nameButton.hidden = true;
      this.nameForm.hidden = false;
      this.nameInput.focus();
    });
    this.nameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = this.nameInput.value.trim();
      if (!value) return;
      this.name = value;
      this.nameForm.hidden = true;
      this.nameLabel.textContent = value;
      this.nameLabel.style.display = "block";
    });
  }

  setupLoop() {
    this.updateInterval = setInterval(() => this.update(), 1000 / this.movementSpeed)
    this.tickInterval = setInterval(() => this.tick++, 100)
  }

  update() {
    const dx = this.targetLocation.x - this.currentLocation.x;
    const dy = this.targetLocation.y - this.currentLocation.y;
    const distance = Math.hypot(dx, dy);
    if (dx > 0) this.ravenElement.style.transform = "scaleX(-1)"
    else this.ravenElement.style.transform = "scaleX(1)"


    if (this.currentState == State.DEAD) return
    if (distance > 1000) {
      this.updateClass(State.FLY.className)
      this.currentState = State.FLY
      this.fly(dx, dy)
    }
    else if (distance > 20) {
      this.currentFrame = 0
      this.updateClass(State.WALK.className);
      this.currentState = State.WALK
      this.walk(dx, dy);
    } else {
      this.updateClass(State.IDLE.className)
      this.currentState = State.IDLE
      this.idle()
    }
    this.ravenElement.style.backgroundImage = `url('${this.currentState.image}')`;
    this.updatePosition();
  }

  idle() {
    if (Math.random() < 0.01 && this.currentFrame == 0) this.currentFrame++
    else if (Math.random() < 0.1 && this.currentFrame == 1) this.currentFrame++
    else if (Math.random() < 0.001 && this.currentFrame == 2) this.currentFrame++
    else if (Math.random() < 0.1 && this.currentFrame == 3) this.currentFrame++
    else if (Math.random() < 0.01 && this.currentFrame == 4) this.currentFrame = this.currentFrame = 0

    this.updateFrame(this.currentFrame)
  }

  walk(dx, dy) {
    this.currentLocation.x += Math.sign(dx) * this.scale;
    this.currentLocation.y += Math.sign(dy) * this.scale;
    this.updateFrame(this.tick % this.currentState.framecount)
  }

  fly(dx, dy) {
    const flyingSpeed = 3
    this.currentLocation.x += Math.sign(dx) * this.scale * flyingSpeed;
    this.currentLocation.y += Math.sign(dy) * this.scale * flyingSpeed;
    this.updateFrame(this.tick % this.currentState.framecount)
  }

  die() {
    if (this.currentState == State.DEAD) return;
    if (this.nameWrap) this.nameWrap.style.display = "none";

    // A named duck is a tragedy: it explodes into a permanent gravestone and
    // joins the shared graveyard. An unnamed one just plays the death animation.
    if (this.name) {
      this.explodeAndBury();
      return;
    }

    this.currentState = State.DEAD
    this.updateClass(this.currentState.className)
    this.ravenElement.style.backgroundImage = `url('${this.currentState.image}')`;
    clearInterval(this.updateInterval);

    let counter1 = 0;
    const animationInterval = setInterval(() => {
      this.updateFrame(counter1);
      counter1++;

      if (counter1 >= State.DEAD.framecount) {
        clearInterval(animationInterval);
      }
    }, 70);

    setTimeout(() => {
      let counter2 = 0
      this.text.innerText = ""
      let text = ["Why", " did", " you", " kill", " me", ".", ".", ".", "?"]
      const textInterval = setInterval(() => {
        this.text.innerText += text[counter2]
        counter2++;

        if (counter2 >= text.length) {
          clearInterval(textInterval);
        }
      }, 400);

    }, 2000)
  }

  explodeAndBury() {
    this.currentState = State.DEAD;
    this.updateClass(State.DEAD.className); // stops the timer (timer.js watches .dead)
    clearInterval(this.updateInterval);

    const x = this.currentLocation.x;
    const y = this.currentLocation.y;
    this.ravenElement.style.display = "none";
    this.nameLabel.style.display = "none";

    spawnExplosion(x, y);

    const depth = window.rainScene ? window.rainScene.depthAt(y) : 0.7;
    createGravestone(this.name, x, y, depth);

    const died = new Date().toISOString();
    if (window.GRAVEYARD) window.GRAVEYARD.recordDuck({ name: this.name, died });

    this.text.innerText = `Here lies ${this.name}.`;

    // Every raindrop that now falls raises one of the other fallen ducks, until
    // the whole graveyard has surfaced out of the fog.
    startGraveyardReveal(this.name);
  }

  updatePosition() {
    const x = Math.round(this.currentLocation.x)
    const y = Math.round(this.currentLocation.y)
    const center = (this.scale * this.frameWidth) / 2;

    this.ravenElement.style.left = `${x - center}px`;
    this.ravenElement.style.top = `${y - center}px`;

    if (this.name && this.currentState !== State.DEAD) {
      this.nameLabel.style.left = `${x}px`;
      this.nameLabel.style.top = `${y - center - 4}px`;
    }
  }

  updateFrame(frame) {
    const position = -(frame * this.frameWidth * this.scale);
    this.ravenElement.style.backgroundPosition = `${position}px 0px`;
  }

  updateClass(className) {
    for (let state in State) {
      this.ravenElement.classList.remove(State[state].className);
    }
    this.ravenElement.classList.add(className);

  }
}

// ---- Explosion + graveyard helpers -----------------------------------------

// Gravestone sprite sheet (7 variants of GS_W x GS_H), drawn at GS_DISP scale.
const GS_W = 40, GS_H = 48, GS_VARIANTS = 7, GS_DISP = 1.6;
const graveSprite = new Image();
graveSprite.src = "animation/gravestones.png";

// Fling a burst of pixel debris out from (x, y).
function spawnExplosion(x, y) {
  const count = 24;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "duck-particle";
    p.style.background = Math.random() < 0.72 ? "#2b2733" : "#6a58a0";
    document.body.appendChild(p);

    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4.5;
    let px = x, py = y;
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed - 2.5;
    const dur = 550 + Math.random() * 350;
    const start = performance.now();

    const step = (now) => {
      const k = (now - start) / dur;
      if (k >= 1) { p.remove(); return; }
      vy += 0.28;
      px += vx;
      py += vy;
      p.style.left = `${px}px`;
      p.style.top = `${py}px`;
      p.style.opacity = `${1 - k}`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// Build one tombstone at screen point (x, y). Perspective: nearer (lower on
// screen) => larger and drawn on top; farther => smaller, sinking into the fog.
function createGravestone(name, x, y, depth) {
  const grave = document.createElement("div");
  grave.className = "gravestone";
  grave.style.left = `${x}px`;
  grave.style.top = `${y}px`;
  grave.style.zIndex = String(Math.round(y));

  const lift = document.createElement("div");
  lift.className = "lift";
  lift.style.setProperty("--s", (0.55 + depth * 0.6).toFixed(2));

  // Render the chosen stone sprite + engraved name onto a pixel canvas.
  const stone = document.createElement("canvas");
  stone.className = "stone";
  stone.width = GS_W;
  stone.height = GS_H;
  stone.style.width = `${GS_W * GS_DISP}px`;
  stone.style.height = `${GS_H * GS_DISP}px`;
  const ctx = stone.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const variant = Math.floor(Math.random() * GS_VARIANTS);

  const paint = () => {
    ctx.clearRect(0, 0, GS_W, GS_H);
    ctx.drawImage(graveSprite, variant * GS_W, 0, GS_W, GS_H, 0, 0, GS_W, GS_H);
    // Engrave the name on the lower face.
    PixelFont.drawBox(ctx, name, 6, 23, 28, 17, "#3a3850");
  };
  if (graveSprite.complete && graveSprite.naturalWidth) paint();
  else graveSprite.addEventListener("load", paint, { once: true });

  lift.append(stone);
  grave.append(lift);
  document.getElementById("graveyard").appendChild(grave);
}

let revealState = null;

async function startGraveyardReveal(myName) {
  const all = window.GRAVEYARD ? await window.GRAVEYARD.fetchDucks() : [];

  // Drop one instance of our own name — we already planted that stone.
  const mine = all.findIndex((d) => d && d.name === myName);
  if (mine >= 0) all.splice(mine, 1);

  // Shuffle so the graveyard fills in organically.
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  revealState = { queue: all.slice(0, 80), last: 0 };
  if (!window.rainScene) return;

  window.rainScene.onLanding((p) => {
    if (!revealState || revealState.queue.length === 0) return;
    const now = performance.now();
    if (now - revealState.last < 260) return; // one gravestone per few raindrops
    revealState.last = now;
    const duck = revealState.queue.shift();
    // Keep stones fully on-screen (room for the name label below).
    const y = Math.min(window.innerHeight * 0.88, Math.max(window.innerHeight * 0.16, p.y));
    createGravestone(duck.name || "Unknown", p.x, y, window.rainScene.depthAt(y));
  });
}

function initializeRaven() {
  const imageUrls = ["animation/raven_stay.png", "animation/raven_walk.png", "animation/raven_death.png", "animation/raven_fly.png", "animation/raven_idle.png"];
  const imagePromises = imageUrls.map((url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = () => reject(`Failed to load ${url}`);
      img.src = url;
    });
  });

  Promise.all(imagePromises)
    .then(() => new PixelRaven())
    .catch(console.error);
}

window.addEventListener("load", initializeRaven);
