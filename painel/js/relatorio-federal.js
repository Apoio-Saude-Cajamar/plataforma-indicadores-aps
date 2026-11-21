// Painel APS · relatório (indicadores federais e acompanhamento municipal). Script comum: usa as funções e dados declarados nos outros arquivos relatorio-*.js.
// ---------- federal e municipal ----------
// Indicador "filho" (C7-A…D, CVAT-CAD/ACO): recuado sob o indicador principal.
const fil = (cod) => (/^(C7|CVAT)-/.test(cod) ? ' class="filho"' : '');
function tabelaCods(cods, comp, un, comEquipes) {
  let corpo = '';
  for (const cod of cods) {
    const ls = linhasDe(cod, [comp], un);
    if (!ls.length) continue;
    const cat = (window.CATALOGO || {})[cod] || { nome: cod, tipo: '' };
    const mun = agregar(ls, () => 'M').get(cod + '|M');
    if (!mun) continue;
    const vm = resultado(mun, cat.tipo);
    let km = conceito(cod, vm),
      porEquipe = false;
    let eq = '';
    if (comEquipes && FAIXA[cod]) {
      const c = { o: 0, b: 0, s: 0, r: 0 };
      let n = 0;
      [...agregar(ls, (l) => l.unidade + ' · ' + l.equipe).values()]
        .filter((g) => g.codigo === cod)
        .forEach((g) => {
          const k = conceito(cod, resultado(g, cat.tipo));
          if (k) {
            c[k]++;
            n++;
          }
        });
      porEquipe = n > 1;
      eq = n
        ? ['o', 'b', 's', 'r']
            .filter((k) => c[k])
            .map((k) => c[k] + ' ' + NOMEC[k].toLowerCase())
            .join(' · ')
        : '';
    }
    const direto = mun.direto !== undefined;
    const nu = direto ? '—' : cat.tipo === 'pontos' ? num(mun.pts, 0) : num(mun.num, 0),
      de = direto ? '—' : num(mun.den, 0);
    const aprox = cat.precisao === 'aproximado' ? ' ≈' : cat.precisao === 'piso' ? ' (piso)' : '';
    corpo +=
      '<tr' +
      fil(cod) +
      '><td><b>' +
      esc(cod) +
      '</b> · ' +
      esc(nomeSem(cod, cat.nome)) +
      (cat.meta ? '<small>Meta: ' + esc(cat.meta) + '</small>' : '') +
      '</td><td class="n">' +
      nu +
      '</td><td class="n">' +
      de +
      '</td><td class="n"><b>' +
      fmt(vm, cat.tipo) +
      '</b>' +
      aprox +
      '</td><td>' +
      (porEquipe ? '<small>por equipe →</small>' : kpill(km) + (km && FAIXAX[cod] ? ' *' : '')) +
      '</td>' +
      (comEquipes ? '<td>' + esc(eq) + '</td>' : '') +
      '</tr>';
  }
  return corpo
    ? '<table class="csv"><thead><tr><th>Indicador</th><th class="n">Numerador (ou pontos)</th><th class="n">Denominador</th><th class="n">Resultado</th><th>Conceito</th>' +
        (comEquipes ? '<th>Equipes por conceito</th>' : '') +
        '</tr></thead><tbody>' +
        corpo +
        '</tbody></table>'
    : '';
}
function secFederal(comp, un) {
  let h =
    '<h2>Cofinanciamento federal</h2><p>Indicadores das notas metodológicas do Ministério da Saúde, a partir dos totais coletados do PEC e-SUS no mês. O conceito é uma prévia para acompanhar as equipes; o resultado oficial é o do Ministério.</p>';
  let algum = false;
  for (const [gn, gc] of GRUPOS.slice(0, -1)) {
    const t = tabelaCods(gc, comp, un, true);
    if (t) {
      algum = true;
      h += '<h3>' + esc(gn) + '</h3>' + t;
    }
  }
  if (!algum) h += '<p class="vazio">Sem indicadores coletados nesta competência.</p>';
  if (Object.keys(FAIXAX).some((c) => (dados[comp] || []).some((l) => l.codigo === c)))
    h += '<p><small>* Faixa lida do desenho do dashboard, ainda a confirmar com a nota técnica vigente.</small></p>';
  // por unidade
  if (!un) {
    const uns = [...new Set((dados[comp] || []).map((l) => l.unidade).filter((u) => u && u !== 'Município'))].sort();
    if (uns.length > 1) {
      const cods = NOTAS.filter((c) => linhasDe(c, [comp], '').length);
      // Unidades nas linhas e indicadores nas colunas, em blocos de até 10 colunas (todas de uma vez na folha em paisagem).
      const nomeCurto = (u) => u.replace(/^(UBS|ESF|Psf|Usf|Posto de Saude)\s+(Enf(?:ermeiro)?\.?\s+|Dra?\s+|Vereador\s+)?/i, '');
      let t = '';
      const passo = $('orient').value === 'paisagem' ? cods.length : 10;
      for (let i = 0; i < cods.length; i += passo) {
        const bloco = cods.slice(i, i + passo);
        t +=
          '<table class="csv un"><thead><tr><th>Unidade</th>' +
          bloco.map((c) => '<th class="n">' + esc(c) + '</th>').join('') +
          '</tr></thead><tbody>' +
          uns
            .map(
              (u) =>
                '<tr><td>' +
                esc(nomeCurto(u)) +
                '</td>' +
                bloco
                  .map((cod) => {
                    const cat = (window.CATALOGO || {})[cod] || { tipo: '' };
                    const g = agregar(linhasDe(cod, [comp], ''), (l) => l.unidade).get(cod + '|' + u);
                    const v = g ? resultado(g, cat.tipo) : null;
                    const dU = distEquipes(cod, linhasDe(cod, [comp], u), cat.tipo),
                      k = dU.n > 1 ? null : conceito(cod, v);
                    // Unidade com várias equipes: o valor é o agregado e as letras contam as equipes (ex.: 1B 2R).
                    const letras = ['o', 'b', 's', 'r']
                      .filter((x) => dU.c[x])
                      .map((x) => '<span class="cc k-' + x + '">' + dU.c[x] + NOMEC[x].charAt(0) + '</span>')
                      .join(' ');
                    return (
                      '<td class="n">' +
                      fmt(v, cat.tipo) +
                      (dU.n > 1 ? ' ' + letras : k ? ' <span class="cc k-' + k + '">' + NOMEC[k].charAt(0) + '</span>' : '') +
                      '</td>'
                    );
                  })
                  .join('') +
                '</tr>',
            )
            .join('') +
          '</tbody></table>';
      }
      h +=
        '<h3>Resultado por unidade</h3>' +
        t +
        '<p><small>Conceito: O = ótimo, B = bom, S = suficiente, R = regular. Em unidades com mais de uma equipe, o valor é o agregado e as letras contam as equipes (1B 2R = uma equipe em Bom e duas em Regular). Colunas vazias de conceito: indicador sem faixa definida.</small></p>';
    }
  }
  return h;
}
function secMunicipal(comp, un) {
  const g = GRUPOS[GRUPOS.length - 1];
  const t = tabelaCods(g[1], comp, un, false);
  return (
    '<h2>Acompanhamento municipal</h2><p>Indicadores acompanhados pelo município, fora do cofinanciamento federal.</p>' +
    (t || '<p class="vazio">Sem dados coletados nesta competência.</p>')
  );
}
