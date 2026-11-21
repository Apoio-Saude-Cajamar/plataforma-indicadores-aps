// Painel APS · relatório (réguas de conceito). Script comum: usa as funções e dados declarados nos outros arquivos relatorio-*.js.
// ---------- réguas ----------
function faixasDe(cod) {
  const t = FAIXA[cod];
  if (t === 'bp')
    return [
      [0, 25, 'r'],
      [25, 50, 's'],
      [50, 75, 'b'],
      [75, 100, 'o'],
    ];
  if (t === 'cvat')
    return [
      [0, 5, 'r'],
      [5, 7, 's'],
      [7, 8.5, 'b'],
      [8.5, 10, 'o'],
    ];
  if (t === 'm1')
    return [
      [0, 1, 'r'],
      [1, 2, 's'],
      [2, 3, 'b'],
      [3, 5, 'o'],
    ];
  if (t === 'x' && FAIXAX[cod]) return FAIXAX[cod].map((x) => x.slice());
  return null;
}
function reguaHtml(cod, vm, o) {
  o = o || {};
  const vals = (o.vals || []).filter((v) => v != null),
    ref = o.ref;
  const f = faixasDe(cod);
  if (!f || vm == null) return '';
  const todos = [vm].concat(vals);
  const lo = f[0][0];
  let hi = f[f.length - 1][1];
  // Faixa aberta (sem teto): a régua acaba em 2,5 vezes o início dela (no máximo 100 nos percentuais); valores maiores ficam no fim da régua.
  const aberta = hi >= 1e8;
  if (aberta) {
    const base = f[f.length - 1][0];
    hi = base * 2.5;
    if (FAIXAX[cod] && cod !== 'B1' && cod !== 'B4') hi = Math.min(100, hi);
  }
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const seg = f.map((x) => ({ a: Math.max(lo, x[0]), b: Math.min(hi, x[1]), k: x[2] })).filter((x) => x.b > x.a);
  let h =
    '<div class="rg" role="img" aria-label="Régua do indicador ' +
    esc(cod) +
    '">' +
    seg
      .map(
        (x) =>
          '<div class="sg k-' +
          x.k +
          '" style="width:' +
          (((x.b - x.a) / (hi - lo)) * 100).toFixed(2) +
          '%">' +
          ((x.b - x.a) / (hi - lo) > 0.14 ? NOMEC[x.k] : (x.b - x.a) / (hi - lo) > 0.05 ? NOMEC[x.k][0] : '') +
          '</div>',
      )
      .join('');
  let marcas = [lo].concat(
    seg.slice(1).map((x) => x.a),
    [hi],
  );
  marcas = marcas.filter((m, i) => i === 0 || i === marcas.length - 1 || (pos(m) - pos(marcas[i - 1]) >= 7 && pos(hi) - pos(m) >= 7));
  h += marcas
    .map(
      (m, i) =>
        '<span class="tk" style="left:' +
        pos(m).toFixed(2) +
        '%;' +
        (i === 0 ? 'transform:none' : i === marcas.length - 1 ? 'transform:translateX(-100%)' : '') +
        '">' +
        num(m, m % 1 ? 2 : 0) +
        (aberta && i === marcas.length - 1 ? '+' : '') +
        '</span>',
    )
    .join('');
  if (vals.length > 1) {
    const mn = Math.min.apply(null, vals),
      mx = Math.max.apply(null, vals);
    h += '<i class="rng" style="left:' + pos(mn).toFixed(2) + '%;width:' + Math.max(0.8, pos(mx) - pos(mn)).toFixed(2) + '%"></i>';
  }
  if (ref != null) h += '<i class="rf" style="left:' + pos(ref).toFixed(2) + '%"></i>';
  h += '<i class="mn" style="left:' + pos(vm).toFixed(2) + '%"></i></div>';
  return h;
}
const legRegua = (eqs) =>
  '<div class="leg"><span><i class="k-r"></i>Regular</span><span><i class="k-s"></i>Suficiente</span><span><i class="k-b"></i>Bom</span><span><i class="k-o"></i>Ótimo</span>' +
  (eqs
    ? '<span><i style="background:#1F3C72"></i>Município</span><span><i style="background:rgba(20,33,43,.55);height:6px;vertical-align:2px"></i>Variação entre as equipes (menor a maior)</span>'
    : '<span><i style="background:#1F3C72"></i>Esta equipe</span><span><i style="background:#fff;border:3px solid #1F3C72;box-sizing:border-box"></i>Município (referência)</span>') +
  '</div>';
// Régua do município, uma página por grupo de indicadores; a faixa escura mostra de onde a onde as equipes variam.
function secRegua(comp, un) {
  let out = '',
    csvl = '',
    n = 0,
    primeiro = true;
  for (const [gn, gc] of GRUPOS.slice(0, -1)) {
    let sub = '';
    for (const cod of gc) {
      if (!faixasDe(cod)) continue;
      const ls = linhasDe(cod, [comp], un);
      if (!ls.length) continue;
      const cat = (window.CATALOGO || {})[cod] || { nome: cod, tipo: '' };
      const mun = agregar(ls, () => 'M').get(cod + '|M');
      if (!mun) continue;
      const vm = resultado(mun, cat.tipo),
        km = conceito(cod, vm);
      const eqs = [...agregar(ls, (l) => l.unidade + ' · ' + l.equipe).values()]
        .filter((g) => g.codigo === cod)
        .map((g) => resultado(g, cat.tipo))
        .filter((v) => v != null);
      const dEq = distEquipes(cod, ls, cat.tipo);
      const reg = reguaHtml(cod, vm, { vals: eqs });
      if (!reg) continue;
      n++;
      const faixa =
        eqs.length > 1
          ? '<span>equipes: de ' +
            fmt(Math.min.apply(null, eqs), cat.tipo) +
            ' a ' +
            fmt(Math.max.apply(null, eqs), cat.tipo) +
            ' (' +
            eqs.length +
            ')</span>'
          : '<span>' + eqs.length + ' equipe(s)</span>';
      sub +=
        '<div class="reg"><div class="nm"><b>' +
        esc(cod) +
        '</b> · ' +
        esc(nomeSem(cod, cat.nome)) +
        '<div class="vl"><b>' +
        fmt(vm, cat.tipo) +
        '</b>' +
        (eqs.length > 1 && dEq.n > 1 ? kpillDist(dEq) : kpill(km)) +
        (FAIXAX[cod] ? '*' : '') +
        faixa +
        '</div></div><div>' +
        reg +
        '</div></div>';
      csvl +=
        '<tr><td>' +
        esc(gn) +
        '</td><td>' +
        esc(cod) +
        '</td><td>' +
        esc(nomeSem(cod, cat.nome)) +
        '</td><td>' +
        fmt(vm, cat.tipo) +
        '</td><td>' +
        (km ? NOMEC[km] : '') +
        '</td><td>' +
        eqs.map((v) => fmt(v, cat.tipo)).join(' | ') +
        '</td></tr>';
    }
    if (sub) {
      out +=
        '<section class="pag"><h2>' +
        (primeiro ? 'Cofinanciamento federal · réguas · ' : '') +
        esc(gn) +
        '</h2>' +
        (primeiro
          ? '<p>Cada régua mostra as faixas de conceito do indicador. O marcador azul é o município' +
            (un ? ' (recorte: ' + esc(un) + ')' : '') +
            ' e a faixa escura mostra de onde a onde as equipes variam. Só aparecem os indicadores com faixa definida; cada grupo começa numa página.</p>'
          : '') +
        legRegua(true) +
        sub +
        '</section>';
      primeiro = false;
    }
  }
  if (!n) return '<h2>Cofinanciamento federal · réguas</h2><p class="vazio">Sem indicadores com faixa definida nesta competência.</p>';
  out +=
    '<table class="csv so-csv"><thead><tr><th>Grupo</th><th>Código</th><th>Indicador</th><th>Município</th><th>Conceito</th><th>Equipes</th></tr></thead><tbody>' +
    csvl +
    '</tbody></table>';
  if (Object.keys(FAIXAX).some((c) => faixasDe(c) && (dados[comp] || []).some((l) => l.codigo === c)))
    out += '<p><small>* Faixa lida do desenho do dashboard, ainda a confirmar com a nota técnica vigente.</small></p>';
  return out;
}
