/* tools/verify.mjs — the browser tests.

   This tool drives a real Chromium against a local copy of the
   site. It tests the parts that break easily, and that a person
   does not see quickly:

   - The world draws.
   - A flight to a beacon opens the correct sheet.
   - Each option compiles, and it draws a different picture from
     its neighbours.
   - No group of options causes an error.

   Use one of these commands:

     node tools/verify.mjs            # serves this directory
     node tools/verify.mjs --keep     # keeps the screenshots
     BASE=http://host/ node tools/verify.mjs

   The screenshots go into .verify-shots/, which git ignores. */
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer, origin } from './static-server.mjs';

const PORT = Number(process.env.PORT || 8743);
const SHOTS = join(process.cwd(), '.verify-shots');
const KEEP = process.argv.includes('--keep');

const failures = [];
let passes = 0;
function check(name, cond, detail) {
  if (cond) { passes++; console.log('  ok    ' + name + (detail ? '  — ' + detail : '')); }
  else { failures.push(name + (detail ? ': ' + detail : '')); console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
function section(n, title) { console.log('\n[' + n + '] ' + title); }

/* The server can move to a different port if the first one is
   busy. So BASE is not known before the server listens. */
let BASE = process.env.BASE || '';

/* This list keeps the GitHub path the same on each run, and it
   needs no network. It holds two real repositories, one fork and
   the profile repository. Thus the tests use the filter, and they
   do not assume that it works. */
const GITHUB_STUB = [
  { name: 'noc-examples-pygame', description: 'stubbed live entry', language: 'Python',
    stargazers_count: 16, html_url: 'https://github.com/Hohnik/noc-examples-pygame',
    pushed_at: '2026-08-14T00:00:00Z', fork: false, archived: false },
  { name: 'LaRobot', description: null, language: 'Python', stargazers_count: 4,
    html_url: 'https://github.com/Hohnik/LaRobot', pushed_at: '2026-08-28T00:00:00Z',
    fork: false, archived: false },
  { name: 'Hohnik', description: 'profile readme', language: null, stargazers_count: 0,
    html_url: 'https://github.com/Hohnik/Hohnik', pushed_at: '2026-07-11T00:00:00Z',
    fork: false, archived: false },
  { name: 'a-fork', description: null, language: 'C', stargazers_count: 99,
    html_url: 'https://github.com/Hohnik/a-fork', pushed_at: '2026-07-11T00:00:00Z',
    fork: true, archived: false }
];

async function open(browser, opts = {}) {
  const { noStub, ...ctxOpts } = opts;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...ctxOpts });
  /* A call to readPixels outside a frame needs the draw buffer.
     So ask the browser to keep it. */
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl' || type === 'experimental-webgl') {
        attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
      }
      return orig.call(this, type, attrs);
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => {
    const why = (r.failure() || {}).errorText || '';
    /* ERR_ABORTED shows that the browser stopped a request,
       because the page went to a different address. The tests go
       to a different address on purpose. So a font that was still
       on its way is not a failure. */
    if (r.url().includes('api.github.com') || why.includes('ERR_ABORTED')) return;
    errors.push('requestfailed: ' + r.url() + ' ' + why);
  });
  if (!noStub) {
    await page.route('**://api.github.com/**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(GITHUB_STUB)
    }));
  }
  page.errors = errors;
  return { ctx, page };
}

/* A cheap mark of the picture on the canvas. It gives the number
   of different colours and a checksum of a grid of samples. Two
   options with the same mark are not two different options. */
const fingerprint = page => page.evaluate(() => {
  const c = document.getElementById('world');
  const gl = c.getContext('webgl');
  const px = new Uint8Array(c.width * c.height * 4);
  gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const seen = new Set();
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    seen.add(v);
    sum = (sum * 31 + v) >>> 0;
  }
  return { colours: seen.size, hash: sum, w: c.width, h: c.height };
});

const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + '.png') });

async function main() {
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });
  const server = process.env.BASE ? null : await startServer(PORT);
  if (server) BASE = origin(server) + '/index.html';

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--enable-webgl', '--ignore-gpu-blocklist']
  });

  let ctx, page;

  // ------------------------------------------------------- 1
  section(1, 'boot and first frame');
  ({ ctx, page } = await open(browser));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const gl = await page.evaluate(() => {
    const c = document.getElementById('world').getContext('webgl');
    if (!c) return { ok: false };
    const dbg = c.getExtension('WEBGL_debug_renderer_info');
    return { ok: true, renderer: dbg ? c.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?',
             uniforms: c.getParameter(c.MAX_FRAGMENT_UNIFORM_VECTORS),
             texUnits: c.getParameter(c.MAX_TEXTURE_IMAGE_UNITS),
             err: c.getError() };
  });
  console.log('       ' + gl.renderer);
  check('WebGL context created', gl.ok);
  check('no GL error after frames', gl.err === 0, 'code ' + gl.err);
  check('uniform budget sufficient', gl.uniforms >= 64, String(gl.uniforms));
  check('two texture units available', gl.texUnits >= 2, String(gl.texUnits));

  const fp = await fingerprint(page);
  console.log('       canvas ' + fp.w + 'x' + fp.h + ', ' + fp.colours + ' colours');
  check('terrain actually rendered', fp.colours > 20, fp.colours + ' colours');
  check('canvas sized in cells', fp.w > 100 && fp.w < 500, fp.w + ' cells wide');
  check('fallback notice hidden', await page.locator('#glfail').isHidden());
  await shot(page, '01-boot');

  // ------------------------------------------------------- 2
  section(2, 'the opening flight arrives at Start');
  await page.waitForFunction(() => NH.Flight.state.at === 'home', null, { timeout: 20000 }).catch(() => {});
  const intro = await page.evaluate(() => ({
    mode: NH.Flight.state.mode, at: NH.Flight.state.at,
    open: NH.UI.openId, visible: !document.getElementById('panel').hidden
  }));
  check('plane reached home and orbits', intro.mode === 'orbit' && intro.at === 'home', JSON.stringify(intro));
  check('home sheet opened', intro.open === 'home' && intro.visible);
  await shot(page, '02-home');

  // ------------------------------------------------------- 3
  section(3, 'navigating by flying');
  for (const [id, heading] of [['about', 'About'], ['projects', 'Projects']]) {
    await page.click(`button[data-fly="${id}"]`);
    await page.waitForFunction(w => NH.Flight.state.at === w, id, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(700);
    const r = await page.evaluate(w => ({
      at: NH.Flight.state.at, open: NH.UI.openId, hash: location.hash,
      title: (document.querySelector('#doc-' + w + '.on h1') || {}).textContent,
      said: document.getElementById('announce').textContent
    }), id);
    check('arrived at ' + id, r.at === id, JSON.stringify(r));
    check(id + ' sheet shown', r.open === id && r.title === heading);
    check(id + ' reflected in the url', r.hash === '#' + id);
    check(id + ' announced to assistive tech', /Arrived at/.test(r.said), r.said);
    await shot(page, '03-' + id);
  }

  const proj = await page.evaluate(() => ({
    cards: document.querySelectorAll('#proj-list .proj').length,
    source: document.getElementById('proj-source').textContent,
    langs: document.querySelectorAll('#proj-langs button').length,
    sorts: document.querySelectorAll('#proj-sort button').length,
    html: document.getElementById('proj-list').innerHTML
  }));
  check('project cards rendered', proj.cards === 2, proj.cards + ' cards');
  check('sort control rendered', proj.sorts === 3, proj.sorts + ' options');
  check('live source used when reachable', /live/.test(proj.source), proj.source);
  check('forks and the profile repo filtered out', !/a-fork|>Hohnik</.test(proj.html));
  check('language filters rendered', proj.langs >= 2, proj.langs + ' chips');

  // ------------------------------------------------------- 4
  section(4, 'the filter box does not steer the plane');
  await page.fill('#proj-search', 'larobot');
  await page.waitForTimeout(350);
  const filtered = await page.evaluate(() => ({
    cards: document.querySelectorAll('#proj-list .proj').length,
    first: (document.querySelector('.proj-name') || {}).textContent,
    at: NH.Flight.state.at
  }));
  check('filter narrows the list', filtered.cards === 1 && filtered.first === 'LaRobot', JSON.stringify(filtered));
  check('typing did not eject the plane', filtered.at === 'projects');
  await page.fill('#proj-search', '');
  await page.evaluate(() => document.activeElement.blur());

  await page.click('#proj-sort button[data-sort="name"]');
  await page.waitForTimeout(300);
  const sorted = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.proj-name')).map(e => e.textContent));
  check('sorting by name reorders the list',
        sorted.length === 2 && sorted[0] === 'LaRobot', sorted.join(', '));
  await page.click('#proj-sort button[data-sort="stars"]');
  await page.waitForTimeout(300);
  const restar = await page.evaluate(() =>
    (document.querySelector('.proj-name') || {}).textContent);
  check('sorting by stars puts the most-starred first',
        restar === 'noc-examples-pygame', restar);

  // ------------------------------------------------------- 5
  section(5, 'steering peels off');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(450);
  await page.keyboard.up('ArrowLeft');
  const gone = await page.evaluate(() => ({
    mode: NH.Flight.state.mode, open: NH.UI.openId,
    hidden: document.getElementById('panel').hidden, hash: location.hash
  }));
  check('back to flying', gone.mode === 'fly', JSON.stringify(gone));
  check('sheet closed', gone.open === null && gone.hidden === true);
  check('hash cleared', gone.hash === '');
  await shot(page, '04-flying');
  check('no console errors on the main flow', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ------------------------------------------------------- 6
  section(6, 'deep link lands on the beacon');
  ({ ctx, page } = await open(browser));
  await page.goto(BASE + '#projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const deep = await page.evaluate(() => ({
    at: NH.Flight.state.at, open: NH.UI.openId,
    cards: document.querySelectorAll('#proj-list .proj').length
  }));
  check('deep link placed the plane', deep.at === 'projects' && deep.open === 'projects', JSON.stringify(deep));
  check('deep link rendered the list', deep.cards === 2, deep.cards + ' cards');
  check('no errors on deep link', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ------------------------------------------------------- 7
  section(7, 'dev mode: every variant compiles, draws, and differs');
  ({ ctx, page } = await open(browser));
  await page.goto(BASE + '?dev', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  const reg = await page.evaluate(() => ({
    features: NH.FEATURES.length,
    presets: NH.PRESETS.length,
    cycles: document.querySelectorAll('.dev-cycle').length,
    toggles: document.querySelectorAll('.dev-toggle').length,
    groups: document.querySelectorAll('.dev-group').length,
    barOpen: !document.getElementById('devbar').hidden,
    combos: NH.FEATURES.reduce((n, f) => n * (f.type === 'toggle' ? 2 : f.options.length), 1),
    badPreset: NH.PRESETS.flatMap(p => Object.entries(p.set)
      .filter(([k, v]) => {
        const f = NH.cfg.feature(k);
        if (!f) return true;
        return f.type === 'toggle' ? typeof v !== 'boolean' : !(v >= 0 && v < f.options.length);
      }).map(([k]) => p.name + '.' + k))
  }));
  console.log('       ' + reg.features + ' features, ' + reg.combos.toExponential(2) + ' combinations');
  check('dev bar opens with ?dev', reg.barOpen);
  check('one widget per feature', reg.cycles + reg.toggles === reg.features,
        reg.cycles + '+' + reg.toggles + ' vs ' + reg.features);
  check('one cluster per group', reg.groups === 4, String(reg.groups));
  check('every preset names real options', reg.badPreset.length === 0, reg.badPreset.join(', '));
  await shot(page, '05-devbar');

  /* Step every option of every cycle and both states of every
     toggle. Anything that fails to compile shows up as a page
     error; anything that draws nothing shows up as one colour. */
  const feats = await page.evaluate(() => NH.FEATURES.map(f => ({
    key: f.key, type: f.type, n: f.options ? f.options.length : 2
  })));
  const VISUAL = ['terrain', 'scale', 'view', 'lift', 'pixel', 'palette', 'ink',
                  'light', 'water', 'plane', 'marker'];
  let blank = [], samey = [];
  for (const f of feats) {
    const seen = new Set();
    for (let i = 0; i < f.n; i++) {
      await page.evaluate(k => NH.cfg.step(k, 1), f.key);
      await page.waitForTimeout(300);
      const s = await fingerprint(page);
      if (s.colours <= 3) blank.push(f.key + '=' + await page.evaluate(k => NH.cfg.label(k), f.key));
      seen.add(s.hash);
    }
    if (VISUAL.includes(f.key) && seen.size < 2) samey.push(f.key + ' (' + seen.size + '/' + f.n + ')');
  }
  check('every variant draws something', blank.length === 0, blank.join(', '));
  check('every visual variant changes the picture', samey.length === 0, samey.join(', '));
  check('no errors sweeping all variants', page.errors.length === 0, page.errors.join(' | '));

  // presets and randomise
  await page.evaluate(() => NH.cfg.reset());
  const presetNames = await page.evaluate(() => NH.PRESETS.map(p => p.name));
  const presetHashes = new Set();
  for (let i = 0; i < presetNames.length; i++) {
    await page.click(`.dev-preset >> nth=${i}`);
    await page.waitForTimeout(420);
    presetHashes.add((await fingerprint(page)).hash);
    await shot(page, 'preset-' + presetNames[i].toLowerCase());
  }
  check('each preset gives a different picture', presetHashes.size === presetNames.length,
        presetHashes.size + '/' + presetNames.length);

  await page.evaluate(() => NH.cfg.reset());
  const before = (await fingerprint(page)).hash;
  await page.click('.dev-action >> nth=0');           // Random
  await page.waitForTimeout(500);
  const after = (await fingerprint(page)).hash;
  check('randomise changes the world', before !== after);
  await page.evaluate(() => NH.cfg.reset());
  await page.waitForTimeout(300);

  // reseed
  const seedBefore = (await fingerprint(page)).hash;
  await page.click('.dev-action >> nth=1');           // New world
  await page.waitForTimeout(500);
  check('new world reseeds the terrain', (await fingerprint(page)).hash !== seedBefore);
  check('no errors from presets or reseed', page.errors.length === 0, page.errors.join(' | '));

  // shareable looks
  const codec = await page.evaluate(() => {
    const a = NH.cfg.encode();
    NH.cfg.randomise();
    const b = NH.cfg.encode();
    const roundTrip = NH.cfg.decode(a) && NH.cfg.encode() === a;
    return {
      len: a.length, features: NH.FEATURES.length, differs: a !== b, roundTrip,
      rejects: NH.cfg.decode('1abc') === false &&
               NH.cfg.decode('2' + a.slice(1)) === false &&
               NH.cfg.decode('1z' + a.slice(2)) === false &&
               NH.cfg.decode(null) === false
    };
  });
  check('a look encodes to one character per feature', codec.len === codec.features + 1,
        codec.len + ' vs ' + (codec.features + 1));
  check('a look round-trips', codec.roundTrip && codec.differs);
  check('a malformed look is rejected', codec.rejects);

  // the button gives a real file
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('.dev-action >> nth=3');       // Save PNG
  const file = await dl;
  check('save png downloads a frame', !!file && /\.png$/.test(file.suggestedFilename()),
        file ? file.suggestedFilename() : 'no download');

  await page.evaluate(() => NH.cfg.reset());
  await ctx.close();

  section('7b', 'a shared look link opens with those settings');
  ({ ctx, page } = await open(browser));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  /* Pixel and lift are in this set on purpose. They change the
     size of the offscreen height texture, and thus the renderer
     must read them before it starts. A look that holds only
     colours cannot show that fault. */
  const shareCode = await page.evaluate(() => {
    NH.cfg.apply({ palette: 4, terrain: 1, marker: 3, panel: 2, pixel: 3, lift: 2 });
    return NH.cfg.encode();
  });
  /* Reset first, so the reload proves the link did the work and
     not the value left behind in localStorage. */
  await page.evaluate(() => NH.cfg.reset());
  await page.goto(BASE + '?look=' + shareCode, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const shared = await page.evaluate(() => ({
    palette: NH.cfg.label('palette'), terrain: NH.cfg.label('terrain'),
    marker: NH.cfg.label('marker'), panel: NH.cfg.label('panel'),
    pixel: NH.cfg.v.pixel, lift: NH.cfg.v.lift,
    cellW: NH.World.cells.w, wantW: Math.ceil(window.innerWidth / NH.cfg.v.pixel)
  }));
  check('shared link restores the look',
        shared.palette === 'Neon' && shared.terrain === 'Ridged' &&
        shared.marker === 'Ring' && shared.panel === 'Terminal', JSON.stringify(shared));
  check('shared link restores a size setting', shared.pixel === 8 && shared.lift === 3,
        'pixel ' + shared.pixel + ', lift ' + shared.lift);
  /* The renderer must use the shared cell size for the build. To
     hold the value is not enough. A link that arrives after
     the build gives the correct number here and a wrong picture. */
  check('the renderer is built at the shared cell size',
        Math.abs(shared.cellW - shared.wantW) <= 1,
        shared.cellW + ' cells wide, want about ' + shared.wantW);
  check('no errors opening a shared link', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ------------------------------------------------------- 8
  section(8, 'terrain generators and looks (screenshots)');
  ({ ctx, page } = await open(browser));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4200);
  const terrains = await page.evaluate(() => NH.cfg.feature('terrain').options.map(o => o.label));
  for (let i = 0; i < terrains.length; i++) {
    await page.evaluate(n => NH.cfg.set('terrain', n), i);
    await page.waitForTimeout(450);
    await shot(page, 'terrain-' + terrains[i].toLowerCase());
  }
  await page.evaluate(() => NH.cfg.reset());
  const palettes = await page.evaluate(() => NH.cfg.feature('palette').options.map(o => o.label));
  for (let i = 0; i < palettes.length; i++) {
    await page.evaluate(n => NH.cfg.set('palette', n), i);
    await page.waitForTimeout(400);
    await shot(page, 'palette-' + palettes[i].toLowerCase());
  }
  await page.evaluate(() => NH.cfg.reset());
  for (const [key, idx, name] of [['ink', 2, 'ink-index'], ['ink', 3, 'ink-cliffs'],
                                  ['light', 0, 'light-flat'], ['light', 2, 'light-rim'],
                                  ['marker', 3, 'marker-ring'], ['marker', 4, 'marker-cairn'],
                                  ['panel', 3, 'panel-blueprint'], ['trail', 2, 'trail-ribbon'],
                                  ['plane', 3, 'plane-wing'], ['plane', 4, 'plane-arrow']]) {
    await page.evaluate(([k, i]) => NH.cfg.set(k, i), [key, idx]);
    await page.waitForTimeout(400);
    await shot(page, name);
    await page.evaluate(() => NH.cfg.reset());
    await page.waitForTimeout(200);
  }
  check('no errors during the look sweep', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ------------------------------------------------------- 9
  section(9, 'keyboard, help overlay, persistence');
  ({ ctx, page } = await open(browser));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4200);
  await page.keyboard.press('2');
  await page.waitForFunction(() => NH.Flight.state.at === 'about', null, { timeout: 25000 }).catch(() => {});
  check('key 2 flies to About', await page.evaluate(() => NH.Flight.state.at === 'about'));
  await page.keyboard.press('?');
  await page.waitForTimeout(250);
  check('? opens the help overlay', await page.locator('#help').isVisible());
  await shot(page, '06-help');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('escape closes help first', await page.locator('#help').isHidden() &&
        await page.evaluate(() => NH.Flight.state.mode === 'orbit'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('escape then peels off', await page.evaluate(() => NH.Flight.state.mode === 'fly'));
  await page.keyboard.press('`');
  await page.waitForTimeout(250);
  check('backtick opens dev mode', await page.evaluate(() => !document.getElementById('devbar').hidden));
  check('hint fades once you take over',
        await page.evaluate(() => document.getElementById('hint').classList.contains('gone')));

  await page.evaluate(() => { NH.cfg.set('palette', 4); NH.cfg.set('terrain', 1); NH.cfg.set('ink', 2); });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const kept = await page.evaluate(() => ({
    palette: NH.cfg.label('palette'), terrain: NH.cfg.label('terrain'), ink: NH.cfg.label('ink')
  }));
  check('choices survive a reload', kept.palette === 'Neon' && kept.terrain === 'Ridged' && kept.ink === 'Index',
        JSON.stringify(kept));
  await page.evaluate(() => NH.cfg.reset());
  check('no errors on the keyboard flow', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ------------------------------------------------------ 10
  section(10, 'layout holds with the dev bar open');
  for (const [w, h, label] of [[1280, 800, 'desktop'], [1024, 700, 'laptop'],
                              [390, 844, 'phone'], [320, 568, 'small phone']]) {
    ({ ctx, page } = await open(browser, { viewport: { width: w, height: h } }));
    await page.goto(BASE + '?dev', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3800);
    const geo = await page.evaluate(() => {
      const box = sel => {
        const e = document.querySelector(sel);
        if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, r: b.right, b: b.bottom };
      };
      const hit = (a, c) => !!a && !!c && !(a.x > c.r || a.r < c.x || a.y > c.b || a.b < c.y);
      const bar = box('#devbar'), panel = box('#panel'), nav = box('#quicknav'), radar = box('#radar');
      return {
        barPanel: hit(bar, panel), barRadar: hit(bar, radar),
        /* On a phone the sheet is a bottom drawer and the nav
           deliberately floats over it. */
        panelNav: hit(panel, nav) && window.innerWidth > 640,
        offscreen: !!panel && (panel.y < -1 || panel.b > window.innerHeight + 1),
        scrollX: document.documentElement.scrollWidth > window.innerWidth + 1
      };
    });
    check(label + ': dev bar clear of the sheet', !geo.barPanel);
    check(label + ': dev bar clear of the radar', !geo.barRadar);
    check(label + ': sheet clear of the quick nav', !geo.panelNav);
    check(label + ': sheet fully on screen', !geo.offscreen);
    check(label + ': no horizontal overflow', !geo.scrollX);
    await shot(page, '07-layout-' + label);
    check(label + ': no errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  section('10b', 'touch devices get touch advice');
  ({ ctx, page } = await open(browser, {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
  }));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const hintText = await page.evaluate(() => document.getElementById('hint').textContent.trim());
  check('the hint names the touch gesture, not keys', /hold anywhere/.test(hintText), hintText);
  await ctx.close();

  // ------------------------------------------------------ 11
  section(11, 'reduced motion, no-WebGL, resize');
  ({ ctx, page } = await open(browser, { reducedMotion: 'reduce' }));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('reduced motion skips the fly-in',
        await page.evaluate(() => NH.Flight.state.at === 'home' && NH.UI.openId === 'home'));
  await ctx.close();

  ({ ctx, page } = await open(browser));
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const nogl = await page.evaluate(() => ({
    fail: !document.getElementById('glfail').hidden,
    docs: document.querySelectorAll('.doc.on').length,
    cards: document.querySelectorAll('#proj-list .proj').length
  }));
  check('fallback notice shown without WebGL', nogl.fail);
  check('all three sheets readable', nogl.docs === 3, String(nogl.docs));
  const noglChrome = await page.evaluate(() => {
    const vis = sel => Array.from(document.querySelectorAll(sel))
      .some(e => getComputedStyle(e).display !== 'none');
    return { keys: vis('.keys'), fly: vis('.quicknav button[data-fly]'),
             help: vis('.quicknav-help'),
             chip: vis('.devchip'), canvas: vis('#world') };
  });
  check('flight-only chrome is gone without WebGL',
        !noglChrome.keys && !noglChrome.fly && !noglChrome.help &&
        !noglChrome.chip && !noglChrome.canvas,
        JSON.stringify(noglChrome));
  check('projects still listed', nogl.cards === 2, nogl.cards + ' cards');
  await shot(page, '08-nogl');
  await ctx.close();

  ({ ctx, page } = await open(browser));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.setViewportSize({ width: 900, height: 500 });
  await page.waitForTimeout(900);
  const rs = await page.evaluate(() => ({ w: document.getElementById('world').width }));
  check('canvas followed the resize', rs.w === Math.ceil(900 / 4), rs.w + ' cells');
  check('still rendering after resize', (await fingerprint(page)).colours > 20);
  check('no errors on resize', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  section('11b', 'the page survives losing the GPU');
  ({ ctx, page } = await open(browser));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const beforeLoss = (await fingerprint(page)).colours;
  await page.evaluate(() => {
    const gl = document.getElementById('world').getContext('webgl');
    window.__ext = gl.getExtension('WEBGL_lose_context');
    window.__ext.loseContext();
  });
  await page.waitForTimeout(700);
  check('a lost context stops the renderer instead of throwing',
        await page.evaluate(() => NH.World.lost === true));
  await page.evaluate(() => window.__ext.restoreContext());
  await page.waitForTimeout(2400);
  const afterLoss = await page.evaluate(() => NH.World.lost);
  check('the context is rebuilt when it comes back', afterLoss === false);
  check('and it draws again', (await fingerprint(page)).colours > 20,
        'was ' + beforeLoss);
  check('no errors through a context loss', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ------------------------------------------------------ 12
  section(12, 'performance');
  ({ ctx, page } = await open(browser));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const measure = () => page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function tick() {
      n++;
      if (performance.now() - t0 < 1800) requestAnimationFrame(tick);
      else res(Math.round(n / ((performance.now() - t0) / 1000)));
    })();
  }));
  const flying = await measure();
  await page.evaluate(() => NH.Flight.flyTo('home'));
  await page.waitForFunction(() => NH.Flight.state.mode === 'orbit', null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const s = NH.World.stats; window.__base = s.passesRun + s.passesSkipped; window.__run = s.passesRun; });
  const orbiting = await measure();
  const cache = await page.evaluate(() => {
    const s = NH.World.stats;
    return { ran: s.passesRun - window.__run, frames: (s.passesRun + s.passesSkipped) - window.__base };
  });
  console.log('       ' + flying + ' fps flying, ' + orbiting + ' fps settled (software rasteriser)');
  console.log('       terrain passes re-run on ' + cache.ran + ' of ' + cache.frames + ' settled frames');
  /* SwiftShader is a CPU rasteriser on a shared core. These
     numbers are a minimum. Real hardware is much faster. The test
     is here only to catch a change that makes the frame much more
     expensive. */
  check('renders at a usable rate even in software', flying >= 12, flying + ' fps');
  check('terrain passes are skipped once the camera settles',
        cache.frames > 10 && cache.ran / cache.frames < 0.2,
        cache.ran + '/' + cache.frames + ' frames');
  check('settling is not slower than flying', orbiting >= flying * 0.9,
        orbiting + ' vs ' + flying);
  await ctx.close();

  await browser.close();
  if (server) server.close();
  if (!KEEP) await rm(SHOTS, { recursive: true, force: true });

  console.log('\n' + '='.repeat(46));
  if (failures.length) {
    console.log(passes + ' passed, ' + failures.length + ' FAILED:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
  console.log(passes + ' checks passed.' + (KEEP ? ' Screenshots in .verify-shots/' : ''));
}

main().catch(e => { console.error('harness error:', e); process.exit(2); });
