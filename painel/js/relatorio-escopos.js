// Painel APS · relatório (dossiês por município, unidade e equipe). Script comum: usa as funções e dados declarados nos outros arquivos relatorio-*.js.
// ---------- dossiês: município, unidade e equipe ----------
// Cada dossiê é uma sequência de páginas; o nome da unidade/equipe se repete no topo de TODAS as páginas dele (cabeçalho de tabela repetido na impressão).
const soltaEq = (e) => !e || e === 'Município' || /^sem equipe$/i.test(e);
const ordPt = (a, b) => a.localeCompare(b, 'pt');
function unidadesDe(comp) {
  return [...new Set((dados[comp] || []).map((l) => l.unidade).filter((u) => u && u !== 'Município'))].sort(ordPt);
}
function equipesDe(comp, un) {
  const m = new Map();
  for (const l of dados[comp] || []) {
    if (!l.unidade || l.unidade === 'Município' || soltaEq(l.equipe)) continue;
    if (un && l.unidade !== un) continue;
    const k = l.unidade + '|' + l.equipe;
    if (!m.has(k)) m.set(k, { u: l.unidade, e: l.equipe, tipo: l.tipoEquipe || '' });
  }
  return [...m.values()].sort((a, b) => ordPt(a.u, b.u) || ordPt(a.e, b.e));
}
const curto = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const escMunicipio = () => ({
  nivel: 'Município',
  nome: 'Município de Cajamar',
  sub: 'Todas as unidades e equipes',
  uns: null,
  eqs: null,
  ref: false,
});
const escUnidade = (comp, u) => ({
  nivel: 'Unidade',
  nome: u,
  sub: equipesDe(comp, u).length + ' equipe(s) com dados',
  uns: new Set([u]),
  eqs: null,
  ref: true,
});
const escEquipe = (t) => ({
  nivel: 'Equipe',
  nome: t.e,
  sub: t.u + (t.tipo ? ' · ' + t.tipo : ''),
  uns: new Set([t.u]),
  eqs: new Set([t.u + '|' + t.e]),
  ref: true,
});
const escUnidades = (us) => ({
  nivel: 'Unidades · consolidado',
  nome: us.length + (us.length === 1 ? ' unidade' : ' unidades'),
  sub: curto(us.join(' · '), 230),
  uns: new Set(us),
  eqs: null,
  ref: true,
  lista: us.join(' · '),
});
const escEquipes = (ts) => ({
  nivel: 'Equipes · consolidado',
  nome: ts.length + (ts.length === 1 ? ' equipe' : ' equipes'),
  sub: curto(ts.map((t) => t.u + ' · ' + t.e).join(' | '), 230),
  uns: null,
  eqs: new Set(ts.map((t) => t.u + '|' + t.e)),
  ref: true,
  lista: ts.map((t) => t.u + ' · ' + t.e).join(' | '),
});
const filtroDe = (E) => (l) => (!E.uns || E.uns.has(l.unidade)) && (!E.eqs || E.eqs.has(l.unidade + '|' + l.equipe));
const legEnt = (E) =>
  '<div class="leg"><span><i class="k-r"></i>Regular</span><span><i class="k-s"></i>Suficiente</span><span><i class="k-b"></i>Bom</span><span><i class="k-o"></i>Ótimo</span><span><i style="background:#1F3C72"></i>Resultado</span>' +
  (E.ref ? '<span><i style="background:#fff;border:3px solid #1F3C72;box-sizing:border-box"></i>Município (referência)</span>' : '') +
  '</div>';
// Corpo de um dossiê: réguas por grupo e, para o que não tem faixa, uma tabela. csvl acumula as linhas do CSV.
function corpoEscopo(comp, E, csvl) {
  const f = filtroDe(E);
  let corpo = '';
  for (const [gn, gc] of GRUPOS) {
    let reg = '',
      tab = '';
    for (const cod of gc) {
      const todas = linhasDe(cod, [comp], '');
      const ls = E.uns || E.eqs ? todas.filter(f) : todas;
      if (!ls.length) continue;
      const cat = (window.CATALOGO || {})[cod] || { nome: cod, tipo: '' };
      const g = agregar(ls, () => 'T').get(cod + '|T');
      if (!g) continue;
      const v = resultado(g, cat.tipo),
        k = conceito(cod, v);
      const gm = E.ref ? agregar(todas, () => 'M').get(cod + '|M') : null,
        vm = gm ? resultado(gm, cat.tipo) : null;
      const direto = g.direto !== undefined,
        nu = direto ? '—' : num(cat.tipo === 'pontos' ? g.pts : g.num, 0),
        de = direto ? '—' : num(g.den, 0);
      csvl.push(
        '<tr><td>' +
          esc(E.nivel) +
          '</td><td>' +
          esc(E.nome) +
          '</td><td>' +
          esc(E.sub) +
          '</td><td>' +
          esc(cod) +
          '</td><td>' +
          esc(nomeSem(cod, cat.nome)) +
          '</td><td>' +
          nu +
          '</td><td>' +
          de +
          '</td><td>' +
          fmt(v, cat.tipo) +
          '</td><td>' +
          (k ? NOMEC[k] : '') +
          '</td><td>' +
          (E.ref ? fmt(vm, cat.tipo) : '') +
          '</td></tr>',
      );
      const r = faixasDe(cod) ? reguaHtml(cod, v, E.ref ? { ref: vm } : {}) : '';
      if (r)
        reg +=
          '<div class="reg"><div class="nm"><b>' +
          esc(cod) +
          '</b> · ' +
          esc(nomeSem(cod, cat.nome)) +
          '<div class="vl"><b>' +
          fmt(v, cat.tipo) +
          '</b>' +
          kpill(k) +
          (FAIXAX[cod] ? '*' : '') +
          (E.ref ? '<span>município: ' + fmt(vm, cat.tipo) + '</span>' : '') +
          '</div></div><div>' +
          r +
          '</div></div>';
      else
        tab +=
          '<tr' +
          fil(cod) +
          '><td><b>' +
          esc(cod) +
          '</b> · ' +
          esc(nomeSem(cod, cat.nome)) +
          '</td><td class="n">' +
          nu +
          '</td><td class="n">' +
          de +
          '</td><td class="n"><b>' +
          fmt(v, cat.tipo) +
          '</b></td>' +
          (E.ref ? '<td class="n">' + fmt(vm, cat.tipo) + '</td>' : '') +
          '</tr>';
    }
    if (reg || tab)
      corpo +=
        '<h3>' +
        esc(gn) +
        '</h3>' +
        reg +
        (tab
          ? '<table><thead><tr><th>Indicador sem régua</th><th class="n">Numerador (ou pontos)</th><th class="n">Denominador</th><th class="n">Resultado</th>' +
            (E.ref ? '<th class="n">Município</th>' : '') +
            '</tr></thead><tbody>' +
            tab +
            '</tbody></table>'
          : '');
  }
  return corpo;
}
// Uma lista de dossiês, cada um começando em página nova e com o nome no topo de todas as suas páginas.
function secEscopos(comp, lista, intro) {
  if (!lista.length) return '<h2>Relatório</h2><p class="vazio">Nada selecionado ou sem dados nesta competência.</p>';
  const csvl = [];
  let out = '';
  lista.forEach((E, i) => {
    const corpo = corpoEscopo(comp, E, csvl);
    out +=
      '<section class="pag"><table class="rep"><thead><tr><th><div class="ebn n-' +
      ({ Município: 'm', Unidade: 'u', Equipe: 'e' }[E.nivel] || 'g') +
      '"><small>' +
      esc(E.nivel) +
      '</small><b>' +
      esc(E.nome) +
      '</b><span>' +
      esc(E.sub) +
      '</span></div></th></tr></thead><tbody><tr><td>' +
      (i === 0 && intro ? '<p>' + intro + '</p>' : '') +
      legEnt(E) +
      (corpo || '<p class="vazio">Sem indicadores nesta competência.</p>') +
      '</td></tr></tbody></table></section>';
  });
  out +=
    '<table class="csv so-csv"><thead><tr><th>Nível</th><th>Abrangência</th><th>Detalhe</th><th>Código</th><th>Indicador</th><th>Numerador (ou pontos)</th><th>Denominador</th><th>Resultado</th><th>Conceito</th><th>Município</th></tr></thead><tbody>' +
    csvl.join('') +
    '</tbody></table>';
  out +=
    '<p><small>* Faixa lida do desenho do dashboard, ainda a confirmar com a nota técnica vigente. Indicadores sem faixa definida (como a B2) aparecem na tabela, sem régua.</small></p>';
  return out;
}
const INTRO_ESC =
  'A faixa colorida da régua mostra os conceitos do indicador (regular, suficiente, bom e ótimo; em impressão preto e branco, cada conceito tem textura própria). O marcador escuro é o resultado desta página e o contorno é o município, para comparar.';
// Lista de dossiês de um lote. modo: todos | unidades | equipes. sel: valores marcados.
function listaLote(comp, modo, sel, comMun) {
  const L = [];
  if (comMun) L.push(escMunicipio());
  const eqs = equipesDe(comp, '');
  if (modo === 'todos') {
    for (const u of unidadesDe(comp)) {
      L.push(escUnidade(comp, u));
      for (const t of eqs.filter((x) => x.u === u)) L.push(escEquipe(t));
    }
  }
  if (modo === 'unidades') for (const u of unidadesDe(comp)) if (sel.includes(u)) L.push(escUnidade(comp, u));
  if (modo === 'equipes') for (const t of eqs) if (sel.includes(t.u + '|' + t.e)) L.push(escEquipe(t));
  return L;
}
// Seletor de caixas de marcar (unidades ou equipes agrupadas por unidade).
function painelSel(el, itens, marcados, aoMudar) {
  let h = '<label class="todas"><input type="checkbox" data-todas> <b>Marcar todas</b></label><div class="lista">',
    ult = null;
  for (const it of itens) {
    if (it.g && it.g !== ult) {
      h += '<div class="gr">' + esc(it.g) + '</div>';
      ult = it.g;
    }
    h += '<label><input type="checkbox" value="' + esc(it.v) + '"' + (marcados.has(it.v) ? ' checked' : '') + '> ' + esc(it.r) + '</label>';
  }
  el.innerHTML = h + '</div>';
  const cx = [...el.querySelectorAll('.lista input')],
    todas = el.querySelector('[data-todas]');
  const sinc = () => {
    todas.checked = cx.length > 0 && cx.every((c) => c.checked);
  };
  sinc();
  todas.onchange = () => {
    cx.forEach((c) => (c.checked = todas.checked));
    aoMudar && aoMudar();
  };
  cx.forEach(
    (c) =>
      (c.onchange = () => {
        sinc();
        aoMudar && aoMudar();
      }),
  );
}
const marcadosDe = (el) => [...el.querySelectorAll('.lista input:checked')].map((c) => c.value);
const itensSel = (comp, nivel) =>
  nivel === 'unidades'
    ? unidadesDe(comp).map((u) => ({ v: u, r: u }))
    : equipesDe(comp, '').map((t) => ({ v: t.u + '|' + t.e, r: t.e, g: t.u }));
