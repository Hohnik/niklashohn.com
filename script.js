const Direction = Object.freeze({
  LEFT: "left",
  RIGHT: "right",
})

const State = Object.freeze({
  STAYING: { image: "./animation/raven_stay.png", framecount: 1, className: "staying" },
  WALKING: { image: "./animation/raven_walk.png", framecount: 4, className: "walking" },
  DEAD: { image: "./animation/raven_death.png", framecount: 11, className: "dead" }
})

class PixelRaven {
  constructor() {
    this.ravenElement = document.getElementById("pet");
    this.deathButton = document.getElementById("trigger");

    this.scale = 2;
    this.movementSpeed = 20
    this.frameWidth = 27;
    this.frameHeight = 27;

    this.currentState = State.WALKING
    this.currentImage = this.walkImage
    this.currentFrame = 0;
    this.tick = 0;
    this.currentLocation = { x: 80, y: 80 };
    this.targetLocation = { x: window.innerWidth / 2, y: window.innerHeight / 4 };
    this.direction = Direction.RIGHT

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
    if (distance > 20) {
      this.updateClass(State.STAYING.className);
      this.currentState = State.WALKING
      this.walk(dx, dy);
    } else {
      this.updateClass(State.STAYING.className)
      this.currentState = State.STAYING
      this.stay()
    }
    this.updatePosition();
  }

  stay() {
    this.ravenElement.style.backgroundImage = `url('${State.STAYING.image}')`;
    this.updateFrame(0)

  }

  walk(dx, dy) {
    this.ravenElement.style.backgroundImage = `url('${State.WALKING.image}')`;

    const walkArea = 10
    if (Math.abs(dx) > walkArea) {
      this.currentLocation.x += Math.sign(dx) * this.scale;
    }
    if (Math.abs(dy) > walkArea) {
      this.currentLocation.y += Math.sign(dy) * this.scale;
    }

    this.updateFrame(this.tick % (State.WALKING.framecount))
  }

  die() {
    if (this.currentState == State.DEAD) return;
    this.currentState = State.DEAD
    clearInterval(this.updateInterval);

    this.ravenElement.style.backgroundImage = `url('${State.DEAD.image}')`;
    this.currentFrame = 0;
    const animationInterval = setInterval(() => {
      this.updateFrame(this.currentFrame);
      this.currentFrame++;

      if (this.currentFrame >= State.DEAD.framecount - 1) {
        clearInterval(animationInterval);
      }
    }, 100);
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
  const imageUrls = ["animation/raven_stay.png", "animation/raven_walk.png", "animation/raven_death.png"];
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
