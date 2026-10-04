// Compare Mandarin syllables for phonetic-series grouping.
import { parseNumbered, splitInitial } from './pinyin';

const Y_W: Record<string, string> = {
  yi: 'i', ya: 'ia', ye: 'ie', yao: 'iao', you: 'iou', yan: 'ian', yin: 'in', yang: 'iang', ying: 'ing', yong: 'iong',
  yu: 'v', yue: 've', yuan: 'van', yun: 'vn', yo: 'io',
  wu: 'u', wa: 'ua', wo: 'uo', wai: 'uai', wei: 'uei', wan: 'uan', wen: 'uen', wang: 'uang', weng: 'ueng',
};

/** Phonological initial + final: "you" → ['', 'iou'], "jun" → ['j', 'vn'], "gui" → ['g', 'uei']. */
export function analyse(base: string): { ini: string; fin: string } {
  if (Y_W[base]) return { ini: '', fin: Y_W[base] };
  let [ini, fin] = splitInitial(base);
  if ('jqx'.includes(ini) && ini && fin.startsWith('u')) fin = 'v' + fin.slice(1);
  if (fin === 'iu') fin = 'iou';
  else if (fin === 'ui') fin = 'uei';
  else if (fin === 'un') fin = 'uen';
  return { ini, fin };
}

/** Rime without the medial glide: iang → ang, uan → an, ve → e. */
export function rime(fin: string) {
  const r = fin.replace(/^[iuv](?=[aeo])/, '');
  return r === 'ong' ? 'eng' : r; // -ong patterns with -eng historically
}

export type Closeness = 'same' | 'tone' | 'rime' | 'initial' | 'far';

export const CLOSENESS_LABEL: Record<Closeness, string> = {
  same: 'Identical reading',
  tone: 'Same syllable, different tone',
  rime: 'Same rhyme, different initial',
  initial: 'Same initial, different rhyme',
  far: 'Drifted away',
};

export function closeness(head: string | null, other: string | null): Closeness {
  const a = head ? parseNumbered(head) : null;
  const b = other ? parseNumbered(other) : null;
  if (!a || !b) return 'far';
  if (a.base === b.base) return a.tone === b.tone ? 'same' : 'tone';
  const x = analyse(a.base);
  const y = analyse(b.base);
  if (rime(x.fin) === rime(y.fin)) return 'rime';
  if (x.ini && x.ini === y.ini) return 'initial';
  return 'far';
}
