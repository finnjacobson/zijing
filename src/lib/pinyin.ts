// Pinyin helpers shared by the build pipeline (Node strips the types) and the app.
// Canonical internal form is CEDICT-style numbered pinyin with ü written as "v": "lv4", "xue2", "ma5".
import romanization from '../data/romanization.json' with { type: 'json' };

type Rom = { z: string; w: string; y: string };
const TABLE = romanization as Record<string, Rom>;

const MARKS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};
const UNMARK: Record<string, [string, number]> = {};
for (const [base, marked] of Object.entries(MARKS)) marked.forEach((m, i) => (UNMARK[m] = [base, i + 1]));
UNMARK['ü'] = ['v', 0];
UNMARK['ê'] = ['ê', 0];
// Uncommon precomposed forms seen in Unihan for m/n/ê
Object.assign(UNMARK, { 'ḿ': ['m', 2], 'ǹ': ['n', 4], 'ń': ['n', 2], 'ň': ['n', 3], 'ế': ['ê', 2], 'ề': ['ê', 4] });

export interface Syllable {
  base: string; // lowercase, ü as v
  tone: number; // 1–5 (5 = neutral)
  cap: boolean;
}

/** Parse one numbered syllable ("Xue2", "lu:4", "lv4", "r5"). */
export function parseNumbered(s: string): Syllable | null {
  const m = /^([A-Za-zü:êÊ]+)([1-5])?$/.exec(s.trim());
  if (!m) return null;
  const cap = m[1][0] !== m[1][0].toLowerCase();
  const base = m[1].toLowerCase().replace('u:', 'v').replace('ü', 'v');
  return { base, tone: m[2] ? Number(m[2]) : 5, cap };
}

/** "xué" → "xue2"; "lǜ" → "lv4"; "ma" → "ma5" */
export function markedToNumbered(s: string): string {
  let tone = 5;
  let out = '';
  for (const ch of s.normalize('NFC').toLowerCase()) {
    const u = UNMARK[ch];
    if (u) {
      out += u[0];
      if (u[1]) tone = u[1];
    } else out += ch;
  }
  return out + tone;
}

/** Where the tone mark goes: a/e first, then the o of "ou", else the last vowel. */
function markIndex(base: string): number {
  for (const v of ['a', 'e']) {
    const i = base.indexOf(v);
    if (i >= 0) return i;
  }
  const ou = base.indexOf('ou');
  if (ou >= 0) return ou;
  for (let i = base.length - 1; i >= 0; i--) if ('iouvê'.includes(base[i])) return i;
  return -1;
}

export function syllableToMarked({ base, tone, cap }: Syllable): string {
  let out = base;
  const i = markIndex(base);
  if (tone >= 1 && tone <= 4 && i >= 0 && MARKS[base[i]]) out = base.slice(0, i) + MARKS[base[i]][tone - 1] + base.slice(i + 1);
  out = out.replace('v', 'ü');
  return cap ? out[0].toUpperCase() + out.slice(1) : out;
}

/** "xue2 xi2" → "xuéxí"-style syllables joined by the given separator. */
export function numberedToMarked(p: string, sep = ' '): string {
  return p
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => {
      const syl = parseNumbered(s);
      return syl ? syllableToMarked(syl) : s;
    })
    .join(sep);
}

/** Compact word display: CEDICT "xue2 xi2" → "xuéxí" (apostrophe before a/e/o as pinyin requires). */
export function wordPinyin(p: string): string {
  const parts = p.split(/\s+/).filter(Boolean);
  return parts
    .map((s, i) => {
      const syl = parseNumbered(s);
      if (!syl) return s;
      const marked = syllableToMarked(syl);
      return i > 0 && /^[aeo]/.test(syl.base) ? "'" + marked : marked;
    })
    .join('');
}

const ZY_TONE = ['', 'ˊ', 'ˇ', 'ˋ'];
const SUP = ['¹', '²', '³', '⁴', '⁵'];
const COMBINING = ['̄', '́', '̌', '̀'];

export function toZhuyin(num: string): string {
  const s = parseNumbered(num);
  const r = s && TABLE[s.base];
  if (!s || !r) return '';
  if (s.tone === 5) return '˙' + r.z;
  return r.z + (ZY_TONE[s.tone - 1] ?? '');
}

export function toWadeGiles(num: string): string {
  const s = parseNumbered(num);
  const r = s && TABLE[s.base];
  if (!s || !r) return '';
  return r.w + (s.tone <= 4 ? SUP[s.tone - 1] : '');
}

/** Yale marks the tone on the main vowel (on r/z for syllables like "jr", "sz"). */
export function toYale(num: string): string {
  const s = parseNumbered(num);
  const r = s && TABLE[s.base];
  if (!s || !r) return '';
  const y = r.y;
  if (s.tone === 5) return y;
  let i = -1;
  for (const v of ['a', 'e', 'o']) if (i < 0 && y.includes(v)) i = y.indexOf(v);
  if (i < 0) for (let k = y.length - 1; k >= 0; k--) if ('iuü'.includes(y[k])) { i = k; break; }
  if (i < 0) i = y.length - 1; // jr, sz
  return (y.slice(0, i + 1) + COMBINING[s.tone - 1] + y.slice(i + 1)).normalize('NFC');
}

export const TONE_NAMES = ['first', 'second', 'third', 'fourth', 'neutral'];

/** Tone number of a numbered syllable, 5 if neutral/unknown. */
export function toneOf(num: string): number {
  return parseNumbered(num)?.tone ?? 5;
}

/** Split a toneless syllable into initial + final (zh/ch/sh first; y/w treated as glides). */
export function splitInitial(base: string): [string, string] {
  const m = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(.*)$/.exec(base)!;
  return [m[1] ?? '', m[2]];
}
