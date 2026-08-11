// Entry point: build the scene, graveyard and duck, then drive them from a
// single animation loop. The uptime clock ticks until the duck dies.
window.addEventListener("load", () => {
  const scene = new Scene(document.getElementById("rainCanvas"));
  const graveyard = new Graveyard(scene);
  const duck = new Duck({ scene, graveyard });

  let last = performance.now();
  const frame = (now) => {
    let dt = (now - last) / 16.67; // ~1 per 60fps frame
    last = now;
    if (dt > 3) dt = 3; // clamp after the tab was backgrounded
    scene.update(dt, now / 1000);
    scene.draw();
    duck.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const clock = document.getElementById("timer");
  const start = Math.floor(Date.now() / 1000);
  setInterval(() => {
    if (duck.dead) return;
    clock.textContent = formatTime(Math.floor(Date.now() / 1000) - start);
  }, 500);
});

function formatTime(seconds) {
  const s = seconds % 60;
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
