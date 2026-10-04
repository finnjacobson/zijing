import type { CharShard, SealGlyph, StrokeData, WordShard } from './types';

const BASE = import.meta.env.BASE_URL + 'data/';
const cache = new Map<string, Promise<unknown>>();

export const hex = (c: string) => c.codePointAt(0)!.toString(16).toUpperCase();

/** Fetch a shard once; resolves null when the file doesn't exist. */
function load<T>(dir: string, c: string): Promise<T | null> {
  const key = dir + c;
  let p = cache.get(key) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(`${BASE}${dir}/${hex(c)}.json`)
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? (r.json() as Promise<T>) : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

export const getChar = (c: string) => load<CharShard>('c', c);
export const getWords = (first: string) => load<WordShard>('w', first);
export const getSeal = (c: string) => load<SealGlyph>('z', c);
export const getStrokes = (c: string, std: 'm' | 't') => load<StrokeData>(std === 't' ? 't' : 's', c);

export const isHan = (c: string) => /\p{Script=Han}/u.test(c);

export const COMMONS_BASE = 'https://upload.wikimedia.org/wikipedia/commons/';
