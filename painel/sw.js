// Service worker do Painel APS (app instalável).
// Guarda só arquivos visuais (CSS, scripts, imagens) e a página "sem conexão".
// Páginas e dados (/api/) sempre vêm da rede e nunca ficam no aparelho.
const VERSAO = 'painelaps-v2';
const BASICOS = ['/offline.html', '/css/tema.css', '/css/painelaps.css', '/css/mobile.css', '/css/carregando.css', '/img/painelaps.svg', '/img/icone-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSAO)
      .then((c) => c.addAll(BASICOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Páginas: sempre da rede; sem conexão, mostra o aviso.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  // Arquivos visuais: usa o guardado e atualiza em segundo plano.
  if (/^\/(css|img|js)\//.test(url.pathname)) {
    e.respondWith(
      caches.open(VERSAO).then((c) =>
        c.match(req).then((guardado) => {
          const rede = fetch(req)
            .then((r) => {
              if (r.ok && r.type === 'basic') c.put(req, r.clone());
              return r;
            })
            .catch(() => guardado);
          return guardado || rede;
        }),
      ),
    );
  }
});
