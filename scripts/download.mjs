// Downloads every raw dataset into data-raw/. Re-running skips files that already exist
// (pass --force to refetch). See scripts/README.md for sources and licenses.
import { mkdir, writeFile, access, readFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';

const RAW = path.resolve(import.meta.dirname, '../data-raw');
const FORCE = process.argv.includes('--force');
const UA = { 'User-Agent': 'ZijingDataBuild/0.1 (personal Chinese study app; static build)' };

const SOURCES = [
  { file: 'mmah-dictionary.txt', url: 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt' },
  { file: 'mmah-graphics.txt', url: 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt' },
  { file: 'animcjk-graphicsZhHant.txt', url: 'https://raw.githubusercontent.com/parsimonhi/animCJK/master/graphicsZhHant.txt' },
  { file: 'animcjk-dictionaryZhHant.txt', url: 'https://raw.githubusercontent.com/parsimonhi/animCJK/master/dictionaryZhHant.txt' },
  { file: 'cedict.txt', url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz', gunzip: true },
  { file: 'Unihan', url: 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip', unzip: true },
  { file: 'subtlex-wf', url: 'https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexch/subtlexchwf.zip', unzip: true },
  { file: 'subtlex-chr', url: 'https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexch/subtlexchchr.zip', unzip: true },
  { file: 'shuowen', url: 'https://codeload.github.com/shuowenjiezi/shuowen/tar.gz/refs/heads/master', untar: true },
  { file: 'kaiyuan-seal', url: 'https://codeload.github.com/frankslin/kaiyuan-small-seal-font/tar.gz/HEAD', untar: true },
];

const exists = (p) => access(p).then(() => true, () => false);

async function fetchBuf(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function download(src) {
  const dest = path.join(RAW, src.file);
  if (!FORCE && (await exists(dest))) return console.log(`✓ ${src.file} (cached)`);
  process.stdout.write(`↓ ${src.file} … `);
  const buf = await fetchBuf(src.url);
  if (src.gunzip) await writeFile(dest, gunzipSync(buf));
  else if (src.unzip) new AdmZip(buf).extractAllTo(dest, true);
  else if (src.untar) {
    await mkdir(dest, { recursive: true });
    const tmp = dest + '.tar.gz';
    await writeFile(tmp, buf);
    execFileSync('tar', ['-xzf', tmp, '-C', dest, '--strip-components=1']);
    execFileSync('rm', [tmp]);
  } else await writeFile(dest, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}

// Wikimedia Commons "Ancient Chinese characters project": index which forms exist per character.
// Files are named like 馬-oracle.svg; we only record presence + the upload URL so the app hotlinks.
const COMMONS_CATS = {
  oracle: ['Shang oracle script characters (SVG)', 'Shang oracle script radicals (SVG)', 'Oracle script characters (SVG)', 'Oracle script radicals (SVG)'],
  bronze: ['Western Zhou bronze script characters (SVG)', 'Western Zhou bronze script radicals (SVG)', 'Bronze script characters (SVG)', 'Bronze script radicals (SVG)', 'Shang bronze script characters (SVG)', 'Shang bronze script radicals (SVG)', 'Spring and Autumn bronze script characters (SVG)', 'Spring and Autumn bronze script radicals (SVG)', 'Warring States bronze script characters (SVG)', 'Warring States bronze script radicals (SVG)'],
  silk: ['Chu slip script characters (SVG)', 'Chu slip script radicals (SVG)'],
  slip: ['Qin slip script characters (SVG)', 'Qin slip script radicals (SVG)'],
  seal: ['Shuowen seal script characters (SVG)', 'Shuowen seal script radicals (SVG)'],
  bigseal: ['Liushutong script characters (SVG)', 'Liushutong script radicals (SVG)'],
  clerical: ['Clerical script characters (SVG)'],
};

// Commons stores uploads at /<md5[0]>/<md5[0..2]>/<name with spaces as underscores>.
function commonsPath(name) {
  const file = name.replaceAll(' ', '_');
  const h = createHash('md5').update(file).digest('hex');
  return `${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(file)}`;
}

async function commonsApi(params) {
  for (let attempt = 0; ; attempt++) {
    await new Promise((r) => setTimeout(r, 1000 + attempt * 5000));
    const res = await fetch('https://commons.wikimedia.org/w/api.php?' + params, { headers: UA });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (attempt >= 6) throw new Error('Commons API kept failing: ' + text.slice(0, 80));
      console.log('  (rate limited, backing off)');
    }
  }
}

async function commonsIndex() {
  const dest = path.join(RAW, 'commons-ancient.json');
  if (!FORCE && (await exists(dest))) return console.log('✓ commons-ancient.json (cached)');
  const index = {};
  const re = /^File:(.+)-(oracle|bronze|silk|slip|seal|bigseal|clerical)\.svg$/;
  for (const cats of Object.values(COMMONS_CATS)) {
    for (const cat of cats) {
      let cont = {};
      let n = 0;
      do {
        const params = new URLSearchParams({ action: 'query', format: 'json', list: 'categorymembers', cmtitle: 'Category:' + cat, cmtype: 'file', cmlimit: '500', ...cont });
        const d = await commonsApi(params);
        for (const p of d.query?.categorymembers ?? []) {
          const m = re.exec(p.title);
          if (!m || [...m[1]].length !== 1) continue;
          (index[m[1]] ??= {})[m[2]] = commonsPath(p.title.slice(5));
          n++;
        }
        cont = d.continue ?? null;
      } while (cont);
      console.log(`  commons ${cat}: ${n}`);
    }
  }
  await writeFile(dest, JSON.stringify(index));
  console.log(`✓ commons-ancient.json: ${Object.keys(index).length} characters`);
}

await mkdir(RAW, { recursive: true });
for (const s of SOURCES) await download(s);
// The Commons API rate-limits shared CI runners now and then; fall back to the committed snapshot
// (scripts/fallback/commons-ancient.json, refreshed whenever a local run succeeds) rather than fail.
try {
  await commonsIndex();
  await copyFile(path.join(RAW, 'commons-ancient.json'), path.resolve(import.meta.dirname, 'fallback/commons-ancient.json'));
} catch (e) {
  console.warn(`⚠ Commons index failed (${e.message}); using the snapshot in scripts/fallback/`);
  await copyFile(path.resolve(import.meta.dirname, 'fallback/commons-ancient.json'), path.join(RAW, 'commons-ancient.json'));
}
await writeFile(path.join(RAW, 'DOWNLOADED_AT'), new Date().toISOString());
