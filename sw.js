/* Service worker: guarda os arquivos do app para ele abrir na hora, até sem internet.
   Estratégia "mostra o salvo, atualiza por trás": o app abre instantaneamente com a cópia
   guardada e, ao mesmo tempo, baixa a versão nova para a próxima abertura.
   ✏️ Quando mudar o código e publicar, recarregue o app 2 vezes para ver a mudança
   (ou troque o número em CACHE abaixo para forçar). */
const CACHE = 'estudoquest-v5';
const FILES = ['./', 'index.html', 'style.css', 'editor.js', 'ai.js', 'game.js', 'app.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

// Apaga caches de versões antigas para não ocupar espaço no celular.
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // YouTube etc. passam direto
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request)
      .then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; })
      .catch(() => cached || cache.match('index.html'));
    if (cached) { e.waitUntil(fresh); return cached; }
    return fresh;
  }));
});
