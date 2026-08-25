const canvas = document.querySelector('#flow-canvas');
const ctx = canvas?.getContext('2d');

function drawFlowField() {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const colors = ['#d8ff3e', '#d95132', '#82a5a3', '#f2efe5'];
  const lines = Math.max(55, Math.floor(rect.width / 12));
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.8;

  for (let i = 0; i < lines; i++) {
    let x = (i / lines) * rect.width + Math.sin(i) * 13;
    let y = rect.height * (0.15 + ((i * 37) % 70) / 100);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 85; step++) {
      const angle = Math.sin(x * 0.011) * 1.9 + Math.cos(y * 0.014) * 1.5 + i * 0.015;
      x += Math.cos(angle) * 4.2;
      y += Math.sin(angle) * 4.2;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = colors[i % colors.length];
    ctx.stroke();
  }
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawFlowField, 120);
});
drawFlowField();

const visual = document.querySelector('.hero-visual');
if (visual && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  visual.addEventListener('pointermove', (event) => {
    const rect = visual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    visual.querySelector('.portrait-frame').style.transform = `translate(${x * 8}px, ${y * 8}px)`;
    visual.querySelectorAll('.floating-card').forEach((card, index) => {
      const depth = index ? -13 : 17;
      card.style.translate = `${x * depth}px ${y * depth}px`;
    });
  });
  visual.addEventListener('pointerleave', () => {
    visual.querySelector('.portrait-frame').style.transform = '';
    visual.querySelectorAll('.floating-card').forEach(card => card.style.translate = '');
  });
}
