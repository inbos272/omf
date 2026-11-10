// Network-first service worker: online players always get the latest upload,
// and after one visit the game still runs with no network.
const CACHE = 'skytower-v4';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/game.css',
  'js/data.js', 'js/i18n.js', 'js/sim.js', 'js/bot.js', 'js/gfx.js', 'js/scene.js', 'js/music.js', 'js/audio.js',
  'js/save.js', 'js/input.js', 'js/ui.js', 'js/main.js',
  'icons/icon-96.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-192.png', 'icons/maskable-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === self.location.origin) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then((hit) => {
          if (hit) return hit;
          // Offline navigation to any in-scope URL still opens the game.
          if (e.request.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        })
      )
  );
});
