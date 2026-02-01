/* --- SMART SPEND: SERVICE WORKER ENGINE --- */

const CACHE_NAME = 'smart-spend-v1';

// GitHub Pages ke liye paths ko explicit rakhna better hota hai
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png'
];

// 1. INSTALL: Assets ko cache mein save karna
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Caching All Assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Naye SW ko turant activate karne ke liye
  self.skipWaiting();
});

// 2. ACTIVATE: Purane caches saaf karna
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Clearing Old Cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. FETCH: Network-First Strategy (Isse updates turant dikhenge)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Agar network mil raha hai, toh cache update karo aur response bhejo
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // Agar internet nahi hai, toh cache se uthao
        return caches.match(event.request);
      })
  );
});
