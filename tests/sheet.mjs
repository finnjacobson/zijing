// 田字格 practice sheet: node tests/sheet.mjs  (dev server on :5199, or BASE=…)
// Drawing, on-screen-only lifetime (fresh on every visit), reset/undo, keyboard use,
// accessibility audit, Pencil palm rejection.
import { chromium, webkit, devices } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = new URL('../test-output/', import.meta.url).pathname;
const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  if (!ok) failures++;
};
const errors = [];

async function openSheet(page, c) {
  await page.goto(BASE + '/char/' + encodeURIComponent(c));
  await page.locator('#sheet .tzg-sheet:not(.loading-sheet)').waitFor({ timeout: 15000 });
  await page.locator('#sheet').scrollIntoViewIfNeeded();
}
const square = (page, row, col) => page.locator('#sheet .tzg-row').nth(row - 1).locator('.tzg-square').nth(col - 1);

/** Draw a polyline (square-relative 0–1 coordinates) with the mouse. */
async function draw(page, loc, pts) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  const P = ([x, y]) => [b.x + x * b.width, b.y + y * b.height];
  await page.mouse.move(...P(pts[0]));
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = P(pts[i - 1]);
    const [bx, by] = P(pts[i]);
    for (let t = 1; t <= 6; t++) await page.mouse.move(ax + ((bx - ax) * t) / 6, ay + ((by - ay) * t) / 6);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const inkCount = (loc) => loc.locator('path.ink').count();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE + '/settings');
await page.getByRole('button', { name: '繁', exact: true }).click();

console.log('Layout');
await openSheet(page, '學');
const refs = await page.$$eval('#sheet .tzg-square.reference', (els) => els.map((e) => e.getAttribute('aria-label')));
console.log('    references:', refs.join(' | '));
check((await square(page, 1, 1).getAttribute('class')).includes('reference') && refs[0].includes('學') && refs[0].includes('traditional'), 'top-left square shows the traditional model 學');
check((await square(page, 2, 1).getAttribute('class')).includes('reference') && refs[1]?.includes('学') && refs[1].includes('simplified'), 'simplified model 学 starts the second row');
check((await page.locator('#sheet .tzg-square').count()) === 24, '24 squares (6 × 4)');
check(await page.locator('.char-toc a', { hasText: '田字格' }).isVisible(), 'section listed in the page navigation');

console.log('Writing (kept on screen, fresh on every visit)');
const s12 = square(page, 1, 2);
await draw(page, s12, [[0.2, 0.3], [0.8, 0.3]]); // 一
await draw(page, s12, [[0.5, 0.15], [0.5, 0.85]]); // 丨
await draw(page, square(page, 2, 3), [[0.3, 0.2], [0.6, 0.5], [0.4, 0.8]]);
check((await inkCount(s12)) === 2, 'two strokes appear in row 1, column 2');
check((await s12.getAttribute('aria-label')).includes('2 strokes written'), 'square label reports its strokes: ' + (await s12.getAttribute('aria-label')));
check(/2 squares written/.test(await page.locator('.tzg-status').innerText()), 'status shows 2 squares written');
await page.locator('#sheet').screenshot({ path: OUT + 'sheet-written.png' });
await page.locator('#strokes').scrollIntoViewIfNeeded();
await page.locator('#sheet').scrollIntoViewIfNeeded();
check((await page.locator('#sheet path.ink').count()) === 3, 'writing stays on screen while on the page');
check(!(await page.evaluate(async () => (await indexedDB.databases?.())?.some((d) => d.name === 'zijing-sheets'))), 'nothing is written to storage');

await page.reload();
await openSheet(page, '學');
check((await page.locator('#sheet path.ink').count()) === 0, 'reloading the page gives a fresh sheet');
await draw(page, square(page, 1, 2), [[0.2, 0.3], [0.8, 0.3]]);
await page.getByRole('link', { name: 'My characters' }).click();
await page.locator('.mine').waitFor();
await page.goBack();
await openSheet(page, '學');
check((await page.locator('#sheet path.ink').count()) === 0, 'leaving and coming back gives a fresh sheet');
await draw(page, square(page, 1, 2), [[0.5, 0.2], [0.5, 0.8]]);
await openSheet(page, '馬');
check((await page.locator('#sheet path.ink').count()) === 0, 'another character starts with a fresh sheet');
await openSheet(page, '學');
await draw(page, s12, [[0.2, 0.3], [0.8, 0.3]]);
await draw(page, s12, [[0.5, 0.15], [0.5, 0.85]]);
await draw(page, square(page, 2, 3), [[0.3, 0.2], [0.6, 0.5], [0.4, 0.8]]);

console.log('Keyboard and undo');
await square(page, 1, 2).focus();
await page.keyboard.press('ArrowRight');
check(await square(page, 1, 3).evaluate((e) => e === document.activeElement), 'ArrowRight moves to the next square');
await page.keyboard.press('ArrowDown');
check(await square(page, 2, 3).evaluate((e) => e === document.activeElement), 'ArrowDown moves to the square below');
check((await page.$$eval('#sheet [role=gridcell][tabindex="0"]', (e) => e.length)) === 1, 'roving tabindex: exactly one square in the tab order');
await page.keyboard.press('Delete');
check((await inkCount(square(page, 2, 3))) === 0, 'Delete clears the focused square');
check(/Cleared row 2, column 3/.test(await page.locator('#sheet [role=status]').innerText()), 'clearing is announced to screen readers');
await page.keyboard.press('Control+z');
check((await inkCount(square(page, 2, 3))) === 1, 'Ctrl+Z restores it');
await page.getByRole('button', { name: 'Reset sheet' }).click();
check((await page.locator('#sheet path.ink').count()) === 0, 'Reset sheet clears every square');
check(await page.getByRole('button', { name: 'Reset sheet' }).isDisabled(), 'Reset is disabled on an empty sheet');
await page.getByRole('button', { name: /Undo/ }).click();
check((await page.locator('#sheet path.ink').count()) === 3, 'Undo brings the whole sheet back');
await page.waitForTimeout(600);

console.log('Accessibility audit (axe-core, WCAG 2.2 AA)');
await page.addScriptTag({ content: axeSource });
const result = await page.evaluate(async () =>
  // eslint-disable-next-line no-undef
  axe.run('#sheet', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }),
);
for (const v of result.violations) console.log(`    ${v.id}: ${v.help} (${v.nodes.length})\n      ${v.nodes[0]?.target.join(' ')}`);
check(result.violations.length === 0, `no axe violations in the sheet section (${result.passes.length} rules passed)`);

console.log('Same-script character');
await openSheet(page, '字');
const refs2 = await page.$$eval('#sheet .tzg-square.reference', (els) => els.map((e) => e.getAttribute('aria-label')));
check(refs2.length === 1 && refs2[0].includes('same in traditional and simplified'), '字: a single model square marked 繁简');

await browser.close();

console.log('iPad + Apple Pencil (WebKit)');
const wk = await webkit.launch();
const ipad = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage();
ipad.on('pageerror', (e) => errors.push(e.message));
await openSheet(ipad, '馬');
// Synthetic pointer events: a Pencil stroke, then a "palm" touch that must be ignored.
const fire = (loc, type, pts) =>
  loc.evaluate(
    (el, { type, pts }) => {
      const r = el.getBoundingClientRect();
      const ev = (name, [x, y], pressure) =>
        el.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, pointerId: type === 'pen' ? 7 : 8, pointerType: type, isPrimary: true, pressure, clientX: r.left + x * r.width, clientY: r.top + y * r.height, button: 0, buttons: 1 }));
      ev('pointerdown', pts[0], 0.3);
      pts.slice(1).forEach((p, i) => ev('pointermove', p, 0.3 + (0.6 * i) / pts.length));
      ev('pointerup', pts.at(-1), 0);
    },
    { type, pts },
  );
const sq = square(ipad, 1, 2);
await fire(sq, 'pen', [[0.2, 0.5], [0.5, 0.5], [0.8, 0.52]]);
await ipad.waitForTimeout(200);
check((await inkCount(sq)) === 1, 'Pencil stroke is drawn');
check(await ipad.getByLabel('Draw with finger too').isVisible(), 'Pencil detected → finger drawing switched off (palm rejection)');
await fire(square(ipad, 1, 3), 'touch', [[0.2, 0.2], [0.8, 0.8]]);
await ipad.waitForTimeout(200);
check((await inkCount(square(ipad, 1, 3))) === 0, 'resting palm / finger does not draw');
await ipad.getByLabel('Draw with finger too').check();
await fire(square(ipad, 1, 3), 'touch', [[0.2, 0.2], [0.8, 0.8]]);
await ipad.waitForTimeout(200);
check((await inkCount(square(ipad, 1, 3))) === 1, 'finger draws again when re-enabled');
check(await ipad.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow on iPad');
await ipad.locator('#sheet').screenshot({ path: OUT + 'sheet-ipad.png' });
await wk.close();

const errs = errors.filter((e) => !/fonts\.gstatic|ERR_FAILED|429/.test(e));
if (errs.length) {
  console.log('Page errors:\n  ' + [...new Set(errs)].join('\n  '));
  failures += errs.length;
}
console.log(failures ? `${failures} problem(s)` : 'All sheet checks passed');
process.exit(failures ? 1 : 0);
