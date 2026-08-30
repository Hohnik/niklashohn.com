/* tools/contrast.mjs — a check of the text contrast.

   WCAG AA asks for a contrast of 4.5 to 1 for normal text, and 3
   to 1 for large text. Large text is 24 pixels or more, or 18.66
   pixels or more with a weight of 700.

   Much of the text on the sheets uses opacity. Opacity changes the
   contrast, and the four sheet skins have different backgrounds.
   So this tool opens the page, selects each skin, and measures the
   colour that a person really sees.

   Run it like this:

     node tools/contrast.mjs

   The tool gives a report and stops with an error if a value is
   below the limit. */
import { chromium } from 'playwright';
import { startServer, origin } from './static-server.mjs';

const PORT = Number(process.env.PORT || 8748);
const SKINS = ['paper', 'card', 'terminal', 'blueprint'];

/* Each pair is a selector inside the open sheet, and the beacon
   that shows it. The selector is relative to the sheet, because
   the page holds all three sheets and hides two of them. */
const TARGETS = [
  ['h1', 'home'], ['.lead', 'home'], ['p', 'home'],
  ['.eyebrow', 'home'], ['.keys li', 'home'], ['.quiet', 'home'],
  ['h2', 'about'], ['.chips span', 'about'], ['.links a', 'about'],
  ['.proj-name', 'projects'], ['.proj-desc', 'projects'],
  ['.proj-meta', 'projects'], ['.proj-topics span', 'projects'],
  ['.proj-star', 'projects'], ['#proj-source', 'projects'],
  ['#proj-search', 'projects'], ['.proj-langs button', 'projects'],
  ['.proj-sort button', 'projects']
];

const server = await startServer(PORT);
const BASE = origin(server);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.route('**://api.github.com/**', r => r.abort());

const problems = [];
const skipped = [];
let checked = 0;

for (const beacon of ['home', 'about', 'projects']) {
  await page.goto(`${BASE}/index.html#${beacon}`, { waitUntil: 'load' });
  await page.waitForFunction(b => NH.UI.openId === b, beacon, { timeout: 20000 });
  await page.waitForTimeout(700);

  for (const skin of SKINS) {
    await page.evaluate(s => NH.cfg.set('panel', NH.cfg.feature('panel').options
      .findIndex(o => o.value === s)), skin);
    await page.waitForTimeout(200);

    const rows = await page.evaluate(sels => {
      const parse = s => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
      const lum = c => {
        const [r, g, b] = c.map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => {
        const x = lum(a) + 0.05, y = lum(b) + 0.05;
        return +(Math.max(x, y) / Math.min(x, y)).toFixed(2);
      };
      /* Give the colour and how much of it you see. A background
         with an alpha of 0.22 lets 78 percent of the colour below
         it through. To read only the three numbers makes a light
         grey film look like solid grey. */
      const rgba = s => {
        const n = (String(s).match(/[\d.]+/g) || []).map(Number);
        if (n.length < 3) return null;
        return { c: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 };
      };
      const over = (top, bottom) => bottom.map((v, i) => top.c[i] * top.a + v * (1 - top.a));

      const measure = el => {
        /* Collect each background from the element to the root,
           then put them one on the other from the root down. Thus
           a stack of clear films gives the colour that a person
           really sees. */
        const films = [];
        for (let n = el; n; n = n.parentElement) {
          const c = rgba(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0) films.push(c);
          if (c && c.a >= 1) break;
        }
        let bg = [255, 255, 255];
        for (let i = films.length - 1; i >= 0; i--) bg = over(films[i], bg);
        const cs = getComputedStyle(el);
        let op = 1;
        for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity || 1);
        const fg = parse(cs.color).map((v, i) => v * op + bg[i] * (1 - op));
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
        return { ratio: ratio(fg, bg), need: large ? 3 : 4.5, size, opacity: +op.toFixed(2),
                 text: (el.textContent || '').trim().slice(0, 18) };
      };

      return sels.map(sel => {
        /* Look inside the sheet that is open. Otherwise a plain
           selector finds the same element in a hidden sheet, the
           element has no box, and the check passes without a
           measurement. */
        const doc = document.querySelector('.doc.on');
        const all = doc ? Array.prototype.slice.call(doc.querySelectorAll(sel)) : [];
        /* Measure each element that the selector finds, and keep
           the worst. A button that is not pressed is more weak
           than a pressed button. Only the worst one shows if a
           person can read the row. */
        const rows = all.filter(el => el.getClientRects().length).map(measure);
        if (!rows.length) return { sel, skip: true };
        let worst = rows[0];
        rows.forEach(r => { if (r.ratio - r.need < worst.ratio - worst.need) worst = r; });
        return Object.assign({ sel: sel, count: rows.length }, worst);
      });
    }, TARGETS.filter(t => t[1] === beacon).map(t => t[0]));

    for (const r of rows) {
      if (r.skip) { skipped.push(`${skin} / ${beacon}  ${r.sel}`); continue; }
      checked++;
      if (r.ratio < r.need) {
        problems.push(`${skin} / ${beacon}  ${r.sel}  ${r.ratio}:1 (needs ${r.need}:1, ` +
                      `${r.size}px, opacity ${r.opacity}, worst of ${r.count}: "${r.text}")`);
      }
    }
  }
}

await browser.close();
server.close();

if (skipped.length) {
  /* A target with no box means the check did not run. That is a
     fault in this tool or in the page, and not a pass. */
  console.log(`Contrast: ${skipped.length} targets had no box, so they were not measured:`);
  skipped.forEach(s => console.log('  MISS  ' + s));
  console.log('');
}
if (problems.length || skipped.length) {
  if (problems.length) {
    console.log(`Contrast: ${problems.length} of ${checked} measurements are below WCAG AA.\n`);
    problems.forEach(p => console.log('  FAIL  ' + p));
  }
  process.exit(1);
}
console.log(`Contrast: all ${checked} measurements meet WCAG AA.`);
