const CACHE_NAME = 'ihec-inout-v1.3.8';
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/style.css',
  '/script.js',
  '/dashboard.js',
  '/lang.js',
  '/admin_dashboard.html',
  '/admin_dashboard.css',
  '/admin_dashboard.js',
  '/version.json',
  '/assets/icon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/settings.html',
  '/settings.css',
  '/settings.js'
  
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});