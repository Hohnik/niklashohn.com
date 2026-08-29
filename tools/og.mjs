/* Renders og.png, the social card, from the site itself — so the
   preview is always the real thing rather than a drawing of it.

     node tools/og.mjs

   Frames the Start beacon on the right and the plane banking in
   from the lower left. The summit's drawn height is exactly
   LEVELS * lift above its map position, which is what makes the
   composition repeatable without any guessing.
*/
import { chromium } from 'playwright';
import { startServer } from './static-server.mjs';

const PORT = Number(process.env.PORT || 8761);
const server = await startServer(PORT);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.route('**://api.github.com/**', r => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);

await page.evaluate(() => {
  NH.cfg.reset();
  const st = NH.Flight.state;
  const W = NH.World.cells.w, H = NH.World.cells.h;
  const lift = NH.cfg.get('lift');
  const camX = 0 - W * 0.72;
  const camY = (-173 + NH.LEVELS * lift) - H * 0.70;
  NH.Flight.update = function () { st.cam.x = camX; st.cam.y = camY; };

  st.pos.x = camX + W * 0.22;
  st.pos.y = camY + H * 0.03;
  st.heading = 0.42;
  st.bank = -0.5;
  st.trail.length = 0;
  for (let i = 1; i < 10; i++) {
    st.trail.push({
      x: st.pos.x - Math.cos(st.heading) * i * 7,
      y: st.pos.y - Math.sin(st.heading) * i * 7,
      life: 1 - i / 11
    });
  }
  document.getElementById('panel').hidden = true;
  ['hud', 'hint', 'quicknav', 'devchip', 'labels'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
});
await page.waitForTimeout(1000);
await page.screenshot({ path: 'og.png' });
console.log('wrote og.png (1200x630)');

await browser.close();
server.close();
