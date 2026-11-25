// Painel APS · relatório (estadual, absenteísmo e visão geral). Script comum: usa as funções e dados declarados nos outros arquivos relatorio-*.js.
// ---------- estadual ----------
function secEstadual() {
  if (ERRO) return '<h2>Cofinanciamento estadual</h2><p class="vazio">Não foi possível carregar os lançamentos.</p>';
  const c = calcular(),
    pontos = c.res.reduce((t, r) => t + (r.pct === null ? 0 : r.peso * r.pct), 0),
    pend = c.linhas.filter((x) => x.r.pct === null);
  const n = c.linhas.length - pend.length;
  let h =
    '<h2>Cofinanciamento estadual · ' +
    esc(parcela.n) +
    '</h2><p>Parte variável do IGM SUS Paulista (CIB 150/2025). Período avaliado: ' +
    NOMEQ(parcela.p) +
    ', comparado com o ' +
    NOMEQ(parcela.ant) +
    '. Só entram na nota os valores oficiais lançados; a estimativa do PEC aparece ao lado, separada.</p>';
  h +=
    '<div class="cards"><div class="card"><small>Nota da parte variável</small><div class="v">' +
    num(c.nota.final * 100, 1) +
    '%</div><small>' +
    num(pontos, 2) +
    ' de 10 pontos' +
    (c.nota.extra ? ' + ponto extra' : '') +
    '</small></div>' +
    '<div class="card"><small>Indicadores com dado</small><div class="v">' +
    n +
    ' de ' +
    c.linhas.length +
    '</div><small>' +
    (pend.length
      ? 'Faltam lançar: peso ' +
        num(
          pend.reduce((t, x) => t + x.it.peso, 0),
          1,
        ) +
        ' de 10'
      : 'Todos com dado') +
    '</small></div></div>';
  h +=
    '<table class="csv"><thead><tr><th>Indicador</th><th class="n">Peso</th><th>Valor</th><th>Comparação</th><th>Resultado</th><th class="n">Pontos</th></tr></thead><tbody>' +
    c.linhas
      .map(
        (x) =>
          '<tr><td>' +
          esc(x.it.nome) +
          (x.d.origem ? '<small>Origem: ' + esc(x.d.origem) + '</small>' : '') +
          '</td><td class="n">' +
          num(x.it.peso, 1) +
          '</td><td>' +
          mostra(x.it, x.d) +
          '</td><td>' +
          ref(x.it, x.d) +
          '</td><td>' +
          (x.r.pct === null ? 'sem dado' : Math.round(x.r.pct * 100) + '%') +
          '<small>' +
          esc(dica(x)) +
          '</small></td><td class="n">' +
          (x.r.pct === null ? '—' : num(x.it.peso * x.r.pct, 2)) +
          '</td></tr>',
      )
      .join('') +
    '<tr><td><b>Óbito materno no ano</b></td><td class="n">—</td><td colspan="4">' +
    (c.ob ? (c.ob.valor === 0 ? 'sem óbito materno informado' : 'com óbito materno informado') : 'não lançado') +
    '</td></tr></tbody></table>';
  return h;
}

// ---------- absenteísmo e filas ----------
function secAbsenteismo(comp, un) {
  let h =
    '<h2>Absenteísmo e filas</h2><p>Absenteísmo = faltas ÷ (atendimentos + faltas). Meta de referência do Q14.2.1: até ' +
    num(Q14, 2) +
    '%.</p>';
  const ls = linhasDe('Q14.2.1', [comp], un);
  if (ls.length) {
    const mun = agregar(ls, () => 'M').get('Q14.2.1|M'),
      v = resultado(mun, 'percentual');
    h +=
      '<div class="cards"><div class="card"><small>Absenteísmo de consultas</small><div class="v">' +
      pct(v) +
      '</div><small>' +
      num(mun.num, 0) +
      ' faltas em ' +
      num(mun.den, 0) +
      ' agendamentos decididos</small></div>' +
      '<div class="card"><small>Referência</small><div class="v">' +
      num(Q14, 2) +
      '%</div><small>' +
      (v == null ? '' : v <= Q14 ? 'dentro da meta' : 'acima da meta') +
      '</small></div></div>';
    const por = agregar(ls, (l) => l.unidade),
      uns = [...new Set(ls.map((l) => l.unidade))].sort();
    if (!un && uns.length > 1)
      h +=
        '<h3>Por unidade</h3><table class="csv"><thead><tr><th>Unidade</th><th class="n">Faltas</th><th class="n">Agendamentos</th><th class="n">Absenteísmo</th><th>Meta</th></tr></thead><tbody>' +
        uns
          .map((u) => {
            const g = por.get('Q14.2.1|' + u),
              r = g ? resultado(g, 'percentual') : null;
            return (
              '<tr><td>' +
              esc(u) +
              '</td><td class="n">' +
              num(g.num, 0) +
              '</td><td class="n">' +
              num(g.den, 0) +
              '</td><td class="n"><b>' +
              pct(r) +
              '</b></td><td>' +
              (r == null ? '—' : r <= Q14 ? 'dentro' : 'acima') +
              '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table>';
    const eqs = agregar(ls, (l) => l.unidade + ' · ' + l.equipe);
    h +=
      '<h3>Por equipe</h3><table class="csv"><thead><tr><th>Equipe</th><th class="n">Faltas</th><th class="n">Agendamentos</th><th class="n">Absenteísmo</th></tr></thead><tbody>' +
      [...eqs.values()]
        .filter((g) => g.codigo === 'Q14.2.1')
        .sort((a, b) => a.rot.localeCompare(b.rot))
        .map((g) => {
          const r = resultado(g, 'percentual');
          return (
            '<tr><td>' +
            esc(g.rot) +
            '</td><td class="n">' +
            num(g.num, 0) +
            '</td><td class="n">' +
            num(g.den, 0) +
            '</td><td class="n"><b>' +
            pct(r) +
            '</b></td></tr>'
          );
        })
        .join('') +
      '</tbody></table>';
  } else h += '<p class="vazio">Sem o indicador Q14.2.1 nesta competência.</p>';
  // faltas por categoria profissional e tipo (relatório gerencial de absenteísmo)
  const ab = (ABS[comp] || []).filter((x) => !un || x.unidade === un);
  if (ab.length) {
    const g = {};
    for (const x of ab) {
      const k = (x.grupoCBO || x.cbo || 'Outros') + '|' + x.tipoFalta;
      g[k] = (g[k] || 0) + (x.n || 0);
    }
    const grupos = [...new Set(ab.map((x) => x.grupoCBO || x.cbo || 'Outros'))].sort(),
      tipos = [...new Set(ab.map((x) => x.tipoFalta))].sort();
    h +=
      '<h3>Agendamentos por categoria profissional e situação</h3><table class="csv"><thead><tr><th>Categoria</th>' +
      tipos.map((t) => '<th class="n">' + esc(t) + '</th>').join('') +
      '<th class="n">Total</th></tr></thead><tbody>' +
      grupos
        .map((gr) => {
          const t = tipos.map((tp) => g[gr + '|' + tp] || 0);
          return (
            '<tr><td>' +
            esc(gr) +
            '</td>' +
            t.map((v) => '<td class="n">' + num(v, 0) + '</td>').join('') +
            '<td class="n"><b>' +
            num(
              t.reduce((a, b) => a + b, 0),
              0,
            ) +
            '</b></td></tr>'
          );
        })
        .join('') +
      '</tbody></table>';
  }
  // filas por equipe (sem nomes de profissionais)
  if (!ehGestor()) h += '<h3>Filas e faltas por equipe</h3><p class="vazio">Esta parte é restrita a administradores e gestores.</p>';
  else if (!FILAS || !FILAS.profissionais || !FILAS.profissionais.length)
    h += '<h3>Filas e faltas por equipe</h3><p class="vazio">Sem dados de filas e faltas para esta competência.</p>';
  else {
    const gq = {};
    for (const p of FILAS.profissionais) {
      if (un && p.unidade !== un) continue;
      const k = p.unidade + '|' + (p.equipe || 'Sem equipe');
      (gq[k] = gq[k] || { un: p.unidade, eq: p.equipe || 'Sem equipe', f: 0, a: 0, d: [], prof: 0, semAg: 0 }).prof++;
      const o = gq[k];
      o.f += p.faltas || 0;
      o.a += p.atendimentos || 0;
      if (p.agendaLidaEm) o.d.push(p.semVaga ? 91 : p.diasVaga);
      else o.semAg++;
    }
    const c1 = agregar(linhasDe('C1', [comp], un), (l) => l.unidade + '|' + (l.equipe || 'Sem equipe'));
    h +=
      '<h3>Filas e faltas por equipe (médicos, enfermeiros e cirurgiões-dentistas)</h3><p>Faltas e espera por equipe, ao lado da C1 (parcela de consultas de demanda programada). Espera = mediana de dias até a próxima vaga dos profissionais com agenda lida. Não há nomes de profissionais neste documento.</p>' +
      '<table class="csv"><thead><tr><th>Equipe</th><th class="n">Prof.</th><th class="n">Faltas</th><th class="n">Absenteísmo</th><th>Faltas (risco: meta)</th><th class="n">Espera (mediana)</th><th>Espera (dias)</th><th class="n">C1 programada</th></tr></thead><tbody>' +
      Object.values(gq)
        .sort((a, b) => (a.un + a.eq).localeCompare(b.un + b.eq, 'pt'))
        .map((o) => {
          const r = o.f + o.a ? (o.f / (o.f + o.a)) * 100 : null,
            m = med(o.d),
            g = c1.get('C1|' + o.un + '|' + o.eq);
          return (
            '<tr><td>' +
            esc(o.eq) +
            '<small>' +
            esc(o.un) +
            '</small></td><td class="n">' +
            o.prof +
            '</td><td class="n">' +
            num(o.f, 0) +
            ' de ' +
            num(o.f + o.a, 0) +
            '</td><td class="n"><b>' +
            pct(r) +
            '</b></td><td>' +
            barra(r, 40, Q14, r == null ? '#8A979F' : r <= Q14 ? '#2F9E6E' : '#D64545') +
            '</td><td class="n">' +
            (m == null ? 'agenda não lida' : m > 90 ? '90+ dias' : m + ' d') +
            '</td><td>' +
            barra(m, 60, 30, m == null ? '#8A979F' : m <= 15 ? '#2F9E6E' : m <= 30 ? '#E3B341' : '#D64545') +
            '</td><td class="n">' +
            (g && g.den ? pct((100 * g.num) / g.den) : '—') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table>';
  }
  return h;
}

// ---------- visão geral ----------
function secGeral(comp, un) {
  const todas = (dados[comp] || []).filter((l) => !un || l.unidade === un);
  const uns = new Set(todas.map((l) => l.unidade).filter((u) => u && u !== 'Município')),
    eqs = new Set(todas.filter((l) => l.equipe && l.equipe !== 'Município').map((l) => l.unidade + '|' + l.equipe));
  const tot = { o: 0, b: 0, s: 0, r: 0 };
  for (const cod of NOTAS) {
    const ls = linhasDe(cod, [comp], un);
    if (!ls.length) continue;
    const cat = (window.CATALOGO || {})[cod] || { tipo: '' };
    [...agregar(ls, (l) => l.unidade + ' · ' + l.equipe).values()]
      .filter((g) => g.codigo === cod)
      .forEach((g) => {
        const k = conceito(cod, resultado(g, cat.tipo));
        if (k) tot[k]++;
      });
  }
  const nt = tot.o + tot.b + tot.s + tot.r;
  let h =
    '<h2>Resumo</h2><div class="cards">' +
    '<div class="card"><small>Cobertura da coleta</small><div class="v">' +
    uns.size +
    ' unid.</div><small>' +
    eqs.size +
    ' equipe(s) com dados</small></div>' +
    (nt
      ? '<div class="card"><small>Conceitos federais (prévia)</small><div class="v">' +
        nt +
        '</div><small>' +
        ['o', 'b', 's', 'r'].map((k) => tot[k] + ' ' + NOMEC[k].toLowerCase()).join(' · ') +
        '</small></div>'
      : '');
  const q = linhasDe('Q14.2.1', [comp], un);
  if (q.length) {
    const m = agregar(q, () => 'M').get('Q14.2.1|M'),
      v = resultado(m, 'percentual');
    h +=
      '<div class="card"><small>Absenteísmo de consultas</small><div class="v">' +
      pct(v) +
      '</div><small>meta: até ' +
      num(Q14, 2) +
      '%</small></div>';
  }
  if (!ERRO && LANC.length) {
    const c = calcular();
    h +=
      '<div class="card"><small>Nota estadual · ' +
      esc(parcela.n) +
      '</small><div class="v">' +
      num(c.nota.final * 100, 1) +
      '%</div><small>' +
      (c.nota.completo ? 'todos os itens com dado' : 'parcial: faltam itens') +
      '</small></div>';
  }
  h += '</div>';
  const t = tabelaCods(
    ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'CVAT', 'B1', 'B3', 'B4', 'B5', 'B6', 'M1', 'M2', 'CR1', 'CR2', 'CR3', 'CR4'],
    comp,
    un,
    false,
  );
  if (t) h += '<h3>Principais indicadores federais</h3>' + t;
  return h;
}
