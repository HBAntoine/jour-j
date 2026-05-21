/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER — Mariage Sarah & Antoine
   Stratégie : Network-first pour index.html (toujours à jour)
               Cache-first pour les assets statiques (icônes, fonts)
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'jourj-v2';
const CACHE_STATIC = 'jourj-static-v2';

/* Assets mis en cache à l'installation */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/apple-touch-icon.png',
  /* Google Fonts — mis en cache au premier accès, pas en précache
     car l'URL varie selon le navigateur */
];

/* ── INSTALL — précache les assets essentiels ────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE — purge les anciens caches ─────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH — stratégie adaptée par ressource ─────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Firebase Realtime Database → toujours réseau, jamais cache */
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firebase.googleapis.com')) {
    return; /* laisse passer sans interception */
  }

  /* Google Fonts → cache-first (stable, rarement mis à jour) */
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  /* index.html → network-first (on veut toujours la dernière version) */
  if (url.pathname.endsWith('/') ||
      url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('Mariage_v2.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* Icônes et autres assets statiques → cache-first */
  if (url.pathname.includes('/icons/') ||
      request.destination === 'image') {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  /* Tout le reste → network-first avec fallback cache */
  event.respondWith(networkFirst(request));
});

/* ── Stratégie Network-First ─────────────────────────────── */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    /* Fallback ultime : index.html pour les navigations */
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Hors ligne — reconnecte-toi pour accéder à l\'app.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* ── Stratégie Cache-First ───────────────────────────────── */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}
