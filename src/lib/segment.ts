// Word segmentation: unigram dynamic programming over CC-CEDICT, weighted by SUBTLEX-CH frequencies.
// Only the word shards for characters actually in the text are fetched.
import { getWords, isHan } from './data';
import type { WordShard } from './types';

export interface WordInfo {
  form: string;
  freq: number;
  readings: { p: string; g: string }[];
}

export interface Token {
  text: string;
  han: boolean;
  word?: WordInfo;
}

const MAX_WORD = 8;

function info(form: string, row: (string | number)[]): WordInfo {
  const readings: WordInfo['readings'] = [];
  for (let i = 1; i + 1 < row.length; i += 2) readings.push({ p: String(row[i]), g: String(row[i + 1]) });
  return { form, freq: Number(row[0]), readings };
}

/** Log-probability of a dictionary word. Unseen-in-corpus words keep a floor so set phrases (成語) still win. */
function cost(len: number, freq: number) {
  const perMillion = freq > 0 ? freq : len > 1 ? 0.4 : 0.05;
  return Math.log(perMillion / 1e6);
}
const UNKNOWN = Math.log(0.005 / 1e6);

export async function loadShards(text: string): Promise<Map<string, WordShard>> {
  const uniq = [...new Set([...text].filter(isHan))];
  const shards = await Promise.all(uniq.map((c) => getWords(c)));
  const m = new Map<string, WordShard>();
  uniq.forEach((c, i) => shards[i] && m.set(c, shards[i]!));
  return m;
}

function segmentRun(run: string[], shards: Map<string, WordShard>): Token[] {
  const n = run.length;
  const best = new Array<number>(n + 1).fill(-Infinity);
  const back = new Array<{ from: number; word?: WordInfo }>(n + 1);
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    if (best[i] === -Infinity) continue;
    const shard = shards.get(run[i]);
    let single = false;
    for (let len = 1; len <= Math.min(MAX_WORD, n - i); len++) {
      const form = run.slice(i, i + len).join('');
      const row = shard?.[form];
      if (!row) continue;
      if (len === 1) single = true;
      const s = best[i] + cost(len, Number(row[0]));
      if (s > best[i + len]) {
        best[i + len] = s;
        back[i + len] = { from: i, word: info(form, row) };
      }
    }
    if (!single) {
      const s = best[i] + UNKNOWN;
      if (s > best[i + 1]) {
        best[i + 1] = s;
        back[i + 1] = { from: i };
      }
    }
  }
  const out: Token[] = [];
  for (let j = n; j > 0; ) {
    const b = back[j];
    out.push({ text: run.slice(b.from, j).join(''), han: true, word: b.word });
    j = b.from;
  }
  return out.reverse();
}

/** Split text into Han word tokens and non-Han runs (punctuation, Latin, whitespace). */
export async function segment(text: string, shards?: Map<string, WordShard>): Promise<Token[]> {
  shards ??= await loadShards(text);
  const out: Token[] = [];
  let run: string[] = [];
  let other = '';
  const flushRun = () => {
    if (run.length) out.push(...segmentRun(run, shards!));
    run = [];
  };
  const flushOther = () => {
    if (other) out.push({ text: other, han: false });
    other = '';
  };
  for (const ch of text) {
    if (isHan(ch)) {
      flushOther();
      run.push(ch);
    } else {
      flushRun();
      other += ch;
    }
  }
  flushRun();
  flushOther();
  return out;
}

/** Dictionary lookup for an exact form (used for vocab-list rows). */
export async function lookup(form: string): Promise<WordInfo | null> {
  const first = [...form][0];
  if (!first) return null;
  const shard = await getWords(first);
  const row = shard?.[form];
  return row ? info(form, row) : null;
}
