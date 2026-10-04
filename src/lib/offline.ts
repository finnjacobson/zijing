// "Download everything for offline use": fetch every data shard into the service worker's data cache.
const BASE = import.meta.env.BASE_URL + 'data/';
// Must match DATA in pwa/sw.js.
export const DATA_CACHE = 'zijing-data-v1';

interface FileIndex {
  built: string;
  bytes: number;
  files: Record<string, string[]>;
}

export interface OfflineStatus {
  supported: boolean;
  total: number;
  cached: number;
  bytes: number; // approximate size of the full data set
  built: string | null;
}

/** The shard list: fresh when online (and kept in the cache), the cached copy when offline. */
async function index(): Promise<FileIndex> {
  const url = BASE + 'files.json';
  const cache = await caches.open(DATA_CACHE);
  try {
    const r = await fetch(url, { cache: 'no-cache', headers: { 'X-Zijing-Offline': '1' } });
    if (!r.ok) throw new Error(`files.json: ${r.status}`);
    await cache.put(url, r.clone());
    return r.json();
  } catch (e) {
    const hit = await cache.match(url);
    if (hit) return hit.json();
    throw e;
  }
}

const urlsOf = (ix: FileIndex) => Object.entries(ix.files).flatMap(([dir, names]) => names.map((n) => `${BASE}${dir}/${n}.json`));

async function cachedPaths(): Promise<Set<string>> {
  const cache = await caches.open(DATA_CACHE);
  return new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
}

export async function offlineStatus(): Promise<OfflineStatus> {
  if (!('caches' in window) || !('serviceWorker' in navigator) || !import.meta.env.PROD) return { supported: false, total: 0, cached: 0, bytes: 0, built: null };
  try {
    const ix = await index();
    const urls = urlsOf(ix);
    const have = await cachedPaths();
    return { supported: true, total: urls.length, cached: urls.filter((u) => have.has(new URL(u, location.href).pathname)).length, bytes: ix.bytes, built: ix.built };
  } catch {
    return { supported: true, total: 0, cached: 0, bytes: 0, built: null };
  }
}

/** Download every shard not yet cached. Resumable: rerunning skips what's already there. */
export async function downloadAll(onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<{ done: number; failed: number }> {
  // Ask the browser not to evict the data under storage pressure.
  await navigator.storage?.persist?.().catch(() => false);
  const ix = await index();
  const have = await cachedPaths();
  const todo = urlsOf(ix).filter((u) => !have.has(new URL(u, location.href).pathname));
  const total = urlsOf(ix).length;
  let done = total - todo.length;
  let failed = 0;
  const cache = await caches.open(DATA_CACHE);
  onProgress(done, total);
  let next = 0;
  const worker = async () => {
    while (next < todo.length && !signal.aborted) {
      const url = todo[next++];
      try {
        const res = await fetch(url, { headers: { 'X-Zijing-Offline': '1' }, signal });
        if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) await cache.put(url, res);
        else failed++;
      } catch {
        if (signal.aborted) break; // paused: this file wasn't saved, don't count it
        failed++;
      }
      done++;
      if (done % 50 === 0 || done === total) onProgress(done, total);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  onProgress(done, total);
  return { done, failed };
}

export async function clearOffline() {
  await caches.delete(DATA_CACHE);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: (await navigator.storage.persisted?.()) ?? false };
}

export const mb = (n: number) => `${(n / 1e6).toFixed(n > 1e8 ? 0 : 1)} MB`;
