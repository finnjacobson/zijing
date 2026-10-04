// Browser smoke test: node tests/smoke.mjs [phase] — drives the dev server with headless Chromium,
// prints what it checks and writes screenshots to test-output/.
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = new URL('../test-output/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const phase = process.argv[2] ?? 'all';

const TRAD = '學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？';
const SIMP = '我们今天去图书馆学习汉字。';

const browser = await chromium.launch();
const errors = [];
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  if (!ok) failures++;
};

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // Calligraphy coverage probes: Google answers missing glyphs with a header-less error, which the
  // browser logs as CORS / ERR_FAILED. That is the expected "font lacks this glyph" signal.
  // 429 = an external host (Wikimedia / Google Fonts) rate-limiting repeated test runs.
  const expected = (t) => t.includes('favicon') || t.includes('fonts.gstatic.com') || t === 'Failed to load resource: net::ERR_FAILED' || t.includes('status of 429');
  page.on('console', (m) => m.type() === 'error' && !expected(m.text()) && errors.push(m.text()));
  return page;
}

async function readText(page, text, script) {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: script === 'simp' ? '简' : '繁', exact: true }).click();
  const edit = page.getByRole('button', { name: /Edit text/ });
  if (await edit.isVisible().catch(() => false)) await edit.click();
  await page.locator('textarea').fill(text);
  await page.getByRole('button', { name: /^Read/ }).click();
  await page.locator('.text-flow, .vocab').waitFor();
  await page.waitForTimeout(300);
  return page.$$eval('.text-flow .w, .vocab .w', (els) => els.map((e) => e.textContent));
}

if (phase === 'all' || phase === 'reader') {
  console.log('Reader');
  const page = await newPage();
  let words = await readText(page, TRAD, 'trad');
  console.log('    trad/trad segments:', words.join(' | '));
  check(words.join('') === TRAD.replace(/[，？]/g, ''), 'traditional sample renders every Han character');
  await page.screenshot({ path: OUT + 'reader-trad.png' });

  await page.locator('.w').first().hover();
  await page.locator('.word-card').waitFor();
  const card = await page.locator('.word-card').innerText();
  console.log('    hover card:', card.replace(/\n/g, ' / ').slice(0, 120));
  check(/xué|學/.test(card), 'hover shows pinyin/gloss');
  await page.screenshot({ path: OUT + 'reader-hover.png' });

  await page.getByRole('button', { name: '简', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.text-flow')?.textContent?.includes('学'));
  const simpView = await page.locator('.text-flow').innerText();
  console.log('    toggled to 简:', simpView.replace(/\s+/g, ''));
  check(simpView.includes('学而时习之'), 'toggle converts to simplified');

  words = await readText(page, SIMP, 'simp');
  console.log('    simp/simp segments:', words.join(' | '));
  check(words.includes('图书馆') && words.includes('学习'), 'simplified text segments 图书馆 / 学习');
  await page.screenshot({ path: OUT + 'reader-simp.png' });

  await page.getByRole('button', { name: '繁', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.text-flow')?.textContent?.includes('圖'));
  const tradView = await page.locator('.text-flow').innerText();
  console.log('    toggled to 繁:', tradView.replace(/\s+/g, ''));
  check(tradView.includes('我們今天去圖書館學習漢字'), 'toggle converts to traditional');

  await page.locator('.ch', { hasText: '館' }).first().click();
  await page.waitForURL(/\/char\//);
  check(decodeURIComponent(page.url()).endsWith('/char/館'), 'clicking a character opens its page: ' + decodeURIComponent(page.url()));

  // Vocab list detection
  words = await readText(page, '學習\txuéxí\tto study\n圖書館\ttúshūguǎn\tlibrary\n漢字\n朋友 péngyou friend', 'trad');
  const rows = await page.$$eval('.vocab tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')));
  console.log('    vocab rows:', rows.join(' || '));
  check(rows.length === 4, 'vocab list auto-detected with 4 rows');
  await page.screenshot({ path: OUT + 'reader-vocab.png' });

  // Phone width
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(BASE + '/');
  await phone.locator('.text-flow, .vocab, textarea').first().waitFor();
  await phone.screenshot({ path: OUT + 'reader-phone.png' });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no horizontal overflow at phone width');
}

if (phase === 'all' || phase === 'char') {
  console.log('Character pages');
  const page = await newPage();
  for (const c of ['學', '說', '樂', '馬', '们', '图', '馆', '請', '江']) {
    await page.goto(BASE + '/char/' + encodeURIComponent(c));
    await page.locator('.char-page').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1200);
    const head = await page.locator('.char-header').innerText();
    console.log(`    ${c}: ${head.replace(/\s+/g, ' ').slice(0, 140)}`);
    await page.screenshot({ path: OUT + `char-${c}.png`, fullPage: true });
  }
  check(true, 'character pages rendered (see screenshots)');
}

// Draw strokes on the practice board by tracing the stroke medians with the mouse.
async function drawStroke(page, board, median, size) {
  const pad = Math.round(size * 0.06);
  const scale = (size - 2 * pad) / 1024;
  const pts = median.map(([x, y]) => [board.x + pad + x * scale, board.y + pad + (900 - y) * scale]);
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let t = 1; t <= 4; t++) await page.mouse.move(ax + ((bx - ax) * t) / 4, ay + ((by - ay) * t) / 4);
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
}

if (phase === 'all' || phase === 'practice') {
  console.log('Practice + progress');
  const page = await newPage({ acceptDownloads: true });
  await page.goto(BASE + '/settings');
  await page.locator('.settings').waitFor();
  // start clean
  await page.getByRole('button', { name: /Clear all progress/ }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByText(/^Cleared \d+ characters/).waitFor();

  const c = '學';
  const data = await (await fetch(BASE + '/data/s/5B78.json')).json();
  await page.goto(BASE + '/char/' + encodeURIComponent(c));
  await page.locator('#practice .practice-board').scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: /Recall/ }).click();
  await page.waitForTimeout(600);
  const boardEl = page.locator('#practice .practice-board .hw-host');
  const box = await boardEl.boundingBox();
  for (const m of data.medians) await drawStroke(page, box, m, box.width);
  await page.locator('.review').waitFor({ timeout: 8000 });
  const review = await page.locator('.review .score-line').innerText();
  console.log('    recall result:', review.replace(/\s+/g, ' '));
  check(/100/.test(review) && /no mistakes/i.test(review), 'clean recall scores 100');
  await page.locator('#practice').screenshot({ path: OUT + 'practice-recall.png' });
  await page.waitForTimeout(1800);
  check(await page.locator('.seal-slot .seal').isVisible(), 'seal stamped on the page after a perfect recall');
  await page.locator('.char-header').screenshot({ path: OUT + 'sealed-header.png' });

  // Guided with mistakes: first draw a wrong stroke (reverse of stroke 2), then the right ones.
  await page.getByRole('tab', { name: /Guided/ }).click();
  await page.waitForTimeout(600);
  const box2 = await boardEl.boundingBox();
  await drawStroke(page, box2, [...data.medians[5]].reverse(), box2.width);
  await drawStroke(page, box2, [[100, 100], [900, 700]], box2.width);
  for (const m of data.medians) await drawStroke(page, box2, m, box2.width);
  await page.locator('.review').waitFor({ timeout: 8000 });
  const review2 = await page.locator('.review .score-line').innerText();
  console.log('    guided result:', review2.replace(/\s+/g, ' '));
  check(/2 mistakes/.test(review2), 'guided attempt recorded 2 mistakes');
  const cells = await page.$$eval('.review-cell figcaption', (f) => f.map((x) => x.textContent));
  console.log('    per-stroke:', cells.join(' '));
  check(cells[0].includes('2×'), 'mistakes attributed to stroke 1');
  await page.locator('#practice').screenshot({ path: OUT + 'practice-review.png' });

  // My characters
  await page.goto(BASE + '/mine');
  await page.locator('.mine-table').waitFor();
  const row = await page.locator('.mine-table tbody tr').first().innerText();
  console.log('    my characters row:', row.replace(/\s+/g, ' '));
  check(row.includes('學') && row.includes('100'), 'My characters lists 學 with recall 100');
  await page.screenshot({ path: OUT + 'mine.png' });

  // Export → clear → import
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export JSON/ }).click()]);
  const file = OUT + 'backup.json';
  await dl.saveAs(file);
  const backup = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8'));
  check(backup.app === 'zijing' && backup.progress.some((p) => p.c === '學' && p.attempts.length === 2), 'export contains 學 with 2 attempts');
  await page.goto(BASE + '/settings');
  await page.getByRole('button', { name: /Clear all progress/ }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByText(/^Cleared \d+ characters/).waitFor();
  await page.goto(BASE + '/mine');
  await page.locator('.empty-state').waitFor();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Merge with my data' }).click();
  await page.locator('.mine-table').waitFor();
  check((await page.locator('.mine-table tbody tr').count()) >= 1, 'import restores progress');

  // Mastery overlay in reader
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: '繁', exact: true }).click();
  const edit = page.getByRole('button', { name: /Edit text/ });
  if (await edit.isVisible().catch(() => false)) await edit.click();
  await page.locator('textarea').fill(TRAD);
  await page.getByRole('button', { name: /^Read/ }).click();
  await page.getByLabel('Mastery overlay').check();
  await page.waitForTimeout(500);
  const cls = await page.locator('.ch', { hasText: '學' }).first().getAttribute('class');
  check(/m-(mid|high)/.test(cls), 'reader tints 學 by mastery: ' + cls);
  await page.locator('.reader-out').screenshot({ path: OUT + 'reader-mastery.png' });
  await page.getByLabel('Mastery overlay').uncheck();
}

await browser.close();
const uniqErrors = [...new Set(errors)];
if (uniqErrors.length) {
  console.log('Browser errors:\n  ' + uniqErrors.join('\n  '));
  failures += uniqErrors.length;
}
console.log(failures ? `${failures} problem(s)` : 'All checks passed');
process.exit(failures ? 1 : 0);
