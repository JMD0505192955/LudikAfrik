/* ============================================================
   Service Worker Ludikafrik — cache busting & mise à jour auto.
   Version bumpée à chaque déploiement (voir CACHE_VERSION).
   ============================================================ */
const CACHE_VERSION = 'ludik-v1';   // ← changé à chaque déploiement

// activation immédiate de la nouvelle version (annexe B point 3)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // purge des anciens caches
    const cles = await caches.keys();
    await Promise.all(cles.filter(c => c !== CACHE_VERSION).map(c => caches.delete(c)));
    await self.clients.claim();
  })());
});

// Stratégie réseau :
//   - index.html et l'API : toujours réseau d'abord (jamais de version périmée)
//   - le reste (jeux, assets) : réseau d'abord, cache en secours (hors ligne léger)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  // ne jamais mettre en cache l'API ni le back-office
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return;

  event.respondWith((async () => {
    try {
      const reseau = await fetch(event.request);
      // mettre en cache une copie des ressources statiques
      if (reseau && reseau.status === 200 && (url.pathname.endsWith('.html') === false)) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(event.request, reseau.clone());
      }
      return reseau;
    } catch (e) {
      // hors ligne : servir depuis le cache si dispo
      const enCache = await caches.match(event.request);
      if (enCache) return enCache;
      throw e;
    }
  })());
});
