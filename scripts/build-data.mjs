// Merges the raw datasets in data-raw/ into lazy-loaded JSON shards under public/data/.
//
//   public/data/c/<HEX>.json   character shard (readings, meanings, words, tree, series, ancient forms…)
//   public/data/s/<HEX>.json   stroke data, Make Me a Hanzi (PRC stroke order) + computed radStrokes
//   public/data/t/<HEX>.json   stroke data, AnimCJK zh-Hant (Taiwan stroke order) where available
//   public/data/w/<HEX>.json   words starting with this character (segmentation + hover glosses)
//   public/data/z/<HEX>.json   small-seal glyph outline (Kaiyuan Small Seal), loaded with the etymology strip
//   public/data/meta.json      build stats
//   public/data/files.json     list of all shards (offline download)
//
// HEX is the uppercase code point, e.g. 馬 → 99AC.
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { markedToNumbered, parseNumbered, splitInitial } from '../src/lib/pinyin.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data-raw');
const OUT = path.join(ROOT, 'public/data');

const hex = (c) => c.codePointAt(0).toString(16).toUpperCase();
const fromU = (u) => String.fromCodePoint(parseInt(u.replace(/^U\+/, ''), 16));
const isHan = (c) => /\p{Script=Han}/u.test(c);
const chars = (s) => [...s];
const readLines = async (f, enc = 'utf8') => {
  const buf = await readFile(path.join(RAW, f));
  return new TextDecoder(enc).decode(buf).split(/\r?\n/);
};
const log = (...a) => console.log('·', ...a);

// ---------------------------------------------------------------- Unihan
log('Unihan');
const unihan = new Map(); // char → { field: value }
for (const f of (await readdir(path.join(RAW, 'Unihan'))).filter((f) => f.endsWith('.txt'))) {
  for (const line of await readLines('Unihan/' + f)) {
    if (!line.startsWith('U+')) continue;
    const [cp, field, value] = line.split('\t');
    const c = fromU(cp);
    let e = unihan.get(c);
    if (!e) unihan.set(c, (e = {}));
    e[field] = value;
  }
}
const uList = (v) => (v ? v.split(' ').map((x) => x.split('<')[0]).filter((x) => x.startsWith('U+')).map(fromU) : []);
const tradOf = (c) => uList(unihan.get(c)?.kTraditionalVariant).filter((x) => x !== c);
const simpOf = (c) => uList(unihan.get(c)?.kSimplifiedVariant).filter((x) => x !== c);
/** 's' simplified-only, 't' traditional-only, 'b' shared by both scripts.
 *  Unihan lists some simplified forms as their own traditional variant too (图 → 图 圖), so a form is
 *  simplified whenever it has any *other* traditional variant. */
function scriptOf(c) {
  if (tradOf(c).length) return 's';
  if (simpOf(c).length) return 't';
  return 'b';
}
function kangxiRadical(rs) {
  // kRSUnicode "187.0", "187'.3" (simplified form of the radical)
  const m = /^(\d+)('*)\.(-?\d+)/.exec(rs ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return { num: n, simplified: m[2].length > 0, extra: Number(m[3]), char: String.fromCodePoint(0x2f00 + n - 1).normalize('NFKC') };
}

// ---------------------------------------------------------------- SUBTLEX-CH
log('SUBTLEX-CH');
const wordFreq = new Map(); // simplified word → count per million
for (const line of (await readLines('subtlex-wf/SUBTLEX-CH-WF', 'gb18030')).slice(3)) {
  const [w, , perMil] = line.split('\t');
  if (w && perMil) wordFreq.set(w, Number(perMil));
}
const charRank = new Map();
let rank = 0;
for (const line of (await readLines('subtlex-chr/SUBTLEX-CH-CHR', 'gb18030')).slice(3)) {
  const [c] = line.split('\t');
  if (c && !charRank.has(c)) charRank.set(c, ++rank);
}

// ---------------------------------------------------------------- CC-CEDICT
log('CC-CEDICT');
const words = new Map(); // "trad|simp" → { t, s, readings: [{p, d:[]}] }
let cedictHeader = '';
for (const line of await readLines('cedict.txt')) {
  if (line.startsWith('#')) {
    if (/#! (date|version|entries)/.test(line)) cedictHeader += line.slice(3) + '; ';
    continue;
  }
  const m = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/.exec(line);
  if (!m) continue;
  const [, t, s, p, defs] = m;
  const key = t + '|' + s;
  let w = words.get(key);
  if (!w) words.set(key, (w = { t, s, readings: [] }));
  const pin = p.replace(/u:/g, 'v');
  let r = w.readings.find((x) => x.p === pin); // case matters: "Le4" (surname) vs "le4"
  if (!r) w.readings.push((r = { p: pin, d: [] }));
  r.d.push(...defs.split('/').filter(Boolean));
}
const freqOf = (w) => wordFreq.get(w.s) ?? 0;
// Readings of proper names ("Xue2") and variant cross-references sort last.
const isNameReading = (r) => /^[A-Z]/.test(r.p);
const isXref = (d) => /^(old |archaic |Japanese )?variant of|^see |^CL:|^used in |^\(old\)|^also written/i.test(d);
function gloss(readings, max = 3) {
  const all = readings.flatMap((r) => r.d);
  const main = all.filter((d) => !isXref(d));
  return (main.length ? main : all).slice(0, max).join('; ').slice(0, 120);
}

const wordsByChar = new Map(); // char → [word]
const wordsByFirst = new Map(); // first char → Map(form → [word])
for (const w of words.values()) {
  const len = chars(w.t).length;
  for (const c of new Set([...chars(w.t), ...chars(w.s)])) {
    if (!isHan(c) || len < 2) continue;
    let a = wordsByChar.get(c);
    if (!a) wordsByChar.set(c, (a = []));
    a.push(w);
  }
  for (const form of new Set([w.t, w.s])) {
    const first = chars(form)[0];
    if (!isHan(first)) continue;
    let m = wordsByFirst.get(first);
    if (!m) wordsByFirst.set(first, (m = new Map()));
    let a = m.get(form);
    if (!a) m.set(form, (a = []));
    a.push(w);
  }
}
const singleEntries = new Map(); // char → [word entries where the headword is that single char]
for (const w of words.values()) {
  if (chars(w.t).length !== 1) continue;
  for (const c of new Set([w.t, w.s])) {
    let a = singleEntries.get(c);
    if (!a) singleEntries.set(c, (a = []));
    a.push(w);
  }
}

// ---------------------------------------------------------------- Make Me a Hanzi
log('Make Me a Hanzi');
const mmah = new Map();
for (const line of await readLines('mmah-dictionary.txt')) if (line) { const d = JSON.parse(line); mmah.set(d.character, d); }
const mmahGraphics = new Map();
for (const line of await readLines('mmah-graphics.txt')) if (line) { const d = JSON.parse(line); mmahGraphics.set(d.character, d); }
const acjkGraphics = new Map();
for (const line of await readLines('animcjk-graphicsZhHant.txt')) if (line) { const d = JSON.parse(line); acjkGraphics.set(d.character, d); }

const IDS_ARITY = { '⿰': 2, '⿱': 2, '⿲': 3, '⿳': 3, '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2, '⿼': 2, '⿽': 2, '⿾': 1, '⿿': 1, '㇯': 2 };
function parseIds(ids) {
  const cs = chars(ids);
  let i = 0;
  const walk = () => {
    const c = cs[i++];
    if (c === undefined) return { c: '？' };
    const n = IDS_ARITY[c];
    if (n) return { op: c, kids: Array.from({ length: n }, walk) };
    return { c };
  };
  return walk();
}
/** Strokes (indices) whose MMAH match path starts with prefix. */
function strokesUnder(matches, prefix) {
  const out = [];
  matches?.forEach((m, i) => {
    if (m && prefix.every((p, k) => m[k] === p)) out.push(i);
  });
  return out;
}
const RADICAL_FORMS = { 氵: '水', 扌: '手', 忄: '心', 亻: '人', 犭: '犬', 礻: '示', 衤: '衣', 讠: '言', 訁: '言', 钅: '金', 釒: '金', 饣: '食', 飠: '食', 纟: '糸', 糹: '糸', 艹: '艸', 罒: '网', 阝: '阜', 刂: '刀', 灬: '火', 爫: '爪', 王: '玉', 月: '肉', 冫: '冰', 辶: '辵', 攵: '攴', 彑: '彐', 牜: '牛', 𧾷: '足', 䒑: '艸' };
const sameComponent = (a, b) => a && b && (a === b || RADICAL_FORMS[a] === b || RADICAL_FORMS[b] === a || RADICAL_FORMS[a] === RADICAL_FORMS[b] && RADICAL_FORMS[a]);

/** Decomposition tree down to primitives; roles come from the parent's etymology. */
function buildTree(c, depth = 0, seen = new Set()) {
  const d = mmah.get(c);
  const node = { c };
  if (!d || depth > 6 || seen.has(c) || !d.decomposition || d.decomposition.startsWith('？') || chars(d.decomposition).length < 2) return node;
  const ety = d.etymology ?? {};
  const next = new Set(seen).add(c);
  const conv = (n, pathIdx) => {
    if (n.op) return { op: n.op, kids: n.kids.map((k, i) => conv(k, [...pathIdx, i])) };
    if (n.c === '？') return { c: '？' };
    const sub = buildTree(n.c, depth + 1, next);
    if (ety.type === 'pictophonetic') {
      if (sameComponent(n.c, ety.semantic)) sub.role = 'semantic';
      else if (sameComponent(n.c, ety.phonetic)) sub.role = 'phonetic';
      else sub.role = 'form';
    } else sub.role = 'form';
    if (depth === 0) sub.strokes = strokesUnder(d.matches, pathIdx);
    return sub;
  };
  const root = parseIds(d.decomposition);
  node.ids = d.decomposition;
  if (root.op) {
    node.op = root.op;
    node.kids = root.kids.map((k, i) => conv(k, [i]));
  }
  return node;
}
function radStrokes(c) {
  const d = mmah.get(c);
  if (!d?.matches) return undefined;
  const root = parseIds(d.decomposition ?? '');
  const hits = [];
  const walk = (n, p) => {
    if (n.op) n.kids.forEach((k, i) => walk(k, [...p, i]));
    else if (sameComponent(n.c, d.radical)) hits.push(p);
  };
  walk(root, []);
  if (!hits.length) return undefined;
  const s = strokesUnder(d.matches, hits[0]);
  return s.length && s.length < d.matches.length ? s : undefined;
}

// Phonetic series index: phonetic component → members
const seriesIndex = new Map();
for (const d of mmah.values()) {
  const p = d.etymology?.type === 'pictophonetic' ? d.etymology.phonetic : null;
  if (!p) continue;
  let a = seriesIndex.get(p);
  if (!a) seriesIndex.set(p, (a = []));
  a.push(d.character);
}

// ---------------------------------------------------------------- Readings
function primaryPinyin(c) {
  // Most frequent CEDICT reading (lowercase, non-name) else Unihan kMandarin.
  const entries = singleEntries.get(c) ?? [];
  for (const w of entries) for (const r of w.readings) if (!isNameReading(r) && !r.d.every(isXref)) return r.p;
  const km = unihan.get(c)?.kMandarin?.split(' ')[0];
  return km ? markedToNumbered(km) : null;
}

// ---------------------------------------------------------------- Shuowen, seal glyphs, Commons ancient forms
log('Shuowen / Kaiyuan seal / Commons');
const shuowen = new Map();
const swEntries = [];
for (const f of await readdir(path.join(RAW, 'shuowen/data'))) {
  const d = JSON.parse(await readFile(path.join(RAW, 'shuowen/data', f), 'utf8'));
  if (!d.wordhead) continue;
  swEntries.push(d);
}
// Headwords first, then the alternative forms listed in `indexes` (e.g. 學 is filed under 斅).
swEntries.sort((a, b) => Number(a.id) - Number(b.id));
for (const pass of ['head', 'index']) for (const d of swEntries) {
  const keys = pass === 'head' ? [d.wordhead] : (d.indexes ?? []).filter((x) => chars(x).length === 1);
  for (const key of keys) {
    if (shuowen.has(key)) continue;
    shuowen.set(key, {
    head: d.wordhead,
    id: Number(d.id),
    e: d.explanation,
    r: d.radical,
    f: d.pronunciation,
    v: d.volume,
    duan: (d.duan_notes ?? []).slice(0, 3).map((n) => [n.explanation, n.note]),
    });
  }
}

const sealByChar = new Map();
{
  const status = new Map();
  for (const line of (await readLines('kaiyuan-seal/data/provenance/glyphs.csv')).slice(1)) {
    const cols = line.split(',');
    if (cols.length > 20) status.set(cols[0], { st: cols.at(-1), kind: cols[16] });
  }
  const mcjk = [];
  for (const line of await readLines('kaiyuan-seal/third_party/unicode/ucd/SealSources.txt')) {
    const m = /^U\+(\w+)\tkSEAL_MCJK\t(\w+)/.exec(line);
    if (m) mcjk.push([m[1], fromU(m[2])]);
  }
  const files = new Set(await readdir(path.join(RAW, 'kaiyuan-seal/glyphs')));
  for (const [cp, modern] of mcjk) {
    const s = status.get(cp);
    const file = `u${cp}.svg`;
    if (!s || s.st === 'rejected' || !files.has(file) || sealByChar.has(modern)) continue;
    const svg = await readFile(path.join(RAW, 'kaiyuan-seal/glyphs', file), 'utf8');
    const vb = /viewBox="([^"]+)"/.exec(svg)?.[1];
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    if (vb && paths.length) sealByChar.set(modern, { cp, vb, d: paths, reviewed: s.st === 'approved' || s.st === 'manual' });
  }
}
const commons = JSON.parse(await readFile(path.join(RAW, 'commons-ancient.json'), 'utf8'));

// ---------------------------------------------------------------- Character set
const charSet = new Set([...mmah.keys(), ...acjkGraphics.keys(), ...singleEntries.keys()]);
for (const w of words.values()) for (const c of chars(w.t + w.s)) if (isHan(c)) charSet.add(c);
for (const [c, u] of unihan) if (u.kMandarin && (u.kIICore || u.kUnihanCore2020 || u.kBigFive || u.kGB0 || u.kGB1)) charSet.add(c);
for (const c of [...charSet]) if (!isHan(c) || c.codePointAt(0) < 0x2e80) charSet.delete(c);
log(`${charSet.size} characters`);

// ---------------------------------------------------------------- Emit
await rm(OUT, { recursive: true, force: true });
for (const d of ['c', 's', 't', 'w', 'z']) await mkdir(path.join(OUT, d), { recursive: true });

const stats = { chars: 0, withStrokes: 0, withTaiwanStrokes: 0, withTree: 0, withEtymology: 0, withAncient: 0, withSeal: 0, withShuowen: 0, wordShards: 0, bytes: 0 };
const gaps = { tradNoStrokes: [], commonNoStrokes: [], commonNoAncient: [] };
const write = async (rel, obj) => {
  const s = JSON.stringify(obj);
  stats.bytes += s.length;
  await writeFile(path.join(OUT, rel), s);
};

function seriesFor(head) {
  const members = seriesIndex.get(head) ?? [];
  const list = [head, ...members.filter((m) => m !== head)].map((m) => ({ c: m, p: primaryPinyin(m), k: scriptOf(m), r: charRank.get(m) ?? charRank.get(simpOf(m)[0]) ?? 99999 }));
  list.sort((a, b) => (a.c === head ? -1 : b.c === head ? 1 : a.r - b.r));
  return list.slice(0, 80).map((m) => [m.c, m.p, m.k, m.r]);
}

const STROKE_ROUND = (g, rad) => ({ strokes: g.strokes, medians: g.medians, ...(rad ? { radStrokes: rad } : {}) });

for (const c of charSet) {
  const u = unihan.get(c) ?? {};
  const trad = tradOf(c);
  const simp = simpOf(c);
  const counterpart = [...trad, ...simp];
  // Fall back to the counterpart's structural data when this exact form isn't in MMAH.
  const mmahChar = mmah.has(c) ? c : counterpart.find((x) => mmah.has(x));
  const md = mmahChar ? mmah.get(mmahChar) : null;

  // Entries for exactly this form first; drop notes like "old variant of 和[he2]" on 和's own page.
  const selfRef = new RegExp(`variant of ${c}(\\||\\[|$)`);
  const entries = (singleEntries.get(c) ?? [])
    .slice()
    .sort((a, b) => (a.t === c && a.s === c ? 0 : a.t === c ? 1 : 2) - (b.t === c && b.s === c ? 0 : b.t === c ? 1 : 2))
    .flatMap((w) => w.readings.map((r) => ({ p: r.p, d: r.d.filter((d) => !(w.t !== c && selfRef.test(d))), t: w.t, s: w.s })))
    .filter((e) => e.d.length);
  // Merge same-reading entries, keep order: common readings first, names last.
  const byReading = new Map();
  for (const e of entries) {
    const k = e.p;
    const cur = byReading.get(k);
    if (cur) cur.d.push(...e.d.filter((d) => !cur.d.includes(d)));
    else byReading.set(k, { p: e.p, d: [...e.d] });
  }
  // Unihan's kMandarin gives the customary reading first (說 shuō, not shuì); minor readings sink.
  const km = (u.kMandarin?.split(' ') ?? []).map(markedToNumbered);
  const kmRank = (r) => { const i = km.indexOf(r.p.toLowerCase()); return i < 0 ? km.length + 1 : i; };
  // Usage weight: how often the character carries each reading inside real words (SUBTLEX-weighted).
  const usage = new Map();
  for (const w of wordsByChar.get(c) ?? []) {
    const f = freqOf(w);
    if (!f) continue;
    for (const form of [w.t, w.s]) {
      const cs = chars(form);
      for (const r of w.readings) {
        const syl = r.p.split(' ');
        if (syl.length !== cs.length) continue;
        cs.forEach((x, i) => x === c && usage.set(syl[i].toLowerCase(), (usage.get(syl[i].toLowerCase()) ?? 0) + f));
      }
    }
  }
  const use = (r) => usage.get(r.p.toLowerCase()) ?? 0;
  const minor = (r) => r.d.every((d) => isXref(d) || /^used in |place name|^surname/i.test(d));
  const order = [...byReading.values()]; // original CEDICT order, used as the final tie-break
  const meanings = [...order].sort((a, b) => isNameReading(a) - isNameReading(b) || minor(a) - minor(b) || use(b) - use(a) || kmRank(a) - kmRank(b) || order.indexOf(a) - order.indexOf(b));

  const contain = (wordsByChar.get(c) ?? [])
    .map((w) => ({ w, f: freqOf(w) }))
    .sort((a, b) => b.f - a.f || chars(a.w.t).length - chars(b.w.t).length);
  const seenW = new Set();
  const topWords = [];
  for (const { w, f } of contain) {
    const k = w.t + w.s;
    if (seenW.has(k)) continue;
    seenW.add(k);
    const r = w.readings.filter((r) => !isNameReading(r));
    if (!r.length) continue;
    topWords.push([w.t, w.s, r[0].p, gloss(r), Math.round(f * 100) / 100]);
    if (topWords.length >= 30) break;
  }

  const ety = md?.etymology;
  const series = [];
  if (ety?.type === 'pictophonetic' && ety.phonetic && seriesIndex.has(ety.phonetic)) series.push({ head: ety.phonetic, m: seriesFor(ety.phonetic) });
  if (seriesIndex.has(c) && ety?.phonetic !== c) series.push({ head: c, m: seriesFor(c) });

  const ancientKey = commons[c] ? c : counterpart.find((x) => commons[x]);
  const sealKey = sealByChar.has(c) ? c : counterpart.find((x) => sealByChar.has(x));
  const swKey = shuowen.has(c) ? c : trad.find((x) => shuowen.has(x));
  const rs = kangxiRadical(u.kRSUnicode);
  const hasM = mmahGraphics.has(c);
  const hasT = acjkGraphics.has(c);

  const shard = {
    c,
    ...(trad.length ? { trad } : {}),
    ...(simp.length ? { simp } : {}),
    k: scriptOf(c),
    sc: u.kTotalStrokes ? Number(u.kTotalStrokes.split(' ')[0]) : null,
    rs: rs ? { n: rs.num, c: rs.char, x: rs.extra, s: rs.simplified } : null,
    rad: md?.radical ?? null,
    // SUBTLEX is simplified-only, so a traditional form takes its simplified counterpart's rank.
    fr: (scriptOf(c) === 't' ? charRank.get(simp[0]) : null) ?? charRank.get(c) ?? null,
    def: u.kDefinition ?? null,
    rd: {
      m: u.kMandarin?.split(' ').map(markedToNumbered) ?? [],
      hp: u.kHanyuPinyin ? [...new Set(u.kHanyuPinyin.split(' ').flatMap((x) => x.split(':')[1]?.split(',') ?? []))].map(markedToNumbered) : [],
      yue: u.kCantonese?.split(' ') ?? [],
      jaOn: u.kJapaneseOn?.split(' ') ?? [],
      jaKun: u.kJapaneseKun?.split(' ') ?? [],
      ja: u.kJapanese?.split(' ') ?? [],
      ko: u.kHangul?.split(' ').map((x) => x.split(':')[0]) ?? [],
      koR: u.kKorean?.split(' ') ?? [],
      vi: u.kVietnamese?.split(' ') ?? [],
    },
    mn: meanings.map((r) => ({ p: r.p, d: r.d })),
    w: topWords,
    ...(md
      ? {
          mm: {
            from: mmahChar,
            ids: md.decomposition,
            ety: ety ?? null,
            def: md.definition ?? null,
          },
          tree: buildTree(mmahChar),
        }
      : {}),
    sr: series,
    an: ancientKey ? { from: ancientKey, f: commons[ancientKey] } : null,
    seal: sealKey ? { from: sealKey, reviewed: sealByChar.get(sealKey).reviewed } : null,
    sw: swKey ? { from: swKey, ...shuowen.get(swKey) } : null,
    st: [hasM && 'm', hasT && 't'].filter(Boolean),
    var: {
      sem: uList(u.kSemanticVariant).filter((x) => x !== c),
      z: uList(u.kZVariant).filter((x) => x !== c),
    },
  };
  await write(`c/${hex(c)}.json`, shard);
  stats.chars++;
  if (sealKey) await write(`z/${hex(c)}.json`, sealByChar.get(sealKey));
  if (hasM) {
    stats.withStrokes++;
    await write(`s/${hex(c)}.json`, STROKE_ROUND(mmahGraphics.get(c), radStrokes(c)));
  }
  if (hasT) {
    stats.withTaiwanStrokes++;
    await write(`t/${hex(c)}.json`, STROKE_ROUND(acjkGraphics.get(c)));
  }
  if (md) stats.withTree++;
  if (ety) stats.withEtymology++;
  if (ancientKey) stats.withAncient++;
  if (sealKey) stats.withSeal++;
  if (swKey) stats.withShuowen++;
  const r = shard.fr;
  if (r && r <= 3000 && !hasM && !hasT) gaps.commonNoStrokes.push(c);
  if (shard.k === 't' && !hasM && !hasT && simp.some((s) => (charRank.get(s) ?? 1e9) <= 3000)) gaps.tradNoStrokes.push(c);
  if (r && r <= 1000 && !ancientKey) gaps.commonNoAncient.push(c);
}

// Word-start shards for segmentation and hover glosses: form → [freq, pinyin, gloss, pinyin, gloss, …]
for (const [first, m] of wordsByFirst) {
  const obj = {};
  for (const [form, ws] of m) {
    const rs = ws.flatMap((w) => w.readings);
    const main = rs.filter((r) => !isNameReading(r));
    const use = (main.length ? main : rs).slice(0, 3);
    obj[form] = [Math.round(Math.max(...ws.map(freqOf)) * 100) / 100, ...use.flatMap((r) => [r.p, gloss([r], 2)])];
  }
  await write(`w/${hex(first)}.json`, obj);
  stats.wordShards++;
}

const meta = {
  built: new Date().toISOString(),
  downloaded: (await readFile(path.join(RAW, 'DOWNLOADED_AT'), 'utf8').catch(() => '')).trim(),
  cedict: cedictHeader,
  unihanVersion: 'latest (' + ((await readFile(path.join(RAW, 'Unihan/Unihan_Readings.txt'), 'utf8')).match(/Unicode Version (\d+\.\d+\.\d+)/)?.[1] ?? 'unknown') + ')',
  stats,
  gaps: { tradNoStrokes: gaps.tradNoStrokes.length, commonNoStrokes: gaps.commonNoStrokes.length, commonNoAncient: gaps.commonNoAncient.length },
};
await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
// Index of every shard, used by the app's "download everything for offline use" option.
const files = {};
for (const d of ['c', 's', 't', 'w', 'z']) files[d] = (await readdir(path.join(OUT, d))).map((f) => f.replace('.json', ''));
await writeFile(path.join(OUT, 'files.json'), JSON.stringify({ built: meta.built, bytes: stats.bytes, files }));
await writeFile(path.join(ROOT, 'data-raw/gaps.json'), JSON.stringify(gaps, null, 1));
console.log(JSON.stringify(meta, null, 1));
