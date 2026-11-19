// Painel APS · relatório "Produção e notas": atendimentos individuais por categoria profissional, atividades coletivas
// e notas dos indicadores, por unidade, equipe, categoria ou compilado do município; um mês, um quadrimestre ou meses escolhidos.
// Usa só o que já está no Painel (GET /api/v1/dados de cada competência). Nada de nomes de pacientes ou de profissionais.
const $ = (id) => document.getElementById(id);
let dados = {}; // competência -> linhas de indicador (usada também por federal-calculo.js)
const ATEND = {}; // competência -> cubo de atendimentos (unidade, equipe, cbo, tipoAtendimento, n)
let COMPS = [],
  USUARIO = null,
  PROD = null, // produção por profissional do período (null = sem acesso ou sem dados)
  PROD_FAIXA = '';
const ehGestor = () => USUARIO && (USUARIO.perfil === 'admin' || USUARIO.perfil === 'gestor');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesLong = (c) => MESES[Number(c.slice(5)) - 1] + ' de ' + c.slice(0, 4);
const ordPt = (a, b) => String(a).localeCompare(String(b), 'pt');
const N = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
const inteiro = (v) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const semEquipe = (e) => !e || e === 'Município' || /^sem equipe$/i.test(String(e).trim());

// Tipos de equipe e os indicadores de cada um.
const GRUPO_TIPO = { ESF: 'esf', EAP: 'esf', ESB: 'esb', EMULTI: 'emulti', ECR: 'ecr' };
const NOME_GRUPO = { esf: 'eSF e eAP', esb: 'eSB (saúde bucal)', emulti: 'eMulti', ecr: 'eCR (Consultório na Rua)', outra: 'Outras equipes' };
const INDICADORES = {
  esf: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'CVAT'],
  esb: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'],
  emulti: ['M1', 'M2'],
  ecr: ['CR1', 'CR2', 'CR3', 'CR4'],
  outra: [],
};
const grupoDoTipo = (t) => GRUPO_TIPO[String(t || '').toUpperCase()] || 'outra';
// Categoria a partir do CBO do relatório ("PSICOLOGO CLINICO - 251510" -> "Psicólogo clínico" sem acento; mantém o texto do PEC).
const categoria = (cbo) => {
  const t = String(cbo || '')
    .replace(/\s*-\s*\d{4,6}\s*$/, '')
    .trim()
    .toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Sem CBO';
};

// ---------- período ----------
function quadrimestres() {
  const qs = new Map();
  for (const c of COMPS) {
    const a = c.slice(0, 4),
      q = Math.ceil(Number(c.slice(5)) / 4);
    qs.set(a + '-Q' + q, { id: a + '-Q' + q, rot: q + 'º quadrimestre de ' + a });
  }
  return [...qs.values()].sort((x, y) => (x.id < y.id ? 1 : -1));
}
function mesesDoPeriodo() {
  const modo = $('modo').value;
  if (modo === 'mes') return $('mes').value ? [$('mes').value] : [];
  if (modo === 'quad') {
    const [a, q] = $('quad').value.split('-Q');
    if (!a) return [];
    return COMPS.filter((c) => c.startsWith(a + '-') && Math.ceil(Number(c.slice(5)) / 4) === Number(q)).sort();
  }
  const de = $('de').value,
    ate = $('ate').value;
  return COMPS.filter((c) => c >= (de < ate ? de : ate) && c <= (de < ate ? ate : de)).sort();
}
function rotuloPeriodo(ms) {
  if (!ms.length) return '—';
  if ($('modo').value === 'quad') return $('quad').selectedOptions[0].textContent + ' (' + ms.map(mesNome).join(', ') + ')';
  return ms.length === 1 ? mesLong(ms[0]) : mesLong(ms[0]) + ' a ' + mesLong(ms[ms.length - 1]) + ' (' + ms.length + ' meses)';
}

// ---------- carga ----------
async function carregar(ms) {
  const faixa = ms[0] + '..' + ms[ms.length - 1];
  if (ehGestor() && PROD_FAIXA !== faixa) {
    PROD_FAIXA = faixa;
    try {
      const r = await fetch('/api/v1/producao?de=' + ms[0] + '&ate=' + ms[ms.length - 1], { credentials: 'same-origin' });
      PROD = r.ok ? (await r.json()).profissionais || [] : null;
    } catch (_) {
      PROD = null;
    }
  }
  await Promise.all(
    ms
      .filter((c) => !dados[c])
      .map(async (c) => {
        try {
          const r = await fetch('/api/v1/dados?competencia=' + c, { credentials: 'same-origin' });
          if (!r.ok) throw 0;
          const j = await r.json();
          dados[c] = j.indicadores || [];
          ATEND[c] = j.atendimentos || [];
        } catch (_) {
          dados[c] = [];
          ATEND[c] = [];
        }
      }),
  );
}

// Equipes conhecidas no período: unidade|equipe -> { u, e, tipo, grupo }.
function equipes(ms) {
  const m = new Map();
  const add = (u, e, tipo) => {
    if (!u || u === 'Município' || semEquipe(e)) return;
    const k = N(u) + '|' + N(e);
    const o = m.get(k) || { k, u, e, tipo: '' };
    if (tipo && !o.tipo) o.tipo = String(tipo).toUpperCase();
    m.set(k, o);
  };
  for (const c of ms) {
    (dados[c] || []).forEach((l) => add(l.unidade, l.equipe, l.tipoEquipe));
    (ATEND[c] || []).forEach((a) => add(a.unidade, a.equipe, ''));
  }
  for (const o of m.values()) o.grupo = grupoDoTipo(o.tipo);
  return [...m.values()].sort((a, b) => ordPt(a.u, b.u) || ordPt(a.e, b.e));
}
const filtroTipo = (t) => !$('tipoEq').value || t.grupo === $('tipoEq').value;

// ---------- produção ----------
// Para um conjunto de equipes (chaves), por mês: atendimentos individuais, coletivas e compartilhados (eMulti).
function producao(ms, chaves) {
  const porMes = {};
  for (const c of ms) {
    const p = { ind: 0, col: 0, colComp: 0, part: 0, comp: 0, temCol: false };
    for (const a of ATEND[c] || []) if (chaves.has(N(a.unidade) + '|' + N(a.equipe))) p.ind += a.n || 0;
    for (const l of dados[c] || []) {
      if (!chaves.has(N(l.unidade) + '|' + N(l.equipe))) continue;
      const x = l.extras || {};
      if (l.codigo === 'COLET') {
        p.temCol = true;
        p.col += l.numerador || 0;
        p.colComp += x.compartilhadas || 0;
        p.part += x.participacoes || 0;
      }
      if (l.codigo === 'M2' && x.individuais) p.comp += x.individuais.compartilhados || 0;
    }
    porMes[c] = p;
  }
  return porMes;
}
// Atendimentos individuais por categoria: categoria -> { mês -> n, tipos -> { tipo -> n } }.
function porCategoria(ms, chaves) {
  const m = new Map();
  for (const c of ms)
    for (const a of ATEND[c] || []) {
      if (!chaves.has(N(a.unidade) + '|' + N(a.equipe))) continue;
      const cat = categoria(a.cbo);
      const o = m.get(cat) || { cat, meses: {}, tipos: {}, total: 0 };
      o.meses[c] = (o.meses[c] || 0) + (a.n || 0);
      const t = a.tipoAtendimento || 'Outros';
      o.tipos[t] = (o.tipos[t] || 0) + (a.n || 0);
      o.total += a.n || 0;
      m.set(cat, o);
    }
  return [...m.values()].sort((a, b) => b.total - a.total || ordPt(a.cat, b.cat));
}

// ---------- profissionais ----------
// Produção de cada profissional no período: chave unidade|equipe|cbo|nome -> { meses: { comp -> números }, tipos }.
function profissionais(ms, chaves) {
  const m = new Map();
  for (const r of PROD || []) {
    if (!ms.includes(r.competencia)) continue;
    const tk = N(r.unidade) + '|' + N(r.equipe);
    if (chaves && !chaves.has(tk)) continue;
    const k = tk + '|' + r.cbo + '|' + N(r.nome);
    const o = m.get(k) || { k, tk, u: r.unidade, e: r.equipe, cbo: r.cbo, cat: categoria(r.cboNome || r.cbo), nome: r.nome, meses: {}, tipos: {} };
    const z = (o.meses[r.competencia] = o.meses[r.competencia] || { ind: 0, comp: 0, cr: 0, ce: 0, part: 0 });
    z.ind += r.individuais || 0;
    z.comp += r.compartilhados || 0;
    z.cr += r.coletivasResponsavel || 0;
    z.ce += r.coletivasEnvolvido || 0;
    z.part += r.participacoes || 0;
    Object.entries(r.porTipo || {}).forEach(([t, n]) => (o.tipos[t] = (o.tipos[t] || 0) + n));
    m.set(k, o);
  }
  const lista = [...m.values()];
  for (const o of lista) o.tot = ms.reduce((t, c) => (Object.entries(o.meses[c] || {}).forEach(([x, n]) => (t[x] += n)), t), { ind: 0, comp: 0, cr: 0, ce: 0, part: 0 });
  // Só categoria: o nome dá lugar à categoria numerada dentro da equipe.
  const porCat = {};
  lista
    .sort((a, b) => ordPt(a.u, b.u) || ordPt(a.e, b.e) || ordPt(a.cat, b.cat) || b.tot.ind - a.tot.ind || ordPt(a.nome, b.nome))
    .forEach((o) => {
      const c = o.tk + '|' + o.cat;
      porCat[c] = (porCat[c] || 0) + 1;
      o.rotCat = o.cat + ' ' + porCat[c];
    });
  return lista;
}
const semNomes = () => $('ident').value === 'categoria';
const rotProf = (o) => (semNomes() ? o.rotCat : o.nome + ' · ' + o.cat);
function tabProfissionais(ms, chaves, comEquipe) {
  if (!PROD) return '';
  const ps = profissionais(ms, chaves);
  if (!ps.length)
    return '<h3>Produção por profissional</h3><p class="vazio">Sem produção por profissional neste período (chega com a extensão 0.9.8, item “Produção por profissional”).</p>';
  const cab =
    '<tr><th>' +
    (semNomes() ? 'Profissional (categoria)' : 'Profissional') +
    '</th>' +
    (comEquipe ? '<th>Equipe</th>' : '') +
    '<th class="n">Atend. individuais</th><th class="n">Compartilhados</th><th class="n">Coletivas (responsável)</th><th class="n">Coletivas (participou)</th><th class="n">Participações</th>' +
    (ms.length > 1 ? '<th class="n">Individuais por mês</th>' : '') +
    '</tr>';
  const corpo = ps
    .map(
      (o) =>
        '<tr><td>' +
        esc(rotProf(o)) +
        '</td>' +
        (comEquipe ? '<td>' + esc(o.e || 'Sem equipe') + '</td>' : '') +
        ['ind', 'comp', 'cr', 'ce', 'part'].map((x) => '<td class="n">' + inteiro(o.tot[x]) + '</td>').join('') +
        (ms.length > 1 ? '<td class="n">' + ms.map((c) => inteiro((o.meses[c] || {}).ind || 0)).join(' · ') + '</td>' : '') +
        '</tr>',
    )
    .join('');
  return '<h3>Produção por profissional</h3><table class="csv"><thead>' + cab + '</thead><tbody>' + corpo + '</tbody></table>';
}

// ---------- eMulti: pessoas atendidas e compartilhamento ----------
// M1 traz, acumulado no quadrimestre até o mês: atendimentos individuais, participações em coletivas e pessoas diferentes
// (individual + coletiva, sem repetir). M2 traz, no mês: atendimentos compartilhados e coletivas com 2 ou mais profissionais.
function tabEmulti(ms, chaves) {
  const linhas = ms.map((c) => {
    const o = { c, ind: 0, part: 0, pes: 0, min: 0, max: 0, comp: 0, indM: 0, col: 0, col2: 0, tem: false };
    for (const l of dados[c] || []) {
      if (!chaves.has(N(l.unidade) + '|' + N(l.equipe))) continue;
      const x = l.extras || {};
      if (l.codigo === 'M1') {
        const d = x.detalhe || {};
        o.tem = true;
        o.ind += d.atendimentosIndividuais || 0;
        o.part += d.participacoesColetivas || 0;
        o.pes += l.denominador || 0;
        o.min += d.pessoasMin != null ? d.pessoasMin : l.denominador || 0;
        o.max += d.pessoasMax != null ? d.pessoasMax : l.denominador || 0;
      }
      if (l.codigo === 'M2') {
        o.tem = true;
        o.comp += (x.individuais && x.individuais.compartilhados) || 0;
        o.indM += (x.individuais && x.individuais.total) || 0;
        o.col += (x.coletivas && x.coletivas.total) || 0;
        o.col2 += (x.coletivas && x.coletivas.compartilhadas) || 0;
      }
    }
    return o;
  });
  if (!linhas.some((o) => o.tem)) return '';
  const pc = (a, b) => (b ? ((100 * a) / b).toFixed(1).replace('.', ',') + '%' : '—');
  return (
    '<h3>eMulti · pessoas atendidas e trabalho compartilhado</h3><table class="csv"><thead><tr><th>Mês</th>' +
    '<th class="n">Pessoas atendidas (individual + coletiva, sem repetir)¹</th><th class="n">Atend. individuais¹</th><th class="n">Participações em coletivas¹</th>' +
    '<th class="n">Atend. compartilhados no mês</th><th class="n">% compartilhados</th><th class="n">Coletivas com 2+ profissionais no mês</th></tr></thead><tbody>' +
    linhas
      .map(
        (o) =>
          '<tr><td>' +
          mesNome(o.c) +
          '</td><td class="n"><b>' +
          inteiro(o.pes) +
          '</b>' +
          (o.max > o.min ? '<br><small>entre ' + inteiro(o.min) + ' e ' + inteiro(o.max) + '</small>' : '') +
          '</td><td class="n">' +
          inteiro(o.ind) +
          '</td><td class="n">' +
          inteiro(o.part) +
          '</td><td class="n">' +
          inteiro(o.comp) +
          '</td><td class="n">' +
          pc(o.comp, o.indM) +
          '</td><td class="n">' +
          inteiro(o.col2) +
          (o.col ? ' de ' + inteiro(o.col) : '') +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table><p><small>¹ Acumulado do quadrimestre até o mês, como no indicador M1 (não se soma entre meses). As pessoas são contadas uma vez, juntando atendimento individual e participação em atividade coletiva; quando parte dos atendimentos só está em ficha CDS, o valor é uma estimativa e aparece a faixa. Com várias equipes, a soma pode contar duas vezes quem foi atendido por mais de uma eMulti.</small></p>'
  );
}

// ---------- notas ----------
// Resultado de um indicador para um conjunto de equipes num conjunto de meses.
// Indicadores de situação (C2 a C7, CVAT, M1…) não se somam entre meses: no período vale o último mês.
function nota(cod, meses, chaves) {
  const usar = meses.length > 1 && NAO_SOMA_MESES.has(cod) ? [meses[meses.length - 1]] : meses;
  const ls = linhasDe(cod, usar, '').filter((l) => chaves.has(N(l.unidade) + '|' + N(l.equipe)));
  if (!ls.length) return null;
  const g = agregar(ls, () => 'x').get(cod + '|x');
  if (!g) return null;
  const tipo = (CATALOGO[cod] || {}).tipo;
  const v = resultado(g, tipo);
  return v == null || isNaN(v) ? null : { cod, v, tipo, k: conceito(cod, v) };
}
const celNota = (r) =>
  r ? fmt(r.v, r.tipo) + (r.k ? ' <span class="cc k-' + r.k + '">' + NOMEC[r.k] + '</span>' + aconf(r.cod) : '') : '<span class="vz">—</span>';
const nomeInd = (cod) => (CATALOGO[cod] ? nomeSem(cod, CATALOGO[cod].nome) : cod);

// ---------- blocos do documento ----------
function tabProducao(ms, chaves, titulo) {
  const pm = producao(ms, chaves);
  const temComp = ms.some((c) => pm[c].comp),
    temCol = ms.some((c) => pm[c].temCol);
  const cab =
    '<tr><th>Mês</th><th class="n">Atendimentos individuais</th>' +
    (temComp ? '<th class="n">Compartilhados</th>' : '') +
    '<th class="n">Atividades coletivas</th><th class="n">Coletivas com 2+ profissionais</th><th class="n">Participações</th></tr>';
  const lin = (rot, p, forte) =>
    '<tr' +
    (forte ? ' class="tot"' : '') +
    '><td>' +
    rot +
    '</td><td class="n">' +
    inteiro(p.ind) +
    '</td>' +
    (temComp ? '<td class="n">' + inteiro(p.comp) + '</td>' : '') +
    '<td class="n">' +
    (temCol ? inteiro(p.col) : '—') +
    '</td><td class="n">' +
    (temCol ? inteiro(p.colComp) : '—') +
    '</td><td class="n">' +
    (temCol ? inteiro(p.part) : '—') +
    '</td></tr>';
  const tot = ms.reduce(
    (t, c) => {
      Object.keys(t).forEach((k) => (t[k] += pm[c][k] || 0));
      return t;
    },
    { ind: 0, col: 0, colComp: 0, part: 0, comp: 0 },
  );
  let corpo = ms.map((c) => lin(mesNome(c), pm[c])).join('');
  if (ms.length > 1) corpo += lin('<b>Total do período</b>', tot, true);
  const evol = ms.length > 1 ? barras(ms.map((c) => [mesNome(c), pm[c].ind])) : '';
  return (
    '<h3>' +
    (titulo || 'Produção') +
    '</h3><table class="csv"><thead>' +
    cab +
    '</thead><tbody>' +
    corpo +
    '</tbody></table>' +
    evol +
    (temCol ? '' : '<p><small>Atividades coletivas: ainda sem dados neste período (chegam com a extensão 0.9.8, coletando B4 ou eMulti).</small></p>')
  );
}
// Evolução dos atendimentos individuais: barras horizontais simples (imprimem bem em preto e branco).
function barras(pares) {
  const max = Math.max(1, ...pares.map((p) => p[1] || 0));
  return (
    '<div class="evo" aria-label="Evolução dos atendimentos individuais"><small>Evolução dos atendimentos individuais</small>' +
    pares
      .map(
        ([r, v]) =>
          '<div class="evl"><span>' +
          esc(r) +
          '</span><div class="bar"><span style="width:' +
          ((100 * (v || 0)) / max).toFixed(1) +
          '%;background:#1f3c72"></span></div><b>' +
          inteiro(v) +
          '</b></div>',
      )
      .join('') +
    '</div>'
  );
}
function tabCategorias(ms, chaves) {
  const cs = porCategoria(ms, chaves);
  if (!cs.length) return '<h3>Atendimentos por categoria profissional</h3><p class="vazio">Sem atendimentos individuais no período.</p>';
  let cab, linha;
  if (ms.length > 1) {
    cab =
      '<tr><th>Categoria</th>' +
      ms.map((c) => '<th class="n">' + mesNome(c) + '</th>').join('') +
      '<th class="n">Total</th></tr>';
    linha = (o) =>
      '<tr><td>' +
      esc(o.cat) +
      '</td>' +
      ms.map((c) => '<td class="n">' + inteiro(o.meses[c] || 0) + '</td>').join('') +
      '<td class="n"><b>' +
      inteiro(o.total) +
      '</b></td></tr>';
  } else {
    // Um mês: total e os tipos de atendimento mais frequentes.
    const tipos = {};
    cs.forEach((o) => Object.entries(o.tipos).forEach(([t, n]) => (tipos[t] = (tipos[t] || 0) + n)));
    const top = Object.entries(tipos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map((x) => x[0]);
    cab =
      '<tr><th>Categoria</th><th class="n">Total</th>' +
      top.map((t) => '<th class="n">' + esc(t) + '</th>').join('') +
      '<th class="n">Outros tipos</th></tr>';
    linha = (o) => {
      const dosTop = top.reduce((s, t) => s + (o.tipos[t] || 0), 0);
      return (
        '<tr><td>' +
        esc(o.cat) +
        '</td><td class="n"><b>' +
        inteiro(o.total) +
        '</b></td>' +
        top.map((t) => '<td class="n">' + inteiro(o.tipos[t] || 0) + '</td>').join('') +
        '<td class="n">' +
        inteiro(o.total - dosTop) +
        '</td></tr>'
      );
    };
  }
  return (
    '<h3>Atendimentos individuais por categoria profissional</h3><table class="csv"><thead>' +
    cab +
    '</thead><tbody>' +
    cs.map(linha).join('') +
    '</tbody></table>'
  );
}
// Notas de um grupo de equipes (mesmo tipo): linhas = indicadores, colunas = meses e período.
function tabNotas(ms, chaves, grupo, titulo) {
  const cods = INDICADORES[grupo] || [];
  if (!cods.length) return '';
  const linhas = cods
    .map((cod) => {
      const porMes = ms.map((c) => nota(cod, [c], chaves));
      const per = ms.length > 1 ? nota(cod, ms, chaves) : porMes[0];
      if (!per && porMes.every((x) => !x)) return '';
      return (
        '<tr><td><b>' +
        cod +
        '</b> · ' +
        esc(nomeInd(cod)) +
        '</td>' +
        (ms.length > 1 ? porMes.map((r) => '<td class="n">' + celNota(r) + '</td>').join('') : '') +
        '<td class="n">' +
        celNota(per) +
        (ms.length > 1 && NAO_SOMA_MESES.has(cod) ? ' <small>(' + mesNome(ms[ms.length - 1]) + ')</small>' : '') +
        '</td></tr>'
      );
    })
    .join('');
  if (!linhas) return '<h3>' + (titulo || 'Notas dos indicadores') + '</h3><p class="vazio">Sem indicadores deste tipo de equipe no período.</p>';
  return (
    '<h3>' +
    (titulo || 'Notas dos indicadores') +
    '</h3><table class="csv"><thead><tr><th>Indicador</th>' +
    (ms.length > 1 ? ms.map((c) => '<th class="n">' + mesNome(c) + '</th>').join('') : '') +
    '<th class="n">' +
    (ms.length > 1 ? 'Período' : mesNome(ms[0])) +
    '</th></tr></thead><tbody>' +
    linhas +
    '</tbody></table>'
  );
}
// Uma linha por equipe com o total do período e as notas (compilado e páginas de unidade).
function tabEquipes(ms, lista, comNotas) {
  if (!lista.length) return '';
  const grupos = [...new Set(lista.map((t) => t.grupo))];
  return grupos
    .map((g) => {
      const ts = lista.filter((t) => t.grupo === g);
      // Só os indicadores com resultado em alguma equipe do grupo.
      const cods = (comNotas ? INDICADORES[g] : []).filter((c) => ts.some((t) => nota(c, ms, new Set([t.k]))));
      const cab =
        '<tr><th>Unidade</th><th>Equipe</th><th class="n">Atend. individuais</th><th class="n">Coletivas</th>' +
        cods.map((c) => '<th class="n">' + c + '</th>').join('') +
        '</tr>';
      const corpo = ts
        .map((t) => {
          const ch = new Set([t.k]);
          const pm = producao(ms, ch);
          const soma = (k) => ms.reduce((s, c) => s + (pm[c][k] || 0), 0);
          const temCol = ms.some((c) => pm[c].temCol);
          return (
            '<tr><td>' +
            esc(t.u) +
            '</td><td>' +
            esc(t.e) +
            '</td><td class="n">' +
            inteiro(soma('ind')) +
            '</td><td class="n">' +
            (temCol ? inteiro(soma('col')) : '—') +
            '</td>' +
            cods.map((c) => '<td class="n">' + celNota(nota(c, ms, ch)) + '</td>').join('') +
            '</tr>'
          );
        })
        .join('');
      return (
        '<h3>Equipes · ' +
        esc(NOME_GRUPO[g]) +
        '</h3><table class="csv eqs"><thead>' +
        cab +
        '</thead><tbody>' +
        corpo +
        '</tbody></table>'
      );
    })
    .join('');
}

// ---------- dossiês ----------
function dossie(nivel, nome, sub, corpo) {
  return (
    '<section class="pag"><table class="rep"><thead><tr><th><div class="ebn n-' +
    ({ Município: 'm', Unidade: 'u', Equipe: 'e' }[nivel] || 'g') +
    '"><small>' +
    esc(nivel) +
    '</small><b>' +
    esc(nome) +
    '</b><span>' +
    esc(sub) +
    '</span></div></th></tr></thead><tbody><tr><td>' +
    corpo +
    '</td></tr></tbody></table></section>'
  );
}
function montar(ms) {
  const todas = equipes(ms).filter(filtroTipo);
  const un = $('un').value,
    eq = $('eq').value;
  const sel = todas.filter((t) => (!un || t.u === un) && (!eq || t.k === eq));
  const rec = $('recorte').value;
  if (!sel.length) return '<p class="vazio">Sem equipes com dados para esta escolha.</p>';
  const chavesDe = (ts) => new Set(ts.map((t) => t.k));
  let out = '';
  if (rec === 'compilado') {
    const ch = chavesDe(sel);
    const grupos = [...new Set(sel.map((t) => t.grupo))];
    out += dossie(
      'Município',
      un ? un : 'Município de Cajamar',
      sel.length + ' equipe(s)' + ($('tipoEq').value ? ' · ' + NOME_GRUPO[$('tipoEq').value] : ''),
      tabProducao(ms, ch, 'Produção no período') +
        tabEmulti(ms, chavesDe(sel.filter((t) => t.grupo === 'emulti'))) +
        tabCategorias(ms, ch) +
        grupos.map((g) => tabNotas(ms, chavesDe(sel.filter((t) => t.grupo === g)), g, 'Notas · ' + NOME_GRUPO[g] + ' (conjunto das equipes)')).join('') +
        tabEquipes(ms, sel, true),
    );
  } else if (rec === 'unidade') {
    for (const u of [...new Set(sel.map((t) => t.u))]) {
      const ts = sel.filter((t) => t.u === u);
      const ch = chavesDe(ts);
      const grupos = [...new Set(ts.map((t) => t.grupo))];
      out += dossie(
        'Unidade',
        u,
        ts.length + ' equipe(s)',
        tabProducao(ms, ch, 'Produção da unidade') +
          tabEmulti(ms, chavesDe(ts.filter((t) => t.grupo === 'emulti'))) +
          tabCategorias(ms, ch) +
          tabProfissionais(ms, ch, true) +
          grupos.map((g) => tabNotas(ms, chavesDe(ts.filter((t) => t.grupo === g)), g, 'Notas · ' + NOME_GRUPO[g] + ' (conjunto da unidade)')).join('') +
          tabEquipes(ms, ts, true),
      );
    }
  } else if (rec === 'equipe') {
    for (const t of sel) {
      const ch = new Set([t.k]);
      out += dossie(
        'Equipe',
        t.e,
        t.u + (t.tipo ? ' · ' + t.tipo : ''),
        tabProducao(ms, ch, 'Produção da equipe') +
          (t.grupo === 'emulti' ? tabEmulti(ms, ch) : '') +
          tabCategorias(ms, ch) +
          tabProfissionais(ms, ch, false) +
          tabNotas(ms, ch, t.grupo),
      );
    }
  } else if (rec === 'profissional') {
    if (!PROD) return '<p class="vazio">A produção por profissional só aparece para administradores e gestores.</p>';
    const porTk = new Map(sel.map((t) => [t.k, t]));
    let ps = profissionais(ms, chavesDe(sel));
    if ($('prof').value) ps = ps.filter((o) => o.k === $('prof').value);
    if (!ps.length) return '<p class="vazio">Sem produção por profissional neste período (chega com a extensão 0.9.8, item “Produção por profissional”).</p>';
    for (const o of ps) {
      const t = porTk.get(o.tk);
      const cab =
        '<tr><th>Mês</th><th class="n">Atend. individuais</th><th class="n">Compartilhados</th><th class="n">Coletivas (responsável)</th><th class="n">Coletivas (participou)</th><th class="n">Participações</th></tr>';
      const lin = (rot, z, forte) =>
        '<tr' + (forte ? ' class="tot"' : '') + '><td>' + rot + '</td>' + ['ind', 'comp', 'cr', 'ce', 'part'].map((x) => '<td class="n">' + inteiro((z || {})[x] || 0) + '</td>').join('') + '</tr>';
      const tipos = Object.entries(o.tipos).sort((a, b) => b[1] - a[1]);
      out += dossie(
        'Profissional',
        semNomes() ? o.rotCat : o.nome,
        (semNomes() ? '' : o.cat + ' · ') + (o.e || 'Sem equipe') + ' · ' + o.u,
        '<h3>Produção</h3><table class="csv"><thead>' +
          cab +
          '</thead><tbody>' +
          ms.map((c) => lin(mesNome(c), o.meses[c])).join('') +
          (ms.length > 1 ? lin('<b>Total do período</b>', o.tot, true) : '') +
          '</tbody></table>' +
          (ms.length > 1 ? barras(ms.map((c) => [mesNome(c), (o.meses[c] || {}).ind || 0])) : '') +
          (tipos.length
            ? '<h3>Atendimentos individuais por tipo</h3><table class="csv"><thead><tr><th>Tipo</th><th class="n">Atendimentos</th></tr></thead><tbody>' +
              tipos.map(([x, n]) => '<tr><td>' + esc(x) + '</td><td class="n">' + inteiro(n) + '</td></tr>').join('') +
              '</tbody></table>'
            : '') +
          (t ? tabNotas(ms, new Set([t.k]), t.grupo, 'Notas da equipe ' + t.e) : ''),
      );
    }
  } else {
    // Por categoria: uma página por categoria, com a produção dela em cada equipe.
    const cats = porCategoria(ms, chavesDe(sel));
    for (const c of cats) {
      const linhas = sel
        .map((t) => {
          const o = porCategoria(ms, new Set([t.k])).find((x) => x.cat === c.cat);
          return o ? { t, o } : null;
        })
        .filter(Boolean);
      const cab =
        '<tr><th>Unidade</th><th>Equipe</th>' +
        (ms.length > 1 ? ms.map((m) => '<th class="n">' + mesNome(m) + '</th>').join('') : '') +
        '<th class="n">Total</th></tr>';
      const corpo = linhas
        .map(
          ({ t, o }) =>
            '<tr><td>' +
            esc(t.u) +
            '</td><td>' +
            esc(t.e) +
            '</td>' +
            (ms.length > 1 ? ms.map((m) => '<td class="n">' + inteiro(o.meses[m] || 0) + '</td>').join('') : '') +
            '<td class="n"><b>' +
            inteiro(o.total) +
            '</b></td></tr>',
        )
        .join('');
      const tipos = Object.entries(c.tipos).sort((a, b) => b[1] - a[1]);
      out += dossie(
        'Categoria profissional',
        c.cat,
        linhas.length + ' equipe(s) · ' + inteiro(c.total) + ' atendimentos individuais',
        (ms.length > 1 ? barras(ms.map((m) => [mesNome(m), c.meses[m] || 0])) : '') +
          '<h3>Atendimentos individuais por equipe</h3><table class="csv"><thead>' +
          cab +
          '</thead><tbody>' +
          corpo +
          '</tbody></table><h3>Por tipo de atendimento</h3><table class="csv"><thead><tr><th>Tipo</th><th class="n">Atendimentos</th></tr></thead><tbody>' +
          tipos.map(([t, n]) => '<tr><td>' + esc(t) + '</td><td class="n">' + inteiro(n) + '</td></tr>').join('') +
          '</tbody></table><p><small>As atividades coletivas e as notas são por equipe; veja o recorte por equipe.</small></p>',
      );
    }
    if (!cats.length) out = '<p class="vazio">Sem atendimentos individuais no período.</p>';
  }
  return out;
}

// ---------- tela ----------
const TITULOS = {
  unidade: 'Produção e notas · por unidade',
  equipe: 'Produção e notas · por equipe',
  categoria: 'Produção e notas · por categoria profissional',
  profissional: 'Produção e notas · por profissional',
  compilado: 'Produção e notas · compilado',
};
async function desenhar() {
  const ms = mesesDoPeriodo();
  if (!ms.length) {
    $('doc').innerHTML = '<p class="vazio">Escolha um período com dados coletados.</p>';
    return;
  }
  $('doc').innerHTML = '<p class="vazio">Carregando…</p>';
  await carregar(ms);
  preencherFiltros(ms);
  const pagina = document.getElementById('pagina');
  if (pagina) pagina.textContent = '@page { size: A4 ' + (ms.length > 3 ? 'landscape' : 'portrait') + '; }';
  const quando = new Date();
  const comp = ms[ms.length - 1];
  const id = 'PAPS-' + comp.replace('-', '') + '-PRO-' + quando.toISOString().slice(0, 16).replace(/\D/g, '');
  const corpo = montar(ms);
  const ultimas = ms
    .flatMap((c) => (dados[c] || []).map((l) => l.coletadoEm))
    .filter(Boolean)
    .sort();
  const fmtD = (d) => new Date(d).toLocaleDateString('pt-BR');
  $('doc').innerHTML =
    '<div class="capa"><img src="/img/painelaps.svg" alt=""><div><div class="org">Painel APS · Secretaria de Saúde de Cajamar</div><h1>' +
    esc(TITULOS[$('recorte').value]) +
    '</h1></div></div><dl class="meta"><div><dt>Período</dt><dd>' +
    esc(rotuloPeriodo(ms)) +
    '</dd></div><div><dt>Abrangência</dt><dd>' +
    esc(
      [$('un').value || 'Todas as unidades', $('eq').value ? $('eq').selectedOptions[0].textContent : '', $('tipoEq').value ? NOME_GRUPO[$('tipoEq').value] : '']
        .filter(Boolean)
        .join(' · '),
    ) +
    '</dd></div><div><dt>Dados coletados do PEC em</dt><dd>' +
    (ultimas.length ? (fmtD(ultimas[0]) === fmtD(ultimas[ultimas.length - 1]) ? fmtD(ultimas[0]) : fmtD(ultimas[0]) + ' a ' + fmtD(ultimas[ultimas.length - 1])) : '—') +
    '</dd></div><div><dt>Emitido por</dt><dd>' +
    esc(USUARIO ? USUARIO.nome : '—') +
    '</dd></div><div><dt>Emitido em</dt><dd>' +
    quando.toLocaleDateString('pt-BR') +
    ' às ' +
    quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
    '</dd></div><div><dt>Código do documento</dt><dd>' +
    id +
    '</dd></div></dl>' +
    corpo +
    '<div class="rodadoc"><b>Como ler este documento.</b> Atendimentos individuais: relatório gerencial de atendimentos do PEC, por equipe e categoria (CBO) do profissional. Atividades coletivas: atividades registradas no mês com profissional da equipe (uma atividade com profissionais de duas equipes conta para as duas). As notas são da equipe, calculadas pelo Painel APS conforme as notas técnicas; com mais de um mês, os indicadores de produção somam os meses e os de acompanhamento de pessoas (C2 a C7, CVAT, M1…) usam o último mês. É uma prévia para acompanhamento; o resultado oficial é o do Ministério da Saúde. ' + (PROD && !semNomes() ? 'Este documento traz nomes de profissionais (produção por profissional, só para gestão) e nenhum dado de paciente.' : 'Este documento não contém dados de pacientes nem nomes de profissionais.') + '</div>';
  document.title = TITULOS[$('recorte').value] + ' · ' + (ms.length === 1 ? ms[0] : ms[0] + ' a ' + comp);
}
function preencherFiltros(ms) {
  const ts = equipes(ms).filter(filtroTipo);
  const uns = [...new Set(ts.map((t) => t.u))].sort(ordPt);
  const u0 = $('un').value,
    e0 = $('eq').value;
  $('un').innerHTML = '<option value="">Todas</option>' + uns.map((u) => '<option>' + esc(u) + '</option>').join('');
  $('un').value = uns.includes(u0) ? u0 : '';
  const eqs = ts.filter((t) => !$('un').value || t.u === $('un').value);
  $('eq').innerHTML =
    '<option value="">Todas</option>' +
    eqs.map((t) => '<option value="' + esc(t.k) + '">' + esc(($('un').value ? '' : t.u + ' · ') + t.e) + '</option>').join('');
  $('eq').value = eqs.some((t) => t.k === e0) ? e0 : '';
  const p0 = $('prof').value;
  const ch = new Set(eqs.filter((t) => !$('eq').value || t.k === $('eq').value).map((t) => t.k));
  const ps = PROD ? profissionais(ms, ch).sort((a, b) => ordPt(semNomes() ? a.rotCat : a.nome, semNomes() ? b.rotCat : b.nome)) : [];
  $('prof').innerHTML =
    '<option value="">Todos</option>' +
    ps.map((o) => '<option value="' + esc(o.k) + '">' + esc(rotProf(o) + ($('eq').value ? '' : ' · ' + (o.e || o.u))) + '</option>').join('');
  $('prof').value = ps.some((o) => o.k === p0) ? p0 : '';
  $('lbProf').hidden = $('recorte').value !== 'profissional';
  $('lbIdent').hidden = !PROD;
}
function mostrarPeriodo() {
  const m = $('modo').value;
  $('lbMes').hidden = m !== 'mes';
  $('lbQuad').hidden = m !== 'quad';
  $('lbDe').hidden = $('lbAte').hidden = m !== 'intervalo';
}
function registrar(formato) {
  const ms = mesesDoPeriodo();
  if (!ms.length) return;
  fetch('/api/v1/relatorios/emissao', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tipo: 'producao',
      competencia: ms[ms.length - 1],
      formato,
      unidade: [$('recorte').value, ms[0] + (ms.length > 1 ? '..' + ms[ms.length - 1] : ''), $('un').value].filter(Boolean).join(' · '),
    }),
  }).catch(() => {});
}
function csv() {
  const lim = (s) => '"' + String(s).replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"';
  const linhas = [lim($('doc').querySelector('h1') ? $('doc').querySelector('h1').textContent : 'Produção e notas'), 'Período;' + lim(rotuloPeriodo(mesesDoPeriodo()))];
  $('doc')
    .querySelectorAll('.ebn b, h3, table.csv')
    .forEach((el) => {
      if (el.tagName === 'TABLE') el.querySelectorAll('tr').forEach((tr) => linhas.push([...tr.children].map((c) => lim(c.textContent)).join(';')));
      else {
        linhas.push('');
        linhas.push(lim(el.textContent));
      }
    });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'painel-aps-producao-' + $('recorte').value + '-' + mesesDoPeriodo().join('_') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function iniciar() {
  try {
    const e = await fetch('/api/v1/auth/eu', { credentials: 'same-origin' });
    if (e.status === 401) return void location.replace('/entrar');
    if (e.ok) USUARIO = (await e.json()).usuario || null;
  } catch (_) {}
  try {
    const r = await fetch('/api/v1/competencias', { credentials: 'same-origin' });
    COMPS = ((await r.json()).competencias || []).map((c) => c.competencia).sort().reverse();
  } catch (_) {}
  const opt = (c) => '<option value="' + c + '">' + mesLong(c) + '</option>';
  $('mes').innerHTML = COMPS.map(opt).join('');
  $('de').innerHTML = COMPS.slice().reverse().map(opt).join('');
  $('ate').innerHTML = COMPS.map(opt).join('');
  if (COMPS.length) $('de').value = COMPS[Math.min(COMPS.length - 1, 3)];
  $('quad').innerHTML = quadrimestres()
    .map((q) => '<option value="' + q.id + '">' + q.rot + '</option>')
    .join('');
  const q = new URLSearchParams(location.search);
  if (q.get('recorte') && [...$('recorte').options].some((o) => o.value === q.get('recorte'))) $('recorte').value = q.get('recorte');
  mostrarPeriodo();
  ['recorte', 'mes', 'quad', 'de', 'ate', 'prof', 'ident'].forEach((id) => $(id).addEventListener('change', desenhar));
  $('eq').addEventListener('change', () => {
    $('prof').value = '';
    desenhar();
  });
  if (!ehGestor()) $('recorte').querySelector('option[value=profissional]').remove();
  $('modo').addEventListener('change', () => {
    mostrarPeriodo();
    desenhar();
  });
  $('tipoEq').addEventListener('change', () => {
    $('eq').value = '';
    desenhar();
  });
  $('un').addEventListener('change', () => {
    $('eq').value = '';
    $('prof').value = '';
    desenhar();
  });
  $('imprimir').addEventListener('click', () => {
    registrar('pdf');
    window.print();
  });
  $('csv').addEventListener('click', () => {
    registrar('csv');
    csv();
  });
  if (!COMPS.length) return void ($('doc').innerHTML = '<p class="vazio">Ainda não há competências coletadas.</p>');
  desenhar();
}
iniciar();
