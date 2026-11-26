// Celular: recolhe o menu do cabeçalho num botão "☰ Menu" e registra o app instalável (PWA).
// Também: barra de navegação embaixo no celular, seletor "Dashboard | Dados" com pílula deslizante e animação de entrada (todas as telas).
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

  function iniciar() {
    preparar();
    // Na hora, antes de pintar: o dashboard refaz o cabeçalho a cada mudança, e o menu largo não pode aparecer nem por um
    // instante (alargaria a página no celular e cancelaria a transição animada dos filtros).
    new MutationObserver(preparar).observe(document.body, { childList: true, subtree: true });
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

  var reduzido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var guardar = function (k, v) {
    try {
      sessionStorage.setItem(k, String(v));
    } catch (_) {}
  };
  var lerNum = function (k) {
    try {
      var v = sessionStorage.getItem(k);
      return v === null ? null : +v;
    } catch (_) {
      return null;
    }
  };
  // Marcador que corre: começa onde estava na tela anterior e desliza até o item atual.
  // Página carregada antecipadamente (prerender do Chrome) só desliza quando de fato aparece.
  function deslizar(alvo, chave, atual) {
    if (document.prerendering) {
      alvo.style.setProperty('--pos', String(atual));
      document.addEventListener(
        'prerenderingchange',
        function () {
          deslizar(alvo, chave, atual);
        },
        { once: true },
      );
      return;
    }
    var antes = lerNum(chave),
      de = lerNum(chave + 'De'),
      t = lerNum(chave + 'T'),
      inicio = antes;
    // Toque recente na tela anterior: o marcador já tinha começado a correr lá; continua daquele ponto, sem voltar.
    if (t !== null && de !== null && Date.now() - t < 420) inicio = de + (atual - de) * Math.max(0, (Date.now() - t) / 420);
    alvo.style.transition = 'none';
    alvo.style.setProperty('--pos', String(inicio === null || reduzido ? atual : inicio));
    void alvo.offsetWidth;
    alvo.style.transition = '';
    alvo.style.setProperty('--pos', String(atual));
    guardar(chave, atual);
    try {
      sessionStorage.removeItem(chave + 'T');
    } catch (_) {}
  }
  // Toque num item: o marcador começa a correr já nesta tela, e a próxima continua de onde ele estiver.
  function tocar(alvo, chave, de, para) {
    alvo.style.setProperty('--pos', String(para));
    guardar(chave, para);
    guardar(chave + 'De', de);
    guardar(chave + 'T', Date.now());
  }

  // ---------- Celular: barra de navegação embaixo, com o marcador que desliza até a área atual ----------
  var SVG = function (d) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  };
  var ICO = {
    inicio: SVG('<path d="M5 12H3l9-9 9 9h-2"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M10 21v-6h4v6"/>'),
    federal: SVG('<path d="M3 3v18h18"/><path d="M7 16v-5M11 16V7M15 16v-3M19 16V9"/>'),
    estadual: SVG('<path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/>'),
    municipal: SVG('<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>'),
    mais: SVG('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  };
  var SEM_BARRA = /^\/(entrar|publico|trocar-senha|offline)(\.html)?$/;
  var aqui = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  // Usuário: o último conhecido nesta aba (guardado por /js/sessao.js) desenha a barra na hora; sem ele, pergunta ao servidor.
  function usuario(cb) {
    if (window.PAINELAPS_USUARIO) return cb(window.PAINELAPS_USUARIO);
    try {
      var c = JSON.parse(sessionStorage.getItem('painelaps:usuario') || 'null');
      if (c && c.perfil) return cb(c);
    } catch (_) {}
    fetch('/api/v1/auth/eu', { credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        cb(j && j.usuario);
      })
      .catch(function () {
        cb(null);
      });
  }
  function montarBarra(u) {
    if (!u || document.querySelector('.barra-inferior')) return;
    // Os três acompanhamentos são os destinos principais para todos; o resto fica em "Mais".
    var itens = [
      ['/', 'Início', 'inicio', ['/']],
      ['/notas', 'Federal', 'federal', ['/notas', '/indicadores', '/federal', '/federal-notas']],
      ['/estadual', 'Estadual', 'estadual', ['/estadual']],
      ['/municipal', 'Municipal', 'municipal', ['/municipal']],
    ];
    var atual = -1;
    itens.forEach(function (it, i) {
      if (it[3].indexOf(aqui) >= 0) atual = i;
    });
    if (atual < 0) atual = itens.length; // outras telas ficam em "Mais"
    var nav = document.createElement('nav');
    nav.className = 'barra-inferior';
    nav.setAttribute('aria-label', 'Navegação principal');
    nav.style.setProperty('--n', String(itens.length + 1));
    nav.innerHTML =
      '<span class="bi-ind" aria-hidden="true"></span>' +
      itens
        .map(function (it, i) {
          return '<a class="bi-item" href="' + it[0] + '" data-i="' + i + '"' + (i === atual ? ' aria-current="page"' : '') + '>' + ICO[it[2]] + '<span>' + it[1] + '</span></a>';
        })
        .join('') +
      '<button type="button" class="bi-item" data-i="' + itens.length + '" aria-expanded="false" aria-controls="mais-painel"' +
      (atual === itens.length ? ' aria-current="page"' : '') +
      '>' +
      ICO.mais +
      '<span>Mais</span></button>';
    document.body.appendChild(nav);
    raiz.classList.add('com-barra-inferior');
    var ind = nav.querySelector('.bi-ind');
    deslizar(ind, 'painelaps.barraPos', atual);
    if (u.perfil === 'admin') pontoInicio(nav.querySelector('.bi-item[data-i="0"]'));
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('.bi-item');
      if (!b) return;
      var i = +b.dataset.i;
      if (b.tagName === 'BUTTON') {
        ind.style.setProperty('--pos', String(i));
        abrirMais(u, function () {
          ind.style.setProperty('--pos', String(atual));
        });
      } else tocar(ind, 'painelaps.barraPos', atual, i);
    });
  }
  // Início ganha um ponto quando há algo a ver lá (administrador: pontos de atenção nas coletas). Consulta guardada por 10 min.
  function pontoInicio(item) {
    if (!item || !(window.matchMedia && window.matchMedia('(max-width: 899px)').matches)) return;
    var marcar = function (n) {
      if (!n) return;
      var p = document.createElement('span');
      p.className = 'bi-ponto';
      p.setAttribute('aria-hidden', 'true');
      var t = document.createElement('span');
      t.className = 'bi-oculto';
      t.textContent = ' (' + n + (n > 1 ? ' pontos precisam' : ' ponto precisa') + ' de atenção)';
      item.append(p, t);
      item.title = n + (n > 1 ? ' pontos nas coletas precisam' : ' ponto nas coletas precisa') + ' de atenção';
    };
    try {
      var c = JSON.parse(sessionStorage.getItem('painelaps.problemas') || 'null');
      if (c && Date.now() - c.t < 600000) return marcar(c.n);
    } catch (_) {}
    fetch('/api/v1/monitoramento', { credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!d) return;
        guardar('painelaps.problemas', JSON.stringify({ n: d.problemas || 0, t: Date.now() }));
        marcar(d.problemas || 0);
      })
      .catch(function () {});
  }
  // "Mais": as demais áreas, os lançamentos e o tema, numa folha que sobe de baixo.
  function abrirMais(u, aoFechar) {
    var gestor = u.perfil === 'admin' || u.perfil === 'gestor';
    var grupo = function (t, ls) {
      return (
        '<p class="mais-grupo">' +
        t +
        '</p>' +
        ls
          .map(function (l) {
            return '<a href="' + l[0] + '"' + (l[0] === aqui ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
          })
          .join('')
      );
    };
    var fundo = document.createElement('div');
    fundo.className = 'mais-fundo';
    fundo.innerHTML =
      '<div class="mais-painel" id="mais-painel" role="dialog" aria-modal="true" aria-label="Mais áreas do Painel">' +
      '<button type="button" class="mais-fechar" aria-label="Fechar">✕</button>' +
      grupo(
        'Outras áreas',
        (gestor ? [['/filas', 'Filas e faltas'], ['/pendencias', 'Pendências']] : []).concat([
          ['/producao', 'Produção e notas'],
          ['/composicao', 'Composição de Usuários'],
          ['/coleta', 'Como coletamos'],
        ]),
      ) +
      (gestor ? grupo('Lançamentos', [['/lancamentos', 'Metas do PAS'], ['/lancamentos-vacinas', 'Coberturas vacinais'], ['/estadual#t-form', 'Cofinanciamento estadual']]) : '') +
      '<p class="mais-grupo">Tema</p><div class="mais-tema">' +
      [['Tema claro', 'Claro'], ['Tema personalizado (cores de Cajamar)', 'Cajamar'], ['Tema escuro', 'Escuro']]
        .map(function (t) {
          return '<button type="button" data-rotulo="' + t[0] + '">' + t[1] + '</button>';
        })
        .join('') +
      '</div></div>';
    // Marca o tema em uso a partir do seletor original da página.
    var marcarTema = function () {
      fundo.querySelectorAll('.mais-tema button').forEach(function (t) {
        var o = document.querySelector('[aria-label="' + t.dataset.rotulo + '"]:not(.mais-tema button)');
        t.setAttribute('aria-pressed', o && o.getAttribute('aria-pressed') === 'true' ? 'true' : 'false');
      });
    };
    var fechar = function () {
      fundo.classList.remove('aberto');
      document.removeEventListener('keydown', esc);
      setTimeout(function () {
        fundo.remove();
      }, reduzido ? 0 : 220);
      var b = document.querySelector('.barra-inferior button.bi-item');
      if (b) {
        b.setAttribute('aria-expanded', 'false');
        b.focus();
      }
      aoFechar();
    };
    var esc = function (e) {
      if (e.key === 'Escape') fechar();
    };
    fundo.addEventListener('click', function (e) {
      if (e.target === fundo || e.target.closest('.mais-fechar')) return fechar();
      var t = e.target.closest('.mais-tema button');
      // Tema: aciona o seletor da própria página (padrão ou dashboard), que continua no cabeçalho, escondido no celular.
      if (t) {
        var orig = document.querySelector('[aria-label="' + t.dataset.rotulo + '"]:not(.mais-tema button)');
        if (orig) orig.click();
        setTimeout(marcarTema, 30);
        return;
      }
      if (e.target.closest('a')) fundo.classList.remove('aberto');
    });
    document.addEventListener('keydown', esc);
    document.body.appendChild(fundo);
    marcarTema();
    var b = document.querySelector('.barra-inferior button.bi-item');
    if (b) b.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () {
      fundo.classList.add('aberto');
      var primeiro = fundo.querySelector('a, button');
      if (primeiro) primeiro.focus();
    });
  }
  if (!SEM_BARRA.test(aqui))
    usuario(function (u) {
      if (document.body) montarBarra(u);
      else
        document.addEventListener('DOMContentLoaded', function () {
          montarBarra(u);
        });
    });

  // ---------- Barra "Dashboard | Dados": no celular vira um seletor de dois botões com a pílula que desliza ----------
  function prepararSeg() {
    document.querySelectorAll('nav.sub-aps, nav#sub-painel').forEach(function (nav) {
      var caixa = nav.firstElementChild;
      if (!caixa || caixa.querySelector(':scope > .seg-ind')) return;
      var links = caixa.querySelectorAll(':scope > a');
      var atual = 0;
      links.forEach(function (a, i) {
        if (a.getAttribute('aria-current') === 'page') atual = i;
        a.addEventListener('click', function () {
          tocar(ind, 'painelaps.segPos', atual, i);
        });
      });
      nav.classList.add('seg');
      caixa.style.setProperty('--n', String(links.length));
      var ind = document.createElement('span');
      ind.className = 'seg-ind';
      ind.setAttribute('aria-hidden', 'true');
      caixa.insertBefore(ind, caixa.firstChild);
      // O dashboard redesenha o cabeçalho a cada mudança: só a primeira montagem desliza.
      if (window.__segFeito) ind.style.setProperty('--pos', String(atual));
      else deslizar(ind, 'painelaps.segPos', atual);
      window.__segFeito = true;
    });
  }

  var movel = function () {
    return !!(window.matchMedia && window.matchMedia('(max-width: 899px)').matches);
  };

  // ---------- Celular: textos de apoio longos ficam em poucas linhas, com "Ler mais" ----------
  var abertosTxt = {};
  function prepararRecolhe() {
    if (!movel()) return;
    document.querySelectorAll('.m-recolhe, p.intro, .bloco > p.d').forEach(function (el) {
      if (el.dataset.recolhe) return;
      el.dataset.recolhe = '1';
      var chave = el.textContent.trim().slice(0, 80);
      el.classList.add('recolhe');
      if (el.scrollHeight <= el.clientHeight + 2) return el.classList.remove('recolhe');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ler-mais';
      var pintar = function () {
        var aberto = !!abertosTxt[chave];
        el.classList.toggle('recolhe', !aberto);
        b.textContent = aberto ? 'Ler menos' : 'Ler mais';
        b.setAttribute('aria-expanded', String(aberto));
      };
      b.addEventListener('click', function () {
        abertosTxt[chave] = !abertosTxt[chave];
        pintar();
      });
      pintar();
      el.insertAdjacentElement('afterend', b);
    });
  }

  // ---------- Celular (até 599 px): tabela larga que rolaria para o lado vira cartões ----------
  // Cada linha vira um cartão: a primeira coluna como título e as demais como "rótulo: valor" (o rótulo vem do cabeçalho).
  // Linhas de grupo (uma célula só) viram títulos. Grade de meses (cabeçalhos de mês/ano) não vira cartão: a primeira
  // coluna fica fixa e só os meses rolam. Vale para todas as páginas; o dashboard tem os próprios cartões.
  var MES_CAB = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)|\d{4}|^\d[ºo]\/|quadri/i;
  function cabecalho(t) {
    return [].slice.call(t.tHead.rows[t.tHead.rows.length - 1].cells).map(function (c) {
      return c.textContent.replace(/\s+/g, ' ').trim();
    });
  }
  function prepararTabelas() {
    if (!(window.matchMedia && window.matchMedia('(max-width: 599px)').matches)) return;
    document.querySelectorAll('body table').forEach(function (t) {
      if (t.closest('header, footer, .m-tabela, [role=dialog], .mais-fundo') || !t.tHead || !t.tHead.rows.length || !t.tBodies.length) return;
      if (!t.getClientRects().length) return; // em aba escondida: confere quando aparecer
      var cab = cabecalho(t);
      if (!t.classList.contains('tc') && !t.classList.contains('tm')) {
        if (cab.length < 3 || t.scrollWidth <= (t.parentElement || t).clientWidth + 4) return;
        t.classList.add(
          cab.slice(1).filter(function (c) {
            return MES_CAB.test(c);
          }).length >= 2
            ? 'tm'
            : 'tc',
        );
      }
      if (!t.classList.contains('tc')) return;
      // Linhas novas (a página pode refazer o conteúdo da mesma tabela) ganham os rótulos.
      [].forEach.call(t.tBodies, function (tb) {
        [].forEach.call(tb.rows, function (tr) {
          if (tr.hasAttribute('data-tc')) return;
          tr.setAttribute('data-tc', '');
          if (tr.cells.length === 1) return tr.classList.add('tc-grupo');
          var col = 0;
          [].forEach.call(tr.cells, function (td) {
            if (col > 0 && cab[col] && !td.hasAttribute('data-rotulo')) td.setAttribute('data-rotulo', cab[col]);
            col += td.colSpan || 1;
          });
        });
      });
    });
  }
  // Abas que só mudam a visibilidade (sem refazer a página) e mudança de tamanho também conferem as tabelas.
  document.addEventListener('click', function () {
    setTimeout(prepararTabelas, 60);
  });
  window.addEventListener('resize', function () {
    setTimeout(prepararTabelas, 120);
  });

  function prepararTudo() {
    prepararSeg();
    prepararRecolhe();
    prepararTabelas();
  }
  // Na hora (antes de pintar): o dashboard refaz a tela inteira a cada mudança.
  new MutationObserver(prepararTudo).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') prepararTudo();
  else document.addEventListener('DOMContentLoaded', prepararTudo);

  // ---------- Entrada: na primeira montagem da tela, os blocos sobem e aparecem em cascata e as barras crescem do zero ----------
  // Só no que chega depois de a página abrir (dados carregados), só na primeira vez (filtros e abas não repetem a cascata)
  // e nunca para quem pede menos movimento no sistema.
  if (!reduzido) {
    var FORA = 'header, nav, footer, details > div, [role="dialog"], .carr-tela, button, input, textarea, label, select, option, svg, #barra-painel, #sub-painel, .mais-fundo, .m-filtros';
    var inicio = Date.now(),
      fecha = 0;
    var transparente = function (c) {
      return !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
    };
    // Faixas de fundo (várias partes lado a lado, como Regular/Suficiente/Bom/Ótimo) são escala, não valor: não crescem.
    var banda = function (el) {
      var p = el.parentElement,
        n = 0;
      for (var c = p && p.firstElementChild; c; c = c.nextElementSibling) if (/width:\s*[\d.]+%/.test(c.getAttribute('style') || '')) n++;
      return n > 1;
    };
    var procurar = function (no, blocos, barras, marcas) {
      var fila = [[no, false]],
        vistos = 0;
      while (fila.length && vistos < 2500) {
        var par = fila.shift(),
          el = par[0],
          dentro = par[1];
        vistos++;
        if (el.nodeType !== 1 || el.matches(FORA)) continue;
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'sticky' || cs.animationName !== 'none') continue;
        var r = el.getBoundingClientRect();
        if (r.top > window.innerHeight * 1.3) continue;
        var estilo = el.getAttribute('style') || '';
        if (cs.position === 'absolute') {
          // Marcador do resultado sobre a régua (posição em %): corre do início até o valor.
          var m = /(^|;)\s*left:\s*([\d.]+)%/.exec(estilo);
          if (m && +m[2] > 0 && r.width >= 8 && r.width <= 26 && r.height >= 8 && r.height <= 26) marcas.push(el);
          continue;
        }
        var fundo = !transparente(cs.backgroundColor);
        if (!dentro && (parseFloat(cs.borderTopLeftRadius) || 0) >= 6 && (fundo || parseFloat(cs.borderTopWidth) > 0) && r.height >= 36 && r.width >= 100) {
          blocos.push(el);
          dentro = true;
        } else if (fundo && r.height >= 3 && r.height <= 16 && r.width > 0 && cs.transform === 'none' && /(^|;)\s*width:\s*[\d.]+%/.test(estilo) && !banda(el)) {
          barras.push(el);
          continue;
        }
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) fila.push([c, dentro]);
      }
    };
    // Telas que se redesenham inteiras (dashboard) recriam os mesmos blocos no mesmo lugar: esses não animam de novo.
    var jaVistos = {};
    var lugar = function (el, tipo) {
      var r = el.getBoundingClientRect();
      return tipo + Math.round((r.top + window.scrollY) / 8) + ',' + Math.round(r.left / 8) + ',' + Math.round(r.width / 8);
    };
    var novo = function (el, tipo) {
      var k = lugar(el, tipo);
      if (jaVistos[k]) return false;
      jaVistos[k] = 1;
      return true;
    };
    var animar = function (el, classe, atraso) {
      el.style.setProperty('--atraso', atraso + 'ms');
      el.classList.add(classe);
      var fim = function (e) {
        if (e.target !== el) return;
        el.classList.remove(classe);
        el.style.removeProperty('--atraso');
        el.removeEventListener('animationend', fim);
        el.removeEventListener('animationcancel', fim);
      };
      el.addEventListener('animationend', fim);
      el.addEventListener('animationcancel', fim);
    };
    var obsEntrada = new MutationObserver(function (regs) {
      if (Date.now() - inicio > 15000 || (fecha && Date.now() > fecha)) return obsEntrada.disconnect();
      var blocos = [],
        barras = [],
        marcas = [];
      regs.forEach(function (rg) {
        rg.addedNodes.forEach(function (n) {
          if (n.nodeType === 1 && !(n.closest && n.closest(FORA))) procurar(n, blocos, barras, marcas);
        });
      });
      blocos = blocos.filter(function (el) {
        return novo(el, 'b');
      });
      barras = barras.filter(function (el) {
        return novo(el, 'r');
      });
      marcas = marcas.filter(function (el) {
        return novo(el, 'm');
      });
      // Cascata na ordem de leitura: de cima para baixo, da esquerda para a direita.
      var ordem = function (x, y) {
        var a = x.getBoundingClientRect(),
          c = y.getBoundingClientRect();
        return Math.abs(a.top - c.top) > 8 ? a.top - c.top : a.left - c.left;
      };
      blocos.sort(ordem);
      blocos.forEach(function (el, i) {
        animar(el, 'entra', Math.min(i, 10) * 45);
      });
      barras.forEach(function (el, i) {
        animar(el, 'cresce', 140 + Math.min(i, 24) * 18);
      });
      marcas.forEach(function (el, i) {
        animar(el, 'corre', 160 + Math.min(i, 24) * 30);
      });
      if (blocos.length && !fecha) fecha = Date.now() + 1800;
    });
    var ligar = function () {
      obsEntrada.observe(document.body, { childList: true, subtree: true });
    };
    // O que muda por ação da pessoa (filtros, abas, abrir uma nota) não repete a entrada.
    var parar = function () {
      obsEntrada.disconnect();
      document.removeEventListener('pointerdown', parar, true);
      document.removeEventListener('keydown', parar, true);
    };
    document.addEventListener('pointerdown', parar, true);
    document.addEventListener('keydown', parar, true);
    if (document.body) ligar();
    else document.addEventListener('DOMContentLoaded', ligar);
  }

  // App instalável: o service worker só guarda arquivos visuais e a página "sem conexão"; dados nunca ficam no aparelho.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
