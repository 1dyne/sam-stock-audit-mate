// 서비스워커: 앱 화면을 기기에 저장해 인터넷이 끊겨도 셈이 열리게 한다. 서버 API는 캐시하지 않는다.
const VERSION = 'sem-v0.3.3';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-180.png',
  'fonts/jetbrains-mono-latin-500-normal.woff2', 'fonts/jetbrains-mono-latin-700-normal.woff2',
  'js/app.js', 'js/core.js', 'js/stone.js', 'js/db.js', 'js/model.js', 'js/scale.js', 'js/scalectl.js', 'js/tabular.js', 'js/photo-engine.js',
  'js/views/onboard.js', 'js/views/home.js', 'js/views/weigh.js', 'js/views/count.js', 'js/views/fill.js',
  'js/views/results.js', 'js/views/items.js', 'js/views/settings.js',
  'vendor/opentally/worker.js', 'vendor/opentally/detect.js', 'vendor/opentally/imageops.js',
  ...['sem', 'sem-blink', 'sam-off', 'sam-blink', 'sam-green', 'sam-yellow', 'sam-purple', 'sam-cyan', 'sam-red'].map((n) => `chars/${n}.webp`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/') || url.pathname.includes('/ws/')) return;
  // 네트워크 우선(새 버전 바로 반영), 안 되면 저장본
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
