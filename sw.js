/* 서비스 워커: 한 번 열면 인터넷 없이도 실행 (앱 셸 미리 저장 + 같은 출처 요청은 「네트워크 우선, 실패 시 저장본」). */
const VERSION = 'sn-v1.1.0';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'assets/painting-data.js',
  'js/util.js', 'js/pieces.js', 'js/audio.js', 'js/fx.js', 'js/engine.js', 'js/ui.js', 'js/main.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  // 문서(docs/*.html, 약 1.8MB)는 첫 방문 부담을 줄이려 미리 받지 않고, 한 번 열면 아래 fetch 처리에서 저장된다
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // 새 판이 올라오면 바로 받도록 네트워크 우선, 오프라인이면 저장본
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
