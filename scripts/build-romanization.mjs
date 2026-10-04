// Builds src/data/romanization.json: Pinyin syllable → Zhuyin / Wade–Giles / Yale (toneless).
// Source: Wikipedia "Comparison of Standard Chinese transcription systems" (CC BY-SA 4.0),
// cross-checked against the pinyin-to-zhuyin library and simple rule-based expectations.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { p2z } from 'pinyin-to-zhuyin';

const OUT = path.resolve(import.meta.dirname, '../src/data/romanization.json');
const URL = 'https://en.wikipedia.org/w/index.php?title=Comparison_of_Standard_Chinese_transcription_systems&action=raw';
const res = await fetch(URL, { headers: { 'User-Agent': 'ZijingDataBuild/0.1' } });
const wikitext = await res.text();

const clean = (cell) =>
  cell
    .replace(/^style="[^"]*"\|/, '')
    .replace(/\{\{Lang\|zh-Bopo\|([^}]*)\}\}/, '$1')
    .replace(/<ref.*$/, '')
    .trim();

const table = {};
for (const line of wikitext.split('\n')) {
  if (!line.startsWith('||')) continue;
  const cells = line.slice(2).split('||').map(clean);
  const [pinyin, zhuyin, , wadeGiles, , yale] = cells;
  if (!pinyin || !zhuyin) continue;
  // Wikipedia writes the WG aspiration mark as ʻ (U+02BB); keep it, it's the scholarly form.
  table[pinyin.replace('ü', 'v')] = { z: zhuyin, w: wadeGiles, y: yale };
}

// --- verification ---
const problems = [];
const n = Object.keys(table).length;
if (n < 400) problems.push(`only ${n} syllables parsed`);
for (const [py, r] of Object.entries(table)) {
  if (py === 'ê') continue; // p2z has no ê
  const expected = p2z(py.replace('v', 'ü') + '1');
  if (expected !== r.z) problems.push(`zhuyin ${py}: table ${r.z} vs p2z ${expected}`);
  if (!r.w || !r.y) problems.push(`missing WG/Yale for ${py}`);
  // Rule checks for Wade–Giles initials: unaspirated b/d/g/z/zh/j → p/t/k/ts/ch/ch
  const wgInit = { b: 'p', d: 't', g: 'k', p: 'pʻ', t: 'tʻ', k: 'kʻ', zh: 'ch', ch: 'chʻ', j: 'ch', q: 'chʻ', x: 'hs', r: 'j' };
  const init = py.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/)?.[1];
  if (init && wgInit[init] && !r.w.startsWith(wgInit[init])) problems.push(`WG initial ${py} → ${r.w}`);
  // Yale initials: j/q/x → j/ch/sy, zh → j, z → dz, c → ts, r → r
  const yInit = { j: 'j', q: 'ch', x: 's', zh: 'j', z: 'dz', c: 'ts', ch: 'ch', sh: 'sh', r: 'r' };
  if (init && yInit[init] && !r.y.startsWith(yInit[init])) problems.push(`Yale initial ${py} → ${r.y}`);
}
for (const must of ['zhi', 'shi', 'ri', 'zi', 'ci', 'si', 'lv', 'nve', 'er', 'jiong', 'yu', 'yue', 'you', 'wu'])
  if (!table[must]) problems.push(`missing syllable ${must}`);

if (problems.length) {
  console.error('Romanization verification FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(table));
console.log(`✓ romanization.json: ${n} syllables, all checks passed`);
