// The offline copy. Every file the app can ask for is kept on this device after the first visit, so a document opens and saves
// with the network off. Opening the page asks the site for the page alone, so a reload always brings the latest version; the
// documents never travel, and no answer in time means the copy. Generated into dist/sw.js by the build (see vite.config.ts).
const KEY = 'md-__VERSION__';
const USE = 'use-__USE__';
const ONUSE = /^fonts\/(?:literata|newsreader)/;
const FILES = __FILES__;
const scope = self.registration.scope;
const at = (path) => new URL(path, scope).href;
const rootPath = new URL(scope).pathname;

// A new version takes over at once, however many windows are open; the last version's copy stays (below), so an open tab never loses a chunk.
// Files named by their content (assets/…-hash.js) are copied from an older copy instead of downloaded again.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(KEY);
      await Promise.all(
        FILES.map(async (path) => {
          const url = at(path);
          const old = /-[\w-]{8}\.\w+$/.test(path) && (await caches.match(url));
          const res = old || (await fetch(url, { cache: 'reload' }));
          if (!res.ok) throw new Error(`${path}: ${res.status}`);
          // A redirected response (Cloudflare sends /trust/index.html to /trust/) cannot answer a page load; the browser fails it.
          await cache.put(url, res.redirected ? new Response(res.body, res) : res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const old = keys.filter((key) => key.startsWith('md-') && key !== KEY);
      for (const key of old.slice(0, -1)) await caches.delete(key);
      for (const key of keys) if (key.startsWith('use-') && key !== USE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  // A file the app has is answered from the copy, and so is a folder address (/trust/) from the folder's index.html. A page load tries
  // the site first; offline, or with no answer in time, the copy or the app itself answers.
  const page = request.mode === 'navigate';
  // the serif faces: kept the first time they are used
  if (ONUSE.test(url.pathname.slice(rootPath.length)))
    return event.respondWith(
      (async () => {
        const cache = await caches.open(USE);
        const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok && !res.redirected) await cache.put(request, res.clone());
        return res;
      })(),
    );
  event.respondWith(
    (async () => {
      if (page) {
        try {
          const res = await fetch(request, { signal: AbortSignal.timeout(1500) });
          if (res.ok || res.type === 'opaqueredirect') return res;
        } catch {}
      }
      const hit =
        (await caches.match(request, { ignoreSearch: true, ignoreVary: true })) ||
        (url.pathname.endsWith('/') && (await caches.match(at(url.pathname.slice(rootPath.length) + 'index.html')))) ||
        (page && url.pathname === rootPath && (await caches.match(at('index.html'))));
      if (hit) return hit;
      return page ? Response.error() : fetch(request);
    })(),
  );
});
