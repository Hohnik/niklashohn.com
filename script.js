class PixelRaven {
  constructor() {
    this.raven = document.getElementById("pet");
    this.button = document.getElementById("trigger");

    this.pixelSize = 2;
    this.frameWidth = 27;
    this.frameHeight = 27;
    this.walkFrames = 4;
    this.deathFrames = 11;

    this.walkImage = "animation/raven_walk.png";
    this.deathImage = "animation/raven_death.png";

    this.setupSprite();

    this.position = { x: 20, y: 20 };
    this.target = { ...this.position };
    this.currentFrame = 0;
    this.isDead = false;

    this.setupEventListeners();
    this.startMovementLoop();
  }

  setupSprite() {
    Object.assign(this.raven.style, {
      width: `${this.frameWidth * this.pixelSize}px`,
      height: `${this.frameHeight * this.pixelSize}px`,
      backgroundImage: `url('${this.walkImage}')`,
      backgroundSize: `auto 100%`,
      backgroundRepeat: "no-repeat",
      position: "absolute",
      imageRendering: "pixelated",
    });
  }

  setupEventListeners() {
    document.addEventListener("mousemove", (e) => {
      if (!this.isDead) {
        this.target = { x: e.clientX, y: e.clientY };
      }
    });

    this.button.addEventListener("click", () => this.die());
  }

  startMovementLoop() {
    this.moveInterval = setInterval(() => {
      if (!this.isDead) {
        this.move();
      }
    }, 100);
  }

  move() {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > this.pixelSize * 2) {
      this.handleMovement(dx, dy);
    } else {
      this.raven.classList.remove("walking");
    }

    this.updatePosition();
  }

  handleMovement(dx, dy) {
    this.raven.classList.toggle("facing-left", dx > 0);
    this.raven.classList.add("walking");
    this.raven.style.backgroundImage = `url('${this.walkImage}')`;

    if (Math.abs(dx) >= this.pixelSize) {
      this.position.x += Math.sign(dx) * this.pixelSize;
    }
    if (Math.abs(dy) >= this.pixelSize) {
      this.position.y += Math.sign(dy) * this.pixelSize;
    }
  }

  updatePosition() {
    const roundedX = Math.round(this.position.x / this.pixelSize) * this.pixelSize;
    const roundedY = Math.round(this.position.y / this.pixelSize) * this.pixelSize;
    const offset = (this.pixelSize * this.frameWidth) / 2;

    this.raven.style.left = `${roundedX - offset}px`;
    this.raven.style.top = `${roundedY - offset}px`;
  }

  die() {
    if (this.isDead) return;

    this.isDead = true;
    clearInterval(this.moveInterval);
    this.raven.classList.remove("walking");
    this.playDeathAnimation();
  }

  playDeathAnimation() {
    this.raven.style.backgroundImage = `url('${this.deathImage}')`;
    this.currentFrame = 0;

    const animationInterval = setInterval(() => {
      this.updateFrame(this.currentFrame);
      this.currentFrame++;

      if (this.currentFrame >= this.deathFrames) {
        clearInterval(animationInterval);
        this.updateFrame(this.deathFrames - 1);
      }
    }, 150);
  }

  updateFrame(frame) {
    const position = -(frame * this.frameWidth * this.pixelSize);
    this.raven.style.backgroundPosition = `${position}px 0px`;
  }
}

function initializeRaven() {
  const imageUrls = ["animation/raven_walk.png", "animation/raven_death.png"];
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
