// node tests/shot.mjs <path> <selector> <out.png> [width] [hoverSelector]
import { chromium } from 'playwright';
const [path, sel, out, width = '1280', hoverSel] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(width), height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5199' + path);
await p.locator(sel).first().waitFor({ timeout: 15000 });
await p.waitForTimeout(1500);
if (hoverSel) { await p.locator(hoverSel).first().hover(); await p.waitForTimeout(700); }
await p.locator(sel).first().screenshot({ path: out });
if (errs.length) console.log('ERRORS', errs);
await b.close();
