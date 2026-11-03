/*
 * Service worker: «Мастерская героя» как приложение — открывается и без интернета.
 * Версия — из адреса регистрации (sw.js?v=N, как у остальных файлов в index.html): новая версия сайта — новый кэш,
 * старые удаляются. Страница — сначала из сети (всегда свежая), без сети — из кэша; скрипты, стили, данные и
 * картинки сайта — из кэша сразу, а в фоне обновляются. Чужие адреса (Firebase, Google, шрифты) не трогаем:
 * онлайн-игре нужен интернет.
 */
const VERSION = new URL(self.location).searchParams.get('v') || '0';
const CACHE = 'mh-' + VERSION;
const SHELL = ['./', 'manifest.webmanifest', 'img/app/icon-192.png', 'img/app/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('mh-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // страница: сеть, без сети — сохранённая (адрес с хэшем и параметрами — та же страница)
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }
      return r;
    }).catch(() => caches.match('./')));
    return;
  }
  // файлы сайта: сразу из кэша, в фоне — свежие
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});
