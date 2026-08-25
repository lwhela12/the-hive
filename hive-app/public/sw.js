// Cache names carry the build they belong to, so every deploy retires the last
// one automatically.
//
// This used to be a hand-written version string ('v40-honest-404'), bumped only
// when somebody remembered a cache needed throwing away. That is the bug Nat
// spent 2026-08-25 hitting: this file's own bytes decide whether the browser
// installs a new worker, so a build that changed everything EXCEPT this file
// left the old worker in place, still holding the old app. Deleting the home
// screen shortcut did not help, and could not — a service worker and its caches
// belong to the site, not the icon. The only routes left were clearing website
// data or waiting for a bump nobody was going to make.
//
// `__HIVE_BUILD_ID__` is replaced with the commit SHA at build time by
// scripts/write-web-version.mjs, so this file is different on every deploy —
// which makes the browser install the new worker, which makes `activate` below
// throw away every older cache and reload whoever is looking. Opening the app
// is the update. Nobody has to clear anything, ever.
//
// The literal below is what a local dev build (no VERCEL_GIT_COMMIT_SHA) keeps.
const BUILD_ID = '__HIVE_BUILD_ID__';

const APP_CACHE = `hive-app-${BUILD_ID}`;
const STATIC_CACHE = `hive-static-${BUILD_ID}`;
const REFRESH_PARAM = 'hive_refresh';
const REFRESH_TOKEN = BUILD_ID;

// ─── Install ────────────────────────────────────────────────────────────────
// Pre-cache the app shell HTML so the next launch is instant
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.add(new Request('/', { cache: 'reload' })))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Activate ───────────────────────────────────────────────────────────────
// Remove any old cache versions so stale assets don't linger
self.addEventListener('activate', (event) => {
  const current = [APP_CACHE, STATIC_CACHE];
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const staleHiveCaches = keys.filter((key) => key.startsWith('hive-') && !current.includes(key));

    await Promise.all(keys.filter((key) => !current.includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();

    if (staleHiveCaches.length === 0) return;

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.map((client) => {
      if (!client.url || typeof client.navigate !== 'function') return undefined;

      const url = new URL(client.url);
      if (url.origin !== self.location.origin) return undefined;
      if (url.searchParams.get(REFRESH_PARAM) === REFRESH_TOKEN) return undefined;

      url.searchParams.set(REFRESH_PARAM, REFRESH_TOKEN);
      return client.navigate(url.href).catch(() => {
        client.postMessage({ type: 'HIVE_SW_UPDATED' });
      });
    }));
  })());
});

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only intercept GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch cross-origin requests (Supabase, CDNs, etc.)
  if (url.origin !== self.location.origin) return;

  // ── Static assets (content-hashed JS/CSS/fonts/images) ──────────────────
  // These URLs contain a hash so they never change — safe to cache forever.
  const isStaticAsset =
    url.pathname.startsWith('/_expo/static/') ||
    url.pathname.startsWith('/static/') ||
    /\.(woff2?|ttf|otf|eot)$/.test(url.pathname) ||
    /\.(png|jpe?g|gif|webp|svg|ico)$/.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;                        // instant on repeat visits
        const response = await fetch(request);

        // An ok status is not proof the right thing came back. A single-page
        // app rewrites unknown paths to index.html, so a file this build no
        // longer ships answers 200 with HTML — and caching that forever, under
        // a .js address, is how one bad morning becomes permanent. Store only
        // what is not a web page.
        const isHtml = (response.headers.get('content-type') || '').includes('text/html');
        if (response.ok && !isHtml) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // ── HTML / navigation: network-first ─────────────────────────────────────
  // Prefer the freshest app shell so returning to the app keeps route state
  // accurate. Fall back to cache only when offline.
  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(request);

      const freshRequest = new Request(request, { cache: 'reload' });
      return fetch(freshRequest)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached); // offline fallback: return cached copy
    })
  );
});
