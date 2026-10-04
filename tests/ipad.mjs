// iPad checks in WebKit (Safari's engine): BASE=http://localhost:5299 node tests/ipad.mjs
// Portrait and landscape layout, the tap-to-gloss reader flow, and handwriting via touch events
// (the same events a finger or Apple Pencil produce in Safari).
import { webkit, devices } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5299';
const OUT = new URL('../test-output/', import.meta.url).pathname;
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  if (!ok) failures++;
};
const errors = [];
const ipad = devices['iPad Pro 11'];
const browser = await webkit.launch();

async function open(orientation) {
  const { width, height } = ipad.viewport;
  const viewport = orientation === 'portrait' ? { width, height } : { width: height, height: width };
  const ctx = await browser.newContext({ ...ipad, viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Trace one stroke with synthetic touch events, as a finger / Pencil would. */
async function touchStroke(page, box, median, size) {
  const pad = Math.round(size * 0.06);
  const scale = (size - 2 * pad) / 1024;
  const pts = median.map(([x, y]) => [box.x + pad + x * scale, box.y + pad + (900 - y) * scale]);
  const dense = [];
  for (let i = 1; i < pts.length; i++) for (let t = 0; t < 4; t++) dense.push([pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * t) / 4, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * t) / 4]);
  dense.push(pts.at(-1));
  await page.evaluate((points) => {
    const svg = document.querySelector('#practice .hw-host svg');
    const fire = (type, [x, y], target) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      const touch = { clientX: x, clientY: y, pageX: x + scrollX, pageY: y + scrollY, identifier: 1, target: svg };
      Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [touch] });
      Object.defineProperty(e, 'changedTouches', { value: [touch] });
      Object.defineProperty(e, 'targetTouches', { value: type === 'touchend' ? [] : [touch] });
      target.dispatchEvent(e);
    };
    fire('touchstart', points[0], svg);
    for (const p of points.slice(1)) fire('touchmove', p, svg);
    fire('touchend', points.at(-1), document);
  }, dense);
  await page.waitForTimeout(450);
}

for (const orientation of ['portrait', 'landscape']) {
  console.log(`iPad Pro 11 — ${orientation}`);
  const page = await open(orientation);
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: '繁', exact: true }).tap();
  const edit = page.getByRole('button', { name: /Edit text/ });
  if (await edit.isVisible().catch(() => false)) await edit.tap();
  await page.locator('textarea').fill('學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？');
  await page.getByRole('button', { name: /^Read/ }).tap();
  await page.locator('.text-flow').waitFor();
  check(await noOverflow(page), 'reader fits the screen');

  // Touch flow: first tap shows the word card instead of navigating
  await page.locator('.w', { hasText: '遠方' }).locator('.ch').first().tap();
  await page.locator('.word-card').waitFor({ timeout: 5000 });
  const card = await page.locator('.word-card').innerText();
  check(/yuǎnfāng/.test(card), 'tap shows the word card: ' + card.split('\n').slice(0, 3).join(' / '));
  check(page.url() === BASE + '/', 'first tap does not navigate');
  await page.screenshot({ path: OUT + `ipad-${orientation}-reader.png` });
  await page.locator('.wc-chars .btn', { hasText: '遠' }).tap();
  await page.waitForURL(/\/char\//);
  check(decodeURIComponent(page.url()).endsWith('/char/遠'), 'tapping 遠 in the card opens its page');
  await page.locator('.char-header').waitFor();
  await page.waitForTimeout(1200);
  check(await noOverflow(page), 'character page fits the screen');
  await page.screenshot({ path: OUT + `ipad-${orientation}-char.png` });

  if (orientation === 'portrait') {
    // Handwriting with touch: write 學 from memory
    await page.goto(BASE + '/char/' + encodeURIComponent('學'));
    await page.locator('#practice .practice-board').scrollIntoViewIfNeeded();
    await page.getByRole('tab', { name: /Recall/ }).tap();
    await page.waitForTimeout(700);
    await page.locator('#practice .practice-board').scrollIntoViewIfNeeded();
    const data = await (await fetch(BASE + '/data/s/5B78.json')).json();
    const box = await page.locator('#practice .hw-host').boundingBox();
    for (const m of data.medians) await touchStroke(page, box, m, box.width);
    await page.locator('.review').waitFor({ timeout: 8000 });
    const res = (await page.locator('.review .score-line').innerText()).replace(/\s+/g, ' ');
    check(/100/.test(res), 'touch handwriting (Recall 學) completes: ' + res);
    await page.locator('#practice').screenshot({ path: OUT + 'ipad-practice.png' });
  }
  await page.context().close();
}

await browser.close();
const errs = errors.filter((e) => !/fonts\.gstatic|ERR_FAILED|429/.test(e));
if (errs.length) {
  console.log('Page errors:\n  ' + [...new Set(errs)].join('\n  '));
  failures += errs.length;
}
console.log(failures ? `${failures} problem(s)` : 'All iPad checks passed');
process.exit(failures ? 1 : 0);
