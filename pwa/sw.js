/* 字境 service worker. Built into dist/sw.js by the `pwa` plugin in vite.config.ts, which fills in
 * the shell version and precache list below. Not used in `vite dev`. */
const SHELL_VERSION = '__SHELL_VERSION__';
const PRECACHE = __PRECACHE__; // app shell paths relative to the scope

const SHELL = `zijing-shell-${SHELL_VERSION}`;
// Shard format version. Bump (here and in src/lib/offline.ts) only when the JSON shape changes;
// content updates are picked up by background revalidation, so offline downloads survive redeploys.
const DATA = 'zijing-data-v1';
const EXT = 'zijing-ext-v1'; // Google Fonts + Wikimedia Commons images
const KEEP = [SHELL, DATA, EXT];

const scope = new URL(self.registration.scope);
const inScope = (p) => new URL(p, scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map(inScope))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('zijing-') && !KEEP.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// The page asks the waiting worker to take over when the user taps "Reload" on the update banner.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const EXT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'upload.wikimedia.org'];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === scope.origin) {
    if (!url.pathname.startsWith(scope.pathname)) return;
    if (req.mode === 'navigate') return event.respondWith(navigation(req));
    if (url.pathname.startsWith(scope.pathname + 'data/')) {
      // Bulk offline downloads write to the cache themselves.
      if (req.headers.get('X-Zijing-Offline')) return;
      return event.respondWith(staleWhileRevalidate(event, req, DATA));
    }
    return event.respondWith(cacheFirst(req, SHELL));
  }
  if (EXT_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(req, EXT));
});

/** Online: fresh index.html. Offline: the cached one, so /char/馬 deep links still boot. */
async function navigation(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(SHELL)).put(inScope('index.html'), res.clone());
    return res;
  } catch {
    return (await caches.match(inScope('index.html'), MATCH)) ?? Response.error();
  }
}

// Hosts may send `Vary: Origin` or similar; shell files and shards are the same for every requester.
const MATCH = { ignoreVary: true };

async function cacheFirst(req, name) {
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  // Network errors propagate. Google answers a missing glyph that way, and the calligraphy check relies on it.
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
}

/** Cached shard immediately; refresh it in the background when online. */
async function staleWhileRevalidate(event, req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, MATCH);
  const refresh = fetch(req)
    .then((res) => {
      // A missing shard falls through to the SPA's index.html: never cache that as data.
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) ?? new Response('null', { status: 504, headers: { 'content-type': 'text/plain' } });
}
