// Cache names — bump APP_CACHE version when you want to force a full refresh
const APP_CACHE = 'hive-app-v2';
const STATIC_CACHE = 'hive-static-v2';

// ─── Install ────────────────────────────────────────────────────────────────
// Pre-cache the app shell HTML so the next launch is instant
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.add('/'))
  );
});

// ─── Activate ───────────────────────────────────────────────────────────────
// Remove any old cache versions so stale assets don't linger
self.addEventListener('activate', (event) => {
  const current = [APP_CACHE, STATIC_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !current.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
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

      return fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached); // offline fallback: return cached copy
    })
  );
});
