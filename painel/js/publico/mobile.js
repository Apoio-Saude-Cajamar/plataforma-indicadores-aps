// Celular: recolhe o menu do cabeçalho num botão "☰ Menu" e registra o app instalável (PWA).
// Vale para todas as páginas (inclusive as desenhadas com o motor dc-mini, que redesenham o cabeçalho a cada mudança):
// um observador recoloca o botão sempre que o cabeçalho é refeito. O estado aberto/fechado fica no <html>.
(function () {
  var raiz = document.documentElement;
  var SELETOR_MENU = 'nav[aria-label="Áreas do Painel"]';

  function alternar() {
    var aberto = !raiz.classList.contains('menu-movel-aberto');
    raiz.classList.toggle('menu-movel-aberto', aberto);
    document.querySelectorAll('.menu-movel-botao').forEach(function (b) {
      b.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      b.innerHTML = aberto ? '<span aria-hidden="true">✕</span> Fechar' : '<span aria-hidden="true">☰</span> Menu';
    });
  }

  function preparar() {
    document.querySelectorAll(SELETOR_MENU).forEach(function (nav, i) {
      var linha = nav.parentElement;
      if (!linha) return;
      linha.classList.add('cab-movel');
      if (!nav.id) nav.id = 'menu-areas-' + i;
      if (linha.querySelector(':scope > .menu-movel-botao')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-movel-botao';
      b.setAttribute('aria-controls', nav.id);
      var aberto = raiz.classList.contains('menu-movel-aberto');
      b.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      b.innerHTML = aberto ? '<span aria-hidden="true">✕</span> Fechar' : '<span aria-hidden="true">☰</span> Menu';
      b.addEventListener('click', alternar);
      linha.insertBefore(b, nav);
    });
  }

  var pendente = false;
  function agendar() {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(function () {
      pendente = false;
      preparar();
    });
  }

  function iniciar() {
    preparar();
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
    // Fecha o menu ao tocar num link dele ou ao voltar para a tela larga.
    document.addEventListener('click', function (e) {
      if (raiz.classList.contains('menu-movel-aberto') && e.target.closest && e.target.closest(SELETOR_MENU + ' a')) alternar();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 900 && raiz.classList.contains('menu-movel-aberto')) alternar();
    });
  }
  if (document.body) iniciar();
  else document.addEventListener('DOMContentLoaded', iniciar);

  // App instalável: o service worker só guarda arquivos visuais e a página "sem conexão"; dados nunca ficam no aparelho.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
