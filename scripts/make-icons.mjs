// Renders the app icons (PNG; iPadOS ignores SVG icons) into public/icons/ with headless Chromium.
// Run: node scripts/make-icons.mjs — the output is committed, so this only reruns when the design changes.
import { chromium } from 'playwright';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../public/icons');

// Full-bleed square: iPadOS and Android mask the corners themselves.
// `inset` shrinks the seal for maskable icons, whose outer ~20% may be cropped.
const page = (inset) => `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@700&text=%E5%AD%97&display=block">
<style>
  html,body{margin:0;background:#0e0d0c}
  #w{position:absolute;left:0;top:0;width:1024px;height:1024px;transform-origin:0 0}
  .bg{position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 30%,rgba(201,164,92,.10),transparent 70%),#0e0d0c}
  .seal{position:absolute;inset:${inset}px;border-radius:${inset / 6 + 28}px;background:#c8361f;
        box-shadow:inset 0 0 ${inset / 3 + 30}px rgba(80,10,0,.35)}
  .frame{position:absolute;inset:${inset + 54}px;border:22px solid #efe6d6;border-radius:18px;opacity:.95}
  .zi{position:absolute;inset:${inset}px;display:grid;place-items:center;font-family:'LXGW WenKai TC';font-weight:700;
      color:#efe6d6;font-size:${(1024 - 2 * inset) * 0.62}px;line-height:1;padding-bottom:${(1024 - 2 * inset) * 0.04}px}
</style></head><body><div id="w"><div class="bg"></div><div class="seal"></div><div class="frame"></div><div class="zi">字</div></div></body></html>`;

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [name, inset] of [['any', 112], ['maskable', 215]]) {
  await p.setContent(page(inset));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  const ok = await p.evaluate(() => document.fonts.check("700 100px 'LXGW WenKai TC'", '字'));
  if (!ok) throw new Error('LXGW WenKai TC did not load; icons would use a fallback font');
  for (const size of name === 'any' ? [1024, 512, 192, 180, 167, 152, 32] : [512]) {
    const file = name === 'any' ? (size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`) : `icon-maskable-${size}.png`;
    // Lay out at 1024 and scale the whole design down so every size has the same proportions.
    await p.evaluate((s) => (document.getElementById('w').style.transform = `scale(${s / 1024})`), size);
    await p.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: size, height: size } });
    console.log('✓', file);
  }
}
await browser.close();
