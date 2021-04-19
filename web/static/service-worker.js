self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheName).then(function(cache) {
      return cache.addAll(['/css/adminlte.css', '/css/style.css', '/js/adminlte.min.js', '/']);
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(cacheName) {})
          .map(function(cacheName) {
            return caches.delete(cacheName);
          })
      );
    })
  );
});
