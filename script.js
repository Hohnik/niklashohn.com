class PixelRaven {
  constructor() {
    this.raven = document.getElementById("pet");
    this.pixelSize = 2;
    this.frameWidth = 27;
    this.frameCount = 4;
    this.currentFrame = 0;
    this.position = { x: 20, y: 20 };
    this.target = { ...this.position };

    this.updatePosition();
    document.addEventListener("mousemove", (e) => {
      this.target = { x: e.clientX, y: e.clientY };
    });

    setInterval(() => this.moveTowardTarget(), 100);
    setInterval(() => this.updateAnimation(), 150);
  }

  updatePosition() {
    const roundedX = Math.round(this.position.x / this.pixelSize) * this.pixelSize;
    const roundedY = Math.round(this.position.y / this.pixelSize) * this.pixelSize;
    const offset = (this.pixelSize * this.frameWidth) / 2;

    this.raven.style.left = `${roundedX - offset}px`;
    this.raven.style.top = `${roundedY - offset}px`;
  }

  moveTowardTarget() {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > this.pixelSize * 2) {
      this.raven.classList.toggle("facing-left", dx > 0);
      this.raven.classList.add("walking");

      if (Math.abs(dx) >= this.pixelSize) {
        this.position.x += Math.sign(dx) * this.pixelSize;
      }
      if (Math.abs(dy) >= this.pixelSize) {
        this.position.y += Math.sign(dy) * this.pixelSize;
      }
    } else {
      this.raven.classList.remove("walking");
    }

    this.updatePosition();
  }

  updateAnimation() {
    if (this.raven.classList.contains("walking")) {
      this.currentFrame = (this.currentFrame + 1) % this.frameCount;
      this.raven.style.backgroundPosition = `-${
        this.currentFrame * this.frameWidth * this.pixelSize
      }px 0px`;
    } else {
      this.currentFrame = 0;
      this.raven.style.backgroundPosition = "0 0";
    }
  }
}

window.addEventListener("load", () => {
  const images = [
    "animation/raven_stay.png",
    "animation/raven_walk.png",
  ].map((src) => {
    const img = new Image();
    img.src = src;
    return new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(`Failed to load ${src}`);
    });
  });

  Promise.all(images)
    .then(() => new PixelRaven())
    .catch(console.error);
});
