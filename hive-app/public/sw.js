// Cache names: bump these when a deployed app shell must replace old clients.
const APP_CACHE = 'hive-app-v13-contained-hd-wishes';
const STATIC_CACHE = 'hive-static-v13-contained-hd-wishes';
const REFRESH_PARAM = 'hive_refresh';
const REFRESH_TOKEN = 'contained-hd-wishes-v13';

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
        if (response.ok) cache.put(request, response.clone());
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
