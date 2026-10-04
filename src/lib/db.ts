// Local-only persistence in IndexedDB via idb-keyval.
import { createStore, get, set, del, entries, setMany, clear } from 'idb-keyval';

const progressStore = createStore('zijing-progress', 'chars');
const appStore = createStore('zijing-app', 'kv');

export type PracticeMode = 'trace' | 'guided' | 'recall';
export const MODES: PracticeMode[] = ['trace', 'guided', 'recall'];

export interface Attempt {
  mode: PracticeMode;
  at: number; // epoch ms
  ms: number; // completion time
  mistakes: number;
  strokeMistakes: number[]; // per stroke
  score: number; // 0–100
  std: 'm' | 't';
}

export interface ModeStats {
  best: number;
  recent: number;
  count: number;
  last: number;
}

export interface CharProgress {
  c: string;
  views: number;
  firstSeen: number;
  lastSeen: number;
  attempts: Attempt[]; // newest last, capped
  modes: Partial<Record<PracticeMode, ModeStats>>;
  /** set when Recall was completed with zero mistakes */
  sealedAt?: number;
}

const MAX_ATTEMPTS = 60;

export async function getProgress(c: string): Promise<CharProgress | undefined> {
  return get<CharProgress>(c, progressStore);
}

export async function allProgress(): Promise<CharProgress[]> {
  return (await entries<string, CharProgress>(progressStore)).map(([, v]) => v);
}

function blank(c: string): CharProgress {
  const now = Date.now();
  return { c, views: 0, firstSeen: now, lastSeen: now, attempts: [], modes: {} };
}

export async function recordView(c: string): Promise<CharProgress> {
  const p = (await getProgress(c)) ?? blank(c);
  p.views++;
  p.lastSeen = Date.now();
  await set(c, p, progressStore);
  notify();
  return p;
}

/** Score: share of strokes drawn right first time, so 0 mistakes = 100. */
export function scoreFor(strokes: number, mistakes: number) {
  return Math.round((100 * strokes) / (strokes + mistakes));
}

export async function recordAttempt(c: string, a: Attempt): Promise<CharProgress> {
  const p = (await getProgress(c)) ?? blank(c);
  p.attempts.push(a);
  if (p.attempts.length > MAX_ATTEMPTS) p.attempts.splice(0, p.attempts.length - MAX_ATTEMPTS);
  const m = p.modes[a.mode] ?? { best: 0, recent: 0, count: 0, last: 0 };
  p.modes[a.mode] = { best: Math.max(m.best, a.score), recent: a.score, count: m.count + 1, last: a.at };
  if (a.mode === 'recall' && a.mistakes === 0 && !p.sealedAt) p.sealedAt = a.at;
  p.lastSeen = a.at;
  await set(c, p, progressStore);
  notify();
  return p;
}

export async function deleteProgress(c: string) {
  await del(c, progressStore);
  notify();
}

/** Mastery 0–100 for the reader overlay: recent scores weighted by how hard the mode is. */
export function mastery(p: CharProgress | undefined): number | null {
  if (!p) return null;
  const w: Record<PracticeMode, number> = { trace: 0.45, guided: 0.75, recall: 1 };
  let best: number | null = null;
  for (const mode of MODES) {
    const s = p.modes[mode];
    if (!s) continue;
    const v = ((s.recent + s.best) / 2) * w[mode];
    best = best === null ? v : Math.max(best, v);
  }
  return best === null ? null : Math.round(best);
}

export function lastPracticed(p: CharProgress): number | null {
  const ts = Object.values(p.modes).map((m) => m!.last);
  return ts.length ? Math.max(...ts) : null;
}

// ---------------------------------------------------------------- app key/value
export const appGet = <T>(k: string) => get<T>(k, appStore);
export const appSet = (k: string, v: unknown) => set(k, v, appStore);

// ---------------------------------------------------------------- export / import
export interface Backup {
  app: 'zijing';
  version: 1;
  exportedAt: string;
  progress: CharProgress[];
  settings?: unknown;
}

export async function exportAll(): Promise<Backup> {
  return { app: 'zijing', version: 1, exportedAt: new Date().toISOString(), progress: await allProgress(), settings: await appGet('settings') };
}

/** Merge a backup into the local DB: attempts are unioned, counters take the max. */
export async function importAll(b: Backup, mode: 'merge' | 'replace'): Promise<number> {
  if (b?.app !== 'zijing' || !Array.isArray(b.progress)) throw new Error('Not a 字境 backup file');
  if (mode === 'replace') await clear(progressStore);
  const out: [string, CharProgress][] = [];
  for (const incoming of b.progress) {
    if (!incoming?.c) continue;
    const cur = mode === 'merge' ? await getProgress(incoming.c) : undefined;
    if (!cur) {
      out.push([incoming.c, incoming]);
      continue;
    }
    const seen = new Set(cur.attempts.map((a) => a.at + a.mode));
    const attempts = [...cur.attempts, ...incoming.attempts.filter((a) => !seen.has(a.at + a.mode))].sort((x, y) => x.at - y.at).slice(-MAX_ATTEMPTS);
    const modes: CharProgress['modes'] = { ...cur.modes };
    for (const [k, v] of Object.entries(incoming.modes) as [PracticeMode, ModeStats][]) {
      const c = modes[k];
      modes[k] = !c ? v : { best: Math.max(c.best, v.best), recent: c.last >= v.last ? c.recent : v.recent, count: c.count + v.count, last: Math.max(c.last, v.last) };
    }
    out.push([incoming.c, {
      c: incoming.c,
      views: Math.max(cur.views, incoming.views),
      firstSeen: Math.min(cur.firstSeen, incoming.firstSeen),
      lastSeen: Math.max(cur.lastSeen, incoming.lastSeen),
      attempts,
      modes,
      sealedAt: cur.sealedAt ?? incoming.sealedAt,
    }]);
  }
  await setMany(out, progressStore);
  if (b.settings && mode === 'replace') await appSet('settings', b.settings);
  notify();
  return out.length;
}

// ---------------------------------------------------------------- change notifications
const listeners = new Set<() => void>();
export function onProgressChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function notify() {
  listeners.forEach((f) => f());
}
