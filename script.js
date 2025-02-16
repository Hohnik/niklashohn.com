const State = Object.freeze({
  IDLE: { image: "./animation/raven_idle.png", framecount: 5, className: "idle" },
  STAY: { image: "./animation/raven_stay.png", framecount: 1, className: "staying" },
  WALK: { image: "./animation/raven_walk.png", framecount: 4, className: "walking" },
  FLY: { image: "./animation/raven_fly.png", framecount: 6, className: "flying" },
  DEAD: { image: "./animation/raven_death.png", framecount: 11, className: "dead" }
})

class PixelRaven {
  constructor() {
    this.ravenElement = document.getElementById("pet");
    this.deathButton = document.getElementById("trigger");
    this.text = document.getElementById("text");

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
    }, 100);


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

  updatePosition() {
    const x = Math.round(this.currentLocation.x)
    const y = Math.round(this.currentLocation.y)
    const center = (this.scale * this.frameWidth) / 2;

    this.ravenElement.style.left = `${x - center}px`;
    this.ravenElement.style.top = `${y - center}px`;
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
