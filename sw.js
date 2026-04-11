const CACHE_NAME = 'ihec-inout-v1.1.12';
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
  '/assets/icon.png'
  
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});