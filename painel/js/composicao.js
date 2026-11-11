// Composição das equipes: árvore expansível município → unidade → equipe → categoria → profissional.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const TIPOS = { ESF: 'eSF', EAP: 'eAP', ESB: 'eSB', EMULTI: 'eMulti', ECR: 'eCR', EACS: 'eACS', EMAD: 'EMAD' };
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  const horas = h => typeof h === 'number' ? String(Math.round(h * 10) / 10).replace('.', ',') + ' h de agenda' : '';

  // Exemplo usado enquanto a extensão ainda não enviou a composição.
  const EXEMPLO = { competencia: '2026-10', exemplo: true, alertas: ['1 profissional(is) aparecem em mais de uma equipe (pode ser homônimo ou lotação dupla).'], unidades: [
    { nome: 'UBS Exemplo Central', alertas: ['Sem equipe: 2 agente comunitário de saúde.'], semEquipe: [{ nome: 'Profissional 9', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' }, { nome: 'Profissional 10', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' }, { nome: 'Profissional 11', cbo: 'ASSISTENTE ADMINISTRATIVO' }],
      equipes: [
        { nome: 'EQUIPE A', ine: '0000000001', tipo: 'ESF', vinculadas: [], alertas: [], profissionais: [{ nome: 'Profissional 1', cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' }, { nome: 'Profissional 2', cbo: 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' }, { nome: 'Profissional 3', cbo: 'TÉCNICO DE ENFERMAGEM' }, { nome: 'Profissional 4', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' }, { nome: 'Profissional 5', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' }] },
        { nome: 'EQUIPE B', ine: '0000000002', tipo: 'ESF', vinculadas: [], alertas: ['Sem médico lotado.'], profissionais: [{ nome: 'Profissional 6', cbo: 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' }, { nome: 'Profissional 7', cbo: 'TÉCNICO DE ENFERMAGEM' }, { nome: 'Profissional 8', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' }] },
        { nome: 'ESB EQUIPE A', ine: '0000000003', tipo: 'ESB', horas: 20, vinculadas: ['EQUIPE A'], alertas: [], profissionais: [{ nome: 'Profissional 12', cbo: 'CIRURGIÃO DENTISTA - CLÍNICO GERAL' }, { nome: 'Profissional 13', cbo: 'AUXILIAR EM SAÚDE BUCAL' }] }
      ] },
    { nome: 'UBS Exemplo Norte', alertas: [], semEquipe: [], equipes: [
        { nome: 'EQUIPE C', ine: '0000000004', tipo: 'ESF', vinculadas: [], alertas: [], profissionais: [{ nome: 'Profissional 14', cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' }, { nome: 'Profissional 15', cbo: 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA' }, { nome: 'Profissional 16', cbo: 'AUXILIAR DE ENFERMAGEM' }, { nome: 'Profissional 17', cbo: 'AGENTE COMUNITÁRIO DE SAÚDE' }] },
        { nome: 'COMPLEMENTAR X', ine: '0000000005', tipo: 'EMULTI', vinculadas: ['EQUIPE C', 'EQUIPE A'], alertas: ['Só 2 equipe(s) vinculada(s).'], profissionais: [{ nome: 'Profissional 18', cbo: 'PSICÓLOGO CLÍNICO' }, { nome: 'Profissional 19', cbo: 'FISIOTERAPEUTA GERAL' }] }
      ] }
  ] };

  // ---- modelo: transforma a composição em nós { rotulo, sub, chip, alertas[], filhos[], nivel } ----
  function categorias(profs) {
    const m = new Map();
    for (const p of profs || []) (m.get(p.cbo) || m.set(p.cbo, []).get(p.cbo)).push(p);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt')).map(([cbo, lista]) => ({
      nivel: 3, rotulo: cbo ? cbo.charAt(0) + cbo.slice(1).toLowerCase() : 'Sem categoria', sub: plural(lista.length, 'profissional', 'profissionais'), alertas: [],
      filhos: lista.filter(p => p.nome).sort((a, b) => a.nome.localeCompare(b.nome, 'pt')).map(p => ({ nivel: 4, rotulo: p.nome, sub: p.equipe ? 'Equipe: ' + p.equipe : '', alertas: [], filhos: [] }))
    }));
  }
  function modelo(c) {
    const unidades = (c.unidades || []).map(u => {
      const filhos = (u.equipes || []).map(e => ({
        nivel: 2, chip: TIPOS[e.tipo] || e.tipo, rotulo: e.nome,
        sub: [e.ine ? 'INE ' + e.ine : '', horas(e.horas), (e.vinculadas || []).length ? 'Vinculada a: ' + e.vinculadas.join(', ') : '', plural((e.profissionais || []).length, 'profissional', 'profissionais')].filter(Boolean).join(' · '),
        alertas: e.alertas || [], filhos: categorias(e.profissionais)
      }));
      if ((u.semEquipe || []).length) filhos.push({ nivel: 2, chip: '—', rotulo: 'Sem equipe', sub: plural(u.semEquipe.length, 'lotação', 'lotações') + ' sem equipe nesta unidade', alertas: [], filhos: categorias(u.semEquipe) });
      if ((u.foraDaUnidade || []).length) filhos.push({ nivel: 2, chip: '?', rotulo: 'Equipe não ativa nesta unidade', sub: plural(u.foraDaUnidade.length, 'lotação', 'lotações'), alertas: [], filhos: categorias(u.foraDaUnidade) });
      return { nivel: 1, rotulo: u.nome, sub: plural((u.equipes || []).length, 'equipe', 'equipes'), alertas: u.alertas || [], filhos };
    });
    const raiz = { nivel: 0, rotulo: 'Cajamar', sub: plural(unidades.length, 'unidade', 'unidades') + ' · ' + plural(unidades.reduce((s, u) => s + u.filhos.filter(f => f.chip !== '—' && f.chip !== '?').length, 0), 'equipe', 'equipes'), alertas: c.alertas || [], filhos: unidades, aberto: true };
    const contar = n => { n.total = n.alertas.length + n.filhos.reduce((s, f) => s + contar(f), 0); return n.total; };
    contar(raiz);
    return raiz;
  }

  // ---- desenho ----
  let raiz = null, soAlertas = false, termo = '';
  const casa = n => !termo || norm(n.rotulo + ' ' + (n.sub || '') + ' ' + (n.chip || '')).includes(termo);
  const visivel = n => (!soAlertas || n.total > 0) && (casa(n) || n.filhos.some(visivel));
  const realce = t => { if (!termo) return esc(t); const i = norm(t).indexOf(termo); return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + termo.length)) + '</mark>' + esc(t.slice(i + termo.length)); };

  function no(n, caminho) {
    const filhos = n.filhos.filter(f => visivel(f) || (casa(n) && termo && !soAlertas));
    const aberto = n.aberto || (termo && filhos.some(f => f.filhos.some(visivel) || casa(f)) && !casa(n)) || false;
    const folha = !n.filhos.length;
    return '<li><div class="no n' + n.nivel + (folha ? ' folha' : '') + '">'
      + '<button type="button" data-c="' + caminho + '"' + (folha ? ' tabindex="-1"' : ' aria-expanded="' + !!aberto + '"') + '>'
      + '<span class="seta" aria-hidden="true">' + (aberto ? '−' : '+') + '</span>'
      + '<span class="txt"><b>' + (n.chip ? '<span class="chip">' + esc(n.chip) + '</span>' : '') + realce(n.rotulo) + '</b>' + (n.sub ? '<small>' + realce(n.sub) + '</small>' : '') + '</span>'
      + (n.total ? '<span class="al" title="Pontos de atenção neste nível e abaixo">' + n.total + '</span>' : '')
      + '</button>'
      + (n.alertas.length && (aberto || folha || n.nivel === 2) ? '<ul class="avisos">' + n.alertas.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '')
      + '</div>'
      + (aberto && filhos.length ? '<ul>' + filhos.map(f => no(f, caminho + '.' + n.filhos.indexOf(f))).join('') + '</ul>' : '')
      + '</li>';
  }
  function desenhar() {
    $('arv').innerHTML = raiz && visivel(raiz) ? no(raiz, '0') : '<li class="vazio">Nada encontrado com esse filtro.</li>';
  }
  const achar = caminho => caminho.split('.').slice(1).reduce((n, i) => n.filhos[+i], raiz);
  const todos = (n, f) => { f(n); n.filhos.forEach(x => todos(x, f)); };

  $('arv').addEventListener('click', e => {
    const b = e.target.closest('button[data-c]'); if (!b) return;
    const n = achar(b.dataset.c); if (!n.filhos.length) return;
    n.aberto = !(b.getAttribute('aria-expanded') === 'true');
    desenhar();
    const novo = $('arv').querySelector('button[data-c="' + b.dataset.c + '"]'); if (novo) novo.focus();
  });
  $('abrir').addEventListener('click', () => { todos(raiz, n => { n.aberto = n.nivel < 3; }); desenhar(); });
  $('fechar').addEventListener('click', () => { todos(raiz, n => { n.aberto = n.nivel === 0; }); desenhar(); });
  $('so').addEventListener('click', e => { soAlertas = !soAlertas; e.currentTarget.setAttribute('aria-pressed', soAlertas); if (soAlertas) todos(raiz, n => { n.aberto = n.total > 0 && n.nivel < 2; }); desenhar(); });
  $('busca').addEventListener('input', e => { termo = norm(e.target.value.trim()); desenhar(); });

  function mostrar(c) {
    raiz = modelo(c);
    $('exemplo').hidden = !c.exemplo;
    const quando = c.coletadoEm ? ' Lida no PEC em ' + new Date(c.coletadoEm).toLocaleDateString('pt-BR') + '.' : '';
    $('sub').textContent = 'Do município ao profissional. Clique num cartão para abrir o próximo nível; o selo amarelo mostra quantos pontos de atenção há ali dentro.' + (c.exemplo ? ' A extensão ainda não enviou a composição: o que aparece é um exemplo.' : quando);
    desenhar();
  }
  async function carregar(comp) {
    try {
      const r = await fetch('/api/v1/composicao' + (comp ? '?competencia=' + encodeURIComponent(comp) : ''), { credentials: 'same-origin' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const s = $('comp');
      if ((d.competencias || []).length) {
        s.innerHTML = d.competencias.map(c => '<option value="' + c + '"' + (d.composicao && d.composicao.competencia === c ? ' selected' : '') + '>' + c.slice(5) + '/' + c.slice(0, 4) + '</option>').join('');
        s.hidden = false;
      }
      mostrar(d.composicao || EXEMPLO);
    } catch { mostrar(EXEMPLO); }
  }
  $('comp').addEventListener('change', e => carregar(e.target.value));
  carregar();
})();
