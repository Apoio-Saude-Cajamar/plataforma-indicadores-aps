// Composição das equipes: árvore expansível município → unidade → equipe → categoria → profissional.
(function () {
  const $ = (id) => document.getElementById(id);
  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const TIPOS = { ESF: 'eSF', EAP: 'eAP', ESB: 'eSB', EMULTI: 'eMulti', ECR: 'eCR', EACS: 'eACS', EMAD: 'EMAD' };
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  const horas = (h) => (typeof h === 'number' ? String(Math.round(h * 10) / 10).replace('.', ',') + ' h de agenda' : '');

  // Exemplo usado enquanto a extensão ainda não enviou a composição.
  const EXEMPLO = {
    competencia: '2026-10',
    exemplo: true,
    alertas: ['1 profissional(is) aparecem em mais de uma equipe (pode ser homônimo ou lotação dupla).'],
    unidades: [
      {
        nome: 'UBS Exemplo Central',
        alertas: ['Sem equipe: 2 agente comunitário de saúde.'],
        semEquipe: [
          { nome: 'Profissional 9', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' },
          { nome: 'Profissional 10', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' },
          { nome: 'Profissional 11', cbo: 'ASSISTENTE ADMINISTRATIVO' },
        ],
        equipes: [
          {
            nome: 'EQUIPE A',
            ine: '0000000001',
            tipo: 'ESF',
            vinculadas: [],
            alertas: [],
            profissionais: [
              { nome: 'Profissional 1', cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' },
              { nome: 'Profissional 2', cbo: 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' },
              { nome: 'Profissional 3', cbo: 'TÉCNICO DE ENFERMAGEM' },
              { nome: 'Profissional 4', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' },
              { nome: 'Profissional 5', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' },
            ],
          },
          {
            nome: 'EQUIPE B',
            ine: '0000000002',
            tipo: 'ESF',
            vinculadas: [],
            alertas: ['Sem médico lotado.'],
            profissionais: [
              { nome: 'Profissional 6', cbo: 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' },
              { nome: 'Profissional 7', cbo: 'TÉCNICO DE ENFERMAGEM' },
              { nome: 'Profissional 8', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' },
            ],
          },
          {
            nome: 'ESB EQUIPE A',
            ine: '0000000003',
            tipo: 'ESB',
            horas: 20,
            vinculadas: ['EQUIPE A'],
            alertas: [],
            profissionais: [
              { nome: 'Profissional 12', cbo: 'CIRURGIÃO DENTISTA - CLÍNICO GERAL' },
              { nome: 'Profissional 13', cbo: 'AUXILIAR EM SAÚDE BUCAL' },
            ],
          },
        ],
      },
      {
        nome: 'UBS Exemplo Norte',
        alertas: [],
        semEquipe: [],
        equipes: [
          {
            nome: 'EQUIPE C',
            ine: '0000000004',
            tipo: 'ESF',
            vinculadas: [],
            alertas: [],
            profissionais: [
              { nome: 'Profissional 14', cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' },
              { nome: 'Profissional 15', cbo: 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' },
              { nome: 'Profissional 16', cbo: 'AUXILIAR DE ENFERMAGEM' },
              { nome: 'Profissional 17', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' },
            ],
          },
          {
            nome: 'COMPLEMENTAR X',
            ine: '0000000005',
            tipo: 'EMULTI',
            vinculadas: ['EQUIPE C', 'EQUIPE A'],
            alertas: ['Só 2 equipe(s) vinculada(s).'],
            profissionais: [
              { nome: 'Profissional 18', cbo: 'PSICÓLOGO CLÍNICO' },
              { nome: 'Profissional 19', cbo: 'FISIOTERAPEUTA GERAL' },
            ],
          },
        ],
      },
    ],
  };

  // ---- modelo: transforma a composição em nós { rotulo, sub, chip, alertas[], filhos[], nivel } ----
  function categorias(profs) {
    const m = new Map();
    for (const p of profs || []) (m.get(p.cbo) || m.set(p.cbo, []).get(p.cbo)).push(p);
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt'))
      .map(([cbo, lista]) => ({
        nivel: 3,
        rotulo: cbo ? cbo.charAt(0) + cbo.slice(1).toLowerCase() : 'Sem categoria',
        sub: plural(lista.length, 'profissional', 'profissionais'),
        alertas: [],
        filhos: lista
          .filter((p) => p.nome)
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
          .map((p) => ({ nivel: 4, rotulo: p.nome, sub: p.equipe ? 'Equipe: ' + p.equipe : '', alertas: [], filhos: [] })),
      }));
  }
  function modelo(c) {
    const unidades = (c.unidades || []).map((u) => {
      const filhos = (u.equipes || []).map((e) => ({
        nivel: 2,
        chip: TIPOS[e.tipo] || e.tipo,
        rotulo: e.nome,
        sub: [
          e.ine ? 'INE ' + e.ine : '',
          horas(e.horas),
          (e.vinculadas || []).length ? 'Vinculada a: ' + e.vinculadas.join(', ') : '',
          plural((e.profissionais || []).length, 'profissional', 'profissionais'),
        ]
          .filter(Boolean)
          .join(' · '),
        alertas: e.alertas || [],
        filhos: categorias(e.profissionais),
      }));
      if ((u.semEquipe || []).length)
        filhos.push({
          nivel: 2,
          chip: '—',
          rotulo: 'Sem equipe',
          sub: plural(u.semEquipe.length, 'lotação', 'lotações') + ' sem equipe nesta unidade',
          alertas: [],
          filhos: categorias(u.semEquipe),
        });
      if ((u.foraDaUnidade || []).length)
        filhos.push({
          nivel: 2,
          chip: '?',
          rotulo: 'Equipe não ativa nesta unidade',
          sub: plural(u.foraDaUnidade.length, 'lotação', 'lotações'),
          alertas: [],
          filhos: categorias(u.foraDaUnidade),
        });
      return { nivel: 1, rotulo: u.nome, sub: plural((u.equipes || []).length, 'equipe', 'equipes'), alertas: u.alertas || [], filhos };
    });
    const raiz = {
      nivel: 0,
      rotulo: 'Cajamar',
      sub:
        plural(unidades.length, 'unidade', 'unidades') +
        ' · ' +
        plural(
          unidades.reduce((s, u) => s + u.filhos.filter((f) => f.chip !== '—' && f.chip !== '?').length, 0),
          'equipe',
          'equipes',
        ),
      alertas: c.alertas || [],
      filhos: unidades,
      aberto: true,
    };
    const contar = (n) => {
      n.total = n.alertas.length + n.filhos.reduce((s, f) => s + contar(f), 0);
      return n.total;
    };
    contar(raiz);
    return raiz;
  }

  // ---- desenho ----
  let raiz = null,
    soAlertas = false,
    termo = '';
  const casa = (n) => !termo || norm(n.rotulo + ' ' + (n.sub || '') + ' ' + (n.chip || '')).includes(termo);
  const visivel = (n) => (!soAlertas || n.total > 0) && (casa(n) || n.filhos.some(visivel));
  const realce = (t) => {
    if (!termo) return esc(t);
    const i = norm(t).indexOf(termo);
    return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + termo.length)) + '</mark>' + esc(t.slice(i + termo.length));
  };

  function no(n, caminho) {
    const filhos = n.filhos.filter((f) => visivel(f) || (casa(n) && termo && !soAlertas));
    const aberto = n.aberto || (termo && filhos.some((f) => f.filhos.some(visivel) || casa(f)) && !casa(n)) || false;
    const folha = !n.filhos.length;
    return (
      '<li><div class="no n' +
      n.nivel +
      (folha ? ' folha' : '') +
      '">' +
      '<button type="button" data-c="' +
      caminho +
      '"' +
      (folha ? ' tabindex="-1"' : ' aria-expanded="' + !!aberto + '"') +
      '>' +
      '<span class="seta" aria-hidden="true">' +
      (aberto ? '−' : '+') +
      '</span>' +
      '<span class="txt"><b>' +
      (n.chip ? '<span class="chip">' + esc(n.chip) + '</span>' : '') +
      realce(n.rotulo) +
      '</b>' +
      (n.sub ? '<small>' + realce(n.sub) + '</small>' : '') +
      '</span>' +
      (n.total ? '<span class="al" title="Pontos de atenção neste nível e abaixo">' + n.total + '</span>' : '') +
      '</button>' +
      (n.alertas.length && (aberto || folha || n.nivel === 2)
        ? '<ul class="avisos">' + n.alertas.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>'
        : '') +
      '</div>' +
      (aberto && filhos.length ? '<ul>' + filhos.map((f) => no(f, caminho + '.' + n.filhos.indexOf(f))).join('') + '</ul>' : '') +
      '</li>'
    );
  }
  function desenhar() {
    $('arv').innerHTML = raiz && visivel(raiz) ? no(raiz, '0') : '<li class="vazio">Nada encontrado com esse filtro.</li>';
  }
  const achar = (caminho) =>
    caminho
      .split('.')
      .slice(1)
      .reduce((n, i) => n.filhos[+i], raiz);
  const todos = (n, f) => {
    f(n);
    n.filhos.forEach((x) => todos(x, f));
  };

  $('arv').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    const n = achar(b.dataset.c);
    if (!n.filhos.length) return;
    n.aberto = !(b.getAttribute('aria-expanded') === 'true');
    desenhar();
    const novo = $('arv').querySelector('button[data-c="' + b.dataset.c + '"]');
    if (novo) novo.focus();
  });
  $('abrir').addEventListener('click', () => {
    todos(raiz, (n) => {
      n.aberto = n.nivel < 3;
    });
    desenhar();
  });
  $('fechar').addEventListener('click', () => {
    todos(raiz, (n) => {
      n.aberto = n.nivel === 0;
    });
    desenhar();
  });
  $('so').addEventListener('click', (e) => {
    soAlertas = !soAlertas;
    e.currentTarget.setAttribute('aria-pressed', soAlertas);
    if (soAlertas)
      todos(raiz, (n) => {
        n.aberto = n.total > 0 && n.nivel < 2;
      });
    desenhar();
  });
  $('busca').addEventListener('input', (e) => {
    termo = norm(e.target.value.trim());
    desenhar();
  });

  // ---- vínculos entre equipes: as eMulti atendem várias unidades, então ficam fora das caixas das unidades ----
  const CORES = ['#1F6FB2', '#D9822B', '#7A3E9D', '#1C9C76', '#B23A48', '#6B7A14'];
  let comp = null,
    selV = '';
  const chave = (e) => e.ine || e.nome;
  function grafo(c) {
    const multi = new Map(),
      unidades = [],
      porNome = new Map(),
      fios = [];
    for (const u of c.unidades || []) {
      const U = { nome: u.nome, ref: [], apoio: [] };
      for (const e of u.equipes || []) {
        if (e.tipo === 'EMULTI') {
          // A mesma eMulti aparece em cada unidade onde tem lotação, com os vínculos daquela unidade: junta todos.
          const m = multi.get(chave(e)) || { id: 'm:' + chave(e), e: Object.assign({}, e, { vinculadas: [] }), unidades: [] };
          m.unidades.push(u.nome);
          (e.vinculadas || []).forEach((v) => {
            if (m.e.vinculadas.indexOf(v) < 0) m.e.vinculadas.push(v);
          });
          multi.set(chave(e), m);
          continue;
        }
        const n = { id: 'e:' + u.nome + '|' + chave(e), e, unidade: u.nome };
        (e.tipo === 'ESF' || e.tipo === 'EAP' ? U.ref : U.apoio).push(n);
        if (!porNome.has(e.nome)) porNome.set(e.nome, n);
        if (e.ine && !porNome.has(e.ine)) porNome.set(e.ine, n);
      }
      if (U.ref.length || U.apoio.length) unidades.push(U);
    }
    [...multi.values()].forEach((m, i) => {
      m.cor = CORES[i % CORES.length];
      (m.e.vinculadas || []).forEach((v) => {
        const alvo = porNome.get(v);
        if (alvo) fios.push({ de: m.id, para: alvo.id, cor: m.cor, tipo: 'm' });
      });
    });
    unidades.forEach((U) =>
      U.apoio.forEach((n) =>
        (n.e.vinculadas || []).forEach((v) => {
          const alvo = porNome.get(v);
          if (alvo) fios.push({ de: n.id, para: alvo.id, cor: '', tipo: 'a' });
        }),
      ),
    );
    return { multi: [...multi.values()], unidades, fios };
  }
  let G = null;
  function desenharVinculos() {
    if (!comp) return;
    G = grafo(comp);
    const liga = new Set();
    if (selV)
      G.fios.forEach((f) => {
        if (f.de === selV) liga.add(f.para);
        if (f.para === selV) liga.add(f.de);
      });
    const cartao = (n, extra) =>
      '<button type="button" class="eq' +
      (liga.has(n.id) ? ' liga' : '') +
      '" data-v="' +
      esc(n.id) +
      '" aria-pressed="' +
      (selV === n.id) +
      '"><b>' +
      (n.cor ? '<span class="cor" style="background:' + n.cor + '"></span>' : '') +
      '<span class="chip">' +
      esc(TIPOS[n.e.tipo] || n.e.tipo) +
      '</span>' +
      esc(n.e.nome) +
      '</b><small>' +
      esc(extra) +
      '</small></button>';
    const nFios = (id) => G.fios.filter((f) => f.de === id || f.para === id).length;
    const h =
      '<div class="col-m"><div><h2>eMulti · atendem várias unidades</h2></div>' +
      (G.multi.length
        ? G.multi
            .map((m) => {
              const us = new Set(G.fios.filter((f) => f.de === m.id).map((f) => f.para.slice(2).split('|')[0]));
              const fora = m.e.vinculadas.length - nFios(m.id);
              return cartao(
                m,
                plural(nFios(m.id), 'equipe vinculada', 'equipes vinculadas') +
                  ' em ' +
                  plural(us.size, 'unidade', 'unidades') +
                  ' · lotada em ' +
                  plural(new Set(m.unidades).size, 'unidade', 'unidades') +
                  (fora > 0 ? ' · ' + plural(fora, 'vínculo', 'vínculos') + ' com equipe fora desta composição' : ''),
              );
            })
            .join('')
        : '<small style="color:var(--muted)">Nenhuma eMulti na composição.</small>') +
      '</div>' +
      '<div class="col-u">' +
      G.unidades
        .map(
          (U) =>
            '<div class="u-box"><h2>' +
            esc(U.nome) +
            '</h2><div class="u-cols"><div>' +
            U.ref
              .map((n) => {
                const ms = G.fios.filter((f) => f.para === n.id && f.tipo === 'm').length;
                return cartao(n, ms ? plural(ms, 'eMulti vinculada', 'eMulti vinculadas') : 'sem eMulti vinculada');
              })
              .join('') +
            '</div><div>' +
            U.apoio
              .map((n) =>
                cartao(n, (n.e.vinculadas || []).length ? 'referência: ' + n.e.vinculadas.join(', ') : 'sem equipe de referência no PEC'),
              )
              .join('') +
            '</div></div></div>',
        )
        .join('') +
      '</div>';
    const cx = $('vinc');
    cx.className = 'vinc' + (selV ? ' sel' : '');
    cx.innerHTML = h + '<svg aria-hidden="true"></svg>';
    fiosSvg();
    const alvo = selV && [...G.multi, ...G.unidades.flatMap((U) => U.ref.concat(U.apoio))].find((n) => n.id === selV);
    if (!alvo) {
      $('vinc-resumo').textContent = G.fios.length ? '' : 'A composição lida não traz vínculos entre equipes.';
      return;
    }
    const outros = G.fios.filter((f) => f.de === selV || f.para === selV).map((f) => (f.de === selV ? f.para : f.de));
    const nomes = outros
      .map((id) => {
        const n = [...G.multi, ...G.unidades.flatMap((U) => U.ref.concat(U.apoio))].find((x) => x.id === id);
        return n ? n.e.nome + (n.unidade ? ' (' + n.unidade + ')' : '') : '';
      })
      .filter(Boolean);
    const us = new Set(outros.filter((id) => id[0] === 'e').map((id) => id.slice(2).split('|')[0]));
    $('vinc-resumo').textContent =
      alvo.e.nome +
      ': ' +
      (nomes.length
        ? plural(nomes.length, 'vínculo', 'vínculos') +
          (alvo.e.tipo === 'EMULTI' ? ' em ' + plural(us.size, 'unidade', 'unidades') : '') +
          ' · ' +
          nomes.join('; ')
        : 'nenhum vínculo registrado no PEC') +
      '.';
  }
  function fiosSvg() {
    const cx = $('vinc'),
      svg = cx.querySelector('svg');
    if (!svg || !G) return;
    const base = cx.getBoundingClientRect();
    const pos = (id) => {
      const el = cx.querySelector('[data-v="' + CSS.escape(id) + '"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { e: r.left - base.left, d: r.right - base.left, y: r.top - base.top + r.height / 2 };
    };
    svg.innerHTML = G.fios
      .map((f) => {
        const a = pos(f.de),
          b = pos(f.para);
        if (!a || !b) return '';
        // eMulti sai pela direita e chega pela esquerda da equipe; a saúde bucal sai pela esquerda e chega pela direita.
        const x1 = f.tipo === 'm' ? a.d : a.e,
          x2 = f.tipo === 'm' ? b.e : b.d,
          m = (x1 + x2) / 2;
        const ativo = !selV || f.de === selV || f.para === selV;
        return (
          '<path d="M' +
          x1 +
          ' ' +
          a.y +
          ' C' +
          m +
          ' ' +
          a.y +
          ' ' +
          m +
          ' ' +
          b.y +
          ' ' +
          x2 +
          ' ' +
          b.y +
          '" stroke="' +
          (f.cor || 'var(--fio)') +
          '" opacity="' +
          (ativo ? (selV ? 1 : 0.75) : 0.08) +
          '"' +
          (ativo && selV ? ' stroke-width="3"' : '') +
          '></path>'
        );
      })
      .join('');
  }
  $('vinc').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    selV = selV === b.dataset.v ? '' : b.dataset.v;
    desenharVinculos();
    const n = $('vinc').querySelector('[data-v="' + CSS.escape(b.dataset.v) + '"]');
    if (n) n.focus();
  });
  window.addEventListener('resize', fiosSvg);
  function visao(v) {
    $('v-arv').hidden = v;
    $('v-vinc').hidden = !v;
    $('ver-arv').setAttribute('aria-pressed', !v);
    $('ver-vinc').setAttribute('aria-pressed', v);
    ['busca', 'so', 'abrir', 'fechar'].forEach((i) => {
      $(i).hidden = v;
    });
    if (v) desenharVinculos();
  }
  $('ver-arv').addEventListener('click', () => visao(false));
  $('ver-vinc').addEventListener('click', () => visao(true));

  function mostrar(c) {
    comp = c;
    selV = '';
    if (!$('v-vinc').hidden) desenharVinculos();
    raiz = modelo(c);
    $('exemplo').hidden = !c.exemplo;
    const quando = c.coletadoEm ? ' Lida no PEC em ' + new Date(c.coletadoEm).toLocaleDateString('pt-BR') + '.' : '';
    $('sub').textContent =
      'Do município ao profissional. Clique num cartão para abrir o próximo nível; o selo amarelo mostra quantos pontos de atenção há ali dentro.' +
      (c.exemplo ? ' A extensão ainda não enviou a composição: o que aparece é um exemplo.' : quando);
    desenhar();
  }
  async function carregar(comp) {
    try {
      const r = await fetch('/api/v1/composicao' + (comp ? '?competencia=' + encodeURIComponent(comp) : ''), {
        credentials: 'same-origin',
      });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const s = $('comp');
      if ((d.competencias || []).length) {
        s.innerHTML = d.competencias
          .map(
            (c) =>
              '<option value="' +
              c +
              '"' +
              (d.composicao && d.composicao.competencia === c ? ' selected' : '') +
              '>' +
              c.slice(5) +
              '/' +
              c.slice(0, 4) +
              '</option>',
          )
          .join('');
        s.hidden = false;
      }
      mostrar(d.composicao || EXEMPLO);
    } catch {
      mostrar(EXEMPLO);
    }
  }
  $('comp').addEventListener('change', (e) => carregar(e.target.value));
  carregar();
})();
