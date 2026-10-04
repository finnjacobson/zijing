// Traditional ⇄ Simplified conversion. OpenCC dictionaries are large, so they load on first use.
import type { CharShard, Script } from './types';

type Fn = (s: string) => string;
let toTradP: Promise<Fn> | null = null;
let toSimpP: Promise<Fn> | null = null;

// Taiwan standard forms (為, not 爲) — they match the stroke data and the usual learner references.
const toTrad = () => (toTradP ??= import('opencc-js/cn2t').then((m) => m.Converter({ from: 'cn', to: 'tw' })));
const toSimp = () => (toSimpP ??= import('opencc-js/t2cn').then((m) => m.Converter({ from: 'tw', to: 'cn' })));

/** Which script a text is written in. Text that is the same in both scripts counts as 'simp'. */
export async function detectScript(text: string): Promise<Script> {
  const s = (await toSimp())(text);
  return s !== text ? 'trad' : 'simp';
}

export async function convertText(text: string, to: Script): Promise<string> {
  if ((await detectScript(text)) === to) return text;
  return (to === 'trad' ? await toTrad() : await toSimp())(text);
}

/** The forms of a character in the requested script (several when the mapping is one-to-many, e.g. 发 → 發/髮). */
export function counterpartsIn(shard: CharShard, script: Script): string[] {
  if (script === 'trad') return shard.k === 's' && shard.trad?.length ? shard.trad : [];
  return shard.k === 't' && shard.simp?.length ? shard.simp : [];
}

export const zhLang = (s: Script) => (s === 'trad' ? 'zh-Hant' : 'zh-Hans');
