/*
 * 서비스 워커 — 한 번 열면 인터넷 없이도 실행되게 앱 파일을 저장해 둔다.
 * 전략: 앱 파일은 「저장본 먼저 + 뒤에서 새로 받기」(stale-while-revalidate).
 * 배포할 때 VERSION 을 올리면 옛 저장본이 지워진다.
 */
const VERSION = 'snp-1.0.1';
const CORE = [
  './',
  'index.html',
  'css/style.css',
  'js/board-data.js',
  'js/util.js',
  'js/config.js',
  'js/sound.js',
  'js/jigsaw.js',
  'js/pieces.js',
  'js/fx.js',
  'js/game.js',
  'js/windows.js',
  'js/app.js',
  'assets/painting.webp',
  'assets/painting-thumb.webp',
  'assets/icon-192.png',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req)
          .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});
