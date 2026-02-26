// ⚠️  IMPORTANTE: incremente CACHE_NAME a cada deploy (ex: v2 → v3).
//    Isso garante que todos os usuários descartem o cache antigo e
//    recebam os arquivos atualizados na próxima visita.
const CACHE_NAME = 'moncardph10-v2';

const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './manifest.json',
  './icons/MonCardPH10-192x192.svg',
  './icons/MonCardPH10-512x512.svg'
];

// Install event: cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event:
//   - index.html → sempre da rede (nunca do cache), para garantir que
//     o ponto de entrada seja sempre a versão mais recente.
//   - demais assets → network-first com fallback para cache (funciona offline).
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isHtmlEntry = url.pathname.endsWith('/') ||
                      url.pathname.endsWith('/index.html');

  if (isHtmlEntry) {
    // Network-only para o HTML: se offline, mostra mensagem de erro do browser.
    // Isso evita que uma versão antiga do HTML (e portanto do JS) seja servida.
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first para todos os outros assets
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Listen for messages to skip waiting
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});