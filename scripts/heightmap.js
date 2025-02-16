const config = {
  pixelSize: 8,
  noiseScale: 500,
  contourLevels: 6,
  baseColor: '#8872b8',
  animationSpeed: 0.0001,
};

const canvas = document.getElementById('heightmap');
const ctx = canvas.getContext('2d');
const noise = new SimplexNoise();
let time = 0;

function setupCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.zIndex = '-1';
  canvas.style.pointerEvents = 'none';
}

function generateHeightmap() {
  for (let y = 0; y < canvas.height; y += config.pixelSize) {
    for (let x = 0; x < canvas.width; x += config.pixelSize) {
      const noiseValue = noise.noise3D(x / config.noiseScale, y / config.noiseScale, time);
      const normalizedValue = (noiseValue + 1) / 2;
      const band = Math.floor(normalizedValue * config.contourLevels);
      ctx.fillStyle = getColorForBand(band);
      ctx.fillRect(x, y, config.pixelSize, config.pixelSize);
    }
  }
}

function getColorForBand(band) {
  const maxBrightness = 70;
  const minBrightness = 52;
  const brightnessStep = (maxBrightness - minBrightness) / (config.contourLevels - 1);
  const brightness = minBrightness + band * brightnessStep;
  return `hsl(260, 30%, ${brightness}%)`;
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  generateHeightmap();
  time += config.animationSpeed;
  requestAnimationFrame(animate);
}

setupCanvas();
animate();

window.addEventListener('resize', () => {
  setupCanvas();
});
