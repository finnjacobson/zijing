// PWA checks against a production build: BASE=http://localhost:5299 node tests/pwa.mjs
// (run `npm run build && npx vite preview --port 5299` first). Uses Chromium, which supports
// service workers and offline emulation under Playwright.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE ?? 'http://localhost:5299';
const OUT = new URL('../test-output/', import.meta.url).pathname;
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

console.log('Install');
const manifest = await (await fetch(BASE + '/manifest.webmanifest')).json();
check(manifest.display === 'standalone' && manifest.icons.length >= 3, `manifest: ${manifest.name}, ${manifest.icons.length} icons`);
for (const i of manifest.icons) check((await fetch(new URL(i.src, BASE + '/')).then((r) => r.status)) === 200, `icon ${i.src}`);
check((await fetch(BASE + '/icons/apple-touch-icon.png')).status === 200, 'apple-touch-icon');

await page.goto(BASE + '/');
await page.locator('.text-flow, textarea').first().waitFor();
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.locator('.text-flow, textarea').first().waitFor();
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');

console.log('Offline use');
// Visit a few pages online so their data gets cached
for (const c of ['學', '馬']) {
  await page.goto(BASE + '/char/' + encodeURIComponent(c));
  await page.locator('.char-header').waitFor();
  await page.locator('#evolution').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
}
await ctx.setOffline(true);
await page.goto(BASE + '/char/' + encodeURIComponent('學'));
await page.locator('.char-header').waitFor({ timeout: 8000 });
const head = await page.locator('.char-header').innerText();
check(head.includes('xué'), 'offline: visited character 學 still loads');
await page.locator('#strokes .hw-host svg').waitFor({ timeout: 8000 });
check(true, 'offline: stroke animation data available');
await page.locator('#evolution').scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
const imgs = await page.$$eval('.ety-frame img', (im) => im.map((i) => i.naturalWidth));
check(imgs.length > 0 && imgs.every((w) => w > 0), `offline: ancient-form images served from cache (${imgs.length})`);
check(await page.locator('.notice', { hasText: 'Offline' }).isVisible(), 'offline notice shown');
await page.screenshot({ path: OUT + 'pwa-offline-char.png' });

// A deep link that was never visited: app shell loads, data is missing → graceful message
await page.goto(BASE + '/char/' + encodeURIComponent('龜'));
await page.locator('.char-page, .loading').first().waitFor();
await page.waitForTimeout(800);
const body = await page.locator('main').innerText();
check(/No data/.test(body), 'offline: unvisited character shows a clear "no data" message');
await page.goto(BASE + '/');
await page.locator('.text-flow').waitFor({ timeout: 8000 });
check(true, 'offline: reader opens from the home-screen start URL');
await ctx.setOffline(false);

console.log('Download everything (partial, then resume)');
await page.goto(BASE + '/settings');
await page.getByRole('heading', { name: 'Offline' }).scrollIntoViewIfNeeded();
await page.locator('.offline .btn.primary').waitFor();
const before = await page.locator('.offline p.small').first().innerText();
console.log('    status:', before);
await page.locator('.offline .btn.primary').click();
await page.waitForFunction(() => /Downloading… [\d,]+/.test(document.querySelector('.offline')?.textContent ?? '') && Number((document.querySelector('.offline')?.textContent ?? '').match(/Downloading… ([\d,]+)/)?.[1].replace(/,/g, '')) > 1500, null, { timeout: 60000 });
await page.getByRole('button', { name: 'Pause' }).click();
await page.locator('.offline .btn.primary', { hasText: 'Resume download' }).waitFor({ timeout: 15000 });
await page.getByText(/^Paused/).waitFor({ timeout: 15000 });
const paused = await page.locator('.offline').innerText();
const savedCount = Number(paused.match(/([\d,]+) of/)?.[1].replace(/,/g, ''));
console.log('    after pause:', paused.split('\n').find((l) => / of /.test(l)));
check(savedCount > 1500, 'partial download persisted and can resume');
await page.locator('.offline').screenshot({ path: OUT + 'pwa-offline-panel.png' });
const cached = await page.evaluate(async () => (await (await caches.open('zijing-data-v1')).keys()).length);
check(cached >= savedCount, `data cache holds ${cached} shards`);

console.log('Update flow');
// Simulate a new deploy: change the worker's version, then let the page check for updates.
const swPath = new URL('../dist/sw.js', import.meta.url).pathname;
const original = await readFile(swPath, 'utf8');
await writeFile(swPath, original.replace(/const SHELL_VERSION = "[^"]+"/, 'const SHELL_VERSION = "test-update"'));
try {
  await page.goto(BASE + '/');
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.locator('.notice', { hasText: 'new version' }).waitFor({ timeout: 15000 });
  check(true, 'update banner appears after a new deploy');
  await page.screenshot({ path: OUT + 'pwa-update.png' });
  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.getByRole('button', { name: 'Reload' }).click()]);
  const keys = await page.evaluate(() => caches.keys());
  check(keys.includes('zijing-shell-test-update') && keys.includes('zijing-data-v1'), `new shell active, offline data kept (${keys.join(', ')})`);
} finally {
  await writeFile(swPath, original);
}

await browser.close();
const errs = errors.filter((e) => !/fonts\.gstatic|ERR_FAILED/.test(e));
if (errs.length) {
  console.log('Page errors:\n  ' + errs.join('\n  '));
  failures += errs.length;
}
console.log(failures ? `${failures} problem(s)` : 'All PWA checks passed');
process.exit(failures ? 1 : 0);
