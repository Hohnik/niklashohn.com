/* This tool makes og.png, the preview card, from the site. Thus
   the preview always shows the real page.

     node tools/og.mjs

   The frame puts the Start beacon at the right. The plane comes in
   from the lower left, and it rolls into its turn.

   The site draws each summit at exactly LEVELS * lift cells above
   its map position. This tool knows that number. So it gives the
   same frame every time. */
import { chromium } from 'playwright';
import { startServer, origin } from './static-server.mjs';

const PORT = Number(process.env.PORT || 8761);
const server = await startServer(PORT);
const BASE = origin(server);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.route('**://api.github.com/**', r => r.abort());
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);

await page.evaluate(() => {
  NH.cfg.reset();
  const st = NH.Flight.state;
  const W = NH.World.cells.w, H = NH.World.cells.h;
  const lift = NH.cfg.v.lift;
  const camX = 0 - W * 0.72;
  const camY = (-173 + NH.LEVELS * lift) - H * 0.70;
  NH.Flight.update = function () { st.cam.x = camX; st.cam.y = camY; };

  st.pos.x = camX + W * 0.22;
  st.pos.y = camY + H * 0.03;
  st.heading = 0.42;
  st.bank = -0.5;
  /* The trail is a fixed set of slots, so write into them. */
  st.trail.forEach((t, i) => {
    t.x = st.pos.x - Math.cos(st.heading) * i * 7;
    t.y = st.pos.y - Math.sin(st.heading) * i * 7;
    t.life = 1 - i / 11;
  });
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
