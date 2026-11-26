/* Service worker Nexus Crédit : appli installable, ouverture hors connexion, notifications push.
   Changer VERSION à chaque mise en ligne d'un nouvel index.html. */
const VERSION = 'nexus-v19-1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const PRECACHE = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Une ressource indisponible ne doit pas empêcher l'installation.
    await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

const isApi = (url) => /\.supabase\.co$/.test(url.hostname) || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isApi(url)) return; // données : toujours en direct, jamais en cache (sécurité)

    // Connexion lente : si le réseau ne répond pas en 1,2 s, la copie enregistrée s'affiche (la nouvelle est mise en cache pour la prochaine fois).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = (await caches.match('./index.html')) || (await caches.match('./'));
      const network = fetch(req).then(async (res) => {
        if (res && res.ok) (await caches.open(SHELL)).put('./index.html', res.clone());
        return res;
      });
      if (!cached) return network.catch(() => Response.error());
      event.waitUntil(network.catch(() => null));
      return Promise.race([network.catch(() => cached), new Promise((ok) => setTimeout(() => ok(cached), 1200))]);
    })());
    return;
  }

  // Bibliothèques, polices, icônes : cache d'abord, mise à jour en arrière-plan.
  const cacheable = url.origin === self.location.origin || /cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  if (!cacheable) return;
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res && (res.ok || res.type === 'opaque')) (await caches.open(RUNTIME)).put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

/* ---------- Notifications push ---------- */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: 'Nexus Crédit', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Nexus Crédit', {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || './index.html' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || './index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.split('#')[0] === target.split('#')[0]) { await w.focus(); return w.navigate ? w.navigate(target) : null; }
    }
    return self.clients.openWindow(target);
  })());
});
