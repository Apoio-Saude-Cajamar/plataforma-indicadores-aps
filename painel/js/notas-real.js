// Camada de dados reais da tela de notas metodológicas: troca os valores de exemplo do desenho
// pelos totais coletados do PEC e-SUS (API /api/v1/dados). Só totais por equipe; nada identifica pessoas.
function montarREAL(porComp, ultimaColeta) {
  const TIPO = { ESF: 'eSF', EAP: 'eAP', ESB: 'eSB', EMULTI: 'eMulti', ECR: 'eCR' };
  const linhas = [];
  for (const [comp, ls] of Object.entries(porComp)) {
    const [ano, mes] = comp.split('-').map(Number),
      a = ano * 12 + mes - 1;
    for (const l of ls)
      linhas.push({
        cod: l.codigo,
        rec: l.recorte || 'situacao',
        u: l.unidade || 'Município',
        e: l.equipe || 'Município',
        t: TIPO[String(l.tipoEquipe || '').toUpperCase()] || null,
        a,
        num: l.numerador || 0,
        den: l.denominador || 0,
        pts: l.somaPontos || 0,
      });
  }
  const meses = [...new Set(linhas.map((l) => l.a))].sort((x, y) => x - y);
  // Nota do desenho -> códigos da coleta e forma de cálculo.
  const FONTE = {
    C1: ['pct'],
    C2: ['pts'],
    C3: ['pts'],
    C4: ['pts'],
    C5: ['pts'],
    C6: ['pts'],
    C7: ['c7'],
    B1: ['pct'],
    B2: ['pct'],
    B3: ['pct'],
    B4: ['pct'],
    B5: ['pct'],
    B6: ['pct'],
    M1: ['raz'],
    M2: ['pct'],
    'Q14.2.1': ['pct'],
    CR1: ['pct'],
    CR2: ['pts'],
    CR3: ['pts'],
    CR4: ['pts'],
    'CVAT-C': ['pct', 'CVAT-CAD'],
    'CVAT-A': ['pct', 'CVAT-ACO'],
  };
  const PESO_C7 = { A: 20, B: 30, C: 30, D: 20 };
  const codigos = (cod) => {
    const f = FONTE[cod];
    return !f ? [] : f[0] === 'c7' ? ['C7-A', 'C7-B', 'C7-C', 'C7-D'] : [f[1] || cod];
  };
  const porCod = {};
  linhas.forEach((l) => (porCod[l.cod] = porCod[l.cod] || []).push(l));
  // As eMulti atendem 3 a 4 unidades e se vinculam a várias equipes: não pertencem a uma unidade só.
  // Ficam num grupo próprio, e os registros delas contam pela equipe, em qualquer unidade.
  const EMULTI = 'eMulti (atendem várias unidades)';
  const nomesEmulti = new Set(linhas.filter((l) => l.t === 'eMulti' || /^M\d/.test(l.cod)).map((l) => l.e));
  const doLocal = (l, loc) =>
    !loc.u ||
    (loc.u === EMULTI
      ? nomesEmulti.has(l.e) && (!loc.e || l.e === loc.e)
      : l.u === loc.u && !nomesEmulti.has(l.e) && (!loc.e || l.e === loc.e));
  const escolhe = (cod, ls, ms) => {
    let rs = [];
    codigos(cod).forEach((c) =>
      (porCod[c] || []).forEach((l) => {
        if (ms.indexOf(l.a) >= 0 && ls.some((loc) => doLocal(l, loc))) rs.push(l);
      }),
    );
    // C2 e C3 contam pelo desfecho quando a coleta trouxe esse recorte; as demais, pela situação do mês.
    const desf = rs.filter((l) => l.rec === 'desfecho');
    return (cod === 'C2' || cod === 'C3') && desf.length ? desf : rs.filter((l) => l.rec !== 'desfecho');
  };
  const calcula = (cod, rs) => {
    if (!rs.length) return null;
    const k = FONTE[cod][0],
      S = (arr, c) => arr.reduce((t, l) => t + l[c], 0);
    if (k === 'c7') {
      let n = 0,
        tem = false;
      Object.keys(PESO_C7).forEach((x) => {
        const it = rs.filter((l) => l.cod === 'C7-' + x),
          d = S(it, 'den');
        if (d) {
          n += (S(it, 'num') / d) * PESO_C7[x];
          tem = true;
        }
      });
      return tem ? n : null;
    }
    const den = S(rs, 'den');
    if (!den) return null;
    return k === 'pts' ? S(rs, 'pts') / den : k === 'raz' ? S(rs, 'num') / den : (100 * S(rs, 'num')) / den;
  };
  const R = {
    meses,
    atual: meses[meses.length - 1],
    inicio: meses[0],
    ultima: ultimaColeta || '',
    temMes: (a) => meses.indexOf(a) >= 0,
    quadDe: (a) => Math.floor(a / 12) + '-' + (Math.floor((a % 12) / 4) + 1),
    tem: (n, loc) => codigos(n.cod).some((c) => (porCod[c] || []).some((l) => doLocal(l, loc))),
    // Valor da nota num conjunto de locais e meses, pela regra de apuração da própria nota.
    valor(n, ls, ms) {
      let com = ms.filter((a) => escolhe(n.cod, ls, [a]).length);
      if (!com.length) com = meses.filter((a) => escolhe(n.cod, ls, [a]).length);
      if (!com.length) return n.min;
      let v;
      if (n.apura === 'foto') v = calcula(n.cod, escolhe(n.cod, ls, [com[com.length - 1]]));
      else if (n.apura === 'razao') v = calcula(n.cod, escolhe(n.cod, ls, com));
      else {
        const vs = com.map((a) => calcula(n.cod, escolhe(n.cod, ls, [a]))).filter((x) => x != null);
        v = vs.length ? vs.reduce((t, x) => t + x, 0) / vs.length : null;
      }
      if (v == null || isNaN(v)) return n.min;
      // O valor não é cortado no teto da régua: uma equipe acima da escala mostra o número real, com o ponto no fim da régua.
      return +Math.max(n.min, v).toFixed(n.fmt);
    },
    // Texto da conta feita, com os totais do recorte (para o balão de informação).
    calculo(n, ls, ms) {
      let com = ms.filter((a) => escolhe(n.cod, ls, [a]).length);
      if (!com.length) com = meses.filter((a) => escolhe(n.cod, ls, [a]).length);
      const cat0 = (window.CATALOGO || {})[n.cod] || {};
      if (!com.length) return cat0.numerador ? ' Numerador: ' + cat0.numerador + '. Denominador: ' + cat0.denominador + '.' : '';
      const nf = (v, c) => v.toLocaleString('pt-BR', { minimumFractionDigits: c || 0, maximumFractionDigits: c || 0 });
      const S = (arr, c) => arr.reduce((t, l) => t + l[c], 0);
      const k = FONTE[n.cod][0];
      const conta = (rs) => {
        const v = calcula(n.cod, rs);
        if (v == null) return 'sem denominador';
        if (k === 'c7')
          return (
            Object.keys(PESO_C7)
              .map((x) => {
                const it = rs.filter((l) => l.cod === 'C7-' + x),
                  d = S(it, 'den');
                return d ? x + ': ' + nf(S(it, 'num')) + ' ÷ ' + nf(d) + ' × ' + PESO_C7[x] : null;
              })
              .filter(Boolean)
              .join(' + ') +
            ' = ' +
            nf(v, n.fmt)
          );
        if (k === 'pts') return 'soma dos pontos ' + nf(S(rs, 'pts')) + ' ÷ ' + nf(S(rs, 'den')) + ' pessoas = ' + nf(v, n.fmt);
        if (k === 'raz') return nf(S(rs, 'num')) + ' ÷ ' + nf(S(rs, 'den')) + ' = ' + nf(v, n.fmt);
        return nf(S(rs, 'num')) + ' ÷ ' + nf(S(rs, 'den')) + ' × 100 = ' + nf(v, n.fmt) + '%';
      };
      const mesTxt = (a) =>
        ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][a % 12] +
        '/' +
        String(Math.floor(a / 12)).slice(2);
      let t;
      if (com.length === 1 || n.apura === 'foto')
        t = conta(escolhe(n.cod, ls, [com[com.length - 1]])) + (com.length > 1 ? ' (foto de ' + mesTxt(com[com.length - 1]) + ')' : '');
      else if (n.apura === 'razao') t = conta(escolhe(n.cod, ls, com)) + ' (soma de ' + com.length + ' meses)';
      else
        t =
          'média de ' +
          com.length +
          ' meses: ' +
          com.map((a) => mesTxt(a) + ' ' + nf(calcula(n.cod, escolhe(n.cod, ls, [a])) || 0, n.fmt)).join('; ') +
          ' = ' +
          nf(R.valor(n, ls, ms), n.fmt);
      const cat = (window.CATALOGO || {})[n.cod] || {};
      const def = cat.numerador ? ' Numerador: ' + cat.numerador + '. Denominador: ' + cat.denominador + '.' : '';
      return def + ' Conta deste recorte: ' + t + '.';
    },
    pessoas(n, u, e) {
      const rs = escolhe(n.cod, [{ u, e }], [R.atual]);
      return Math.round(rs.reduce((t, l) => t + l.den, 0));
    },
    // Fica só o que a coleta trouxe; nada de números de exemplo.
    ajustar(lista) {
      return lista
        .filter((n) => FONTE[n.cod] && R.tem(n, { u: '', e: '' }))
        .map((n) => {
          const o = Object.assign({}, n);
          delete o.exemplo;
          delete o.prat;
          delete o.mun;
          delete o.ant;
          delete o.serie;
          if (o.cod === 'M2')
            Object.assign(o, {
              max: 100,
              un: '%',
              fmt: 1,
              f: [
                [0, 1, 'regular'],
                [1, 2.5, 'suficiente'],
                [2.5, 5, 'bom'],
                [5, 100, 'otimo'],
              ],
              sentido:
                'Percentual de ações compartilhadas. As faixas da NT 44/2026 (1; 2,5; 5) foram lidas como percentual: confira com a referência técnica.',
            });
          // CVAT: a régua do índice (0 a 100) segue a NT 30/2025: Regular < 45, Suficiente 45 a 65, Bom 65 a 85, Ótimo > 85.
          // Satisfação (Meu SUS Digital) fica fora, por decisão da gestão: os escores são os da nota, sem o bônus.
          if (o.cod === 'CVAT-C' || o.cod === 'CVAT-A')
            Object.assign(o, {
              max: 100,
              un: '%',
              fmt: 1,
              f: [
                [0, 45, 'regular'],
                [45, 65, 'suficiente'],
                [65, 85, 'bom'],
                [85, 100, 'otimo'],
              ],
              sentido:
                o.cod === 'CVAT-C'
                  ? 'Índice de cadastro (0 a 100). Escore da nota: Ótimo 3,00; Bom 2,25; Suficiente 1,50; Regular 0,75.'
                  : 'Índice de acompanhamento (0 a 100), sem o bônus de satisfação. Escore da nota: Ótimo 7,00; Bom 5,25; Suficiente 3,50; Regular 1,75.',
            });
          return o;
        });
    },
  };
  const soltas = (e) => e === 'Município' || /^sem equipe$/i.test(e);
  R.unidades = [...new Set(linhas.map((l) => l.u))].filter((u) => u !== 'Município').sort((x, y) => x.localeCompare(y, 'pt'));
  if (nomesEmulti.size) R.unidades.push(EMULTI);
  const GRUPO = (c) => (/^B\d/.test(c) ? 'eSB' : /^M\d/.test(c) ? 'eMulti' : /^CR\d/.test(c) ? 'eCR' : null);
  R.equipesDa = (u) => {
    if (u === EMULTI)
      return [...nomesEmulti]
        .filter((e) => !soltas(e))
        .sort((x, y) => x.localeCompare(y, 'pt'))
        .map((nome) => ({ nome, tipo: 'eMulti' }));
    const m = new Map();
    linhas
      .filter((l) => l.u === u && !soltas(l.e) && !nomesEmulti.has(l.e))
      .forEach((l) => {
        const o = m.get(l.e) || { nome: l.e, tipo: null, g: null };
        o.tipo = o.tipo || l.t;
        o.g = o.g || GRUPO(l.cod);
        m.set(l.e, o);
      });
    return [...m.values()].map((o) => ({ nome: o.nome, tipo: o.tipo || o.g || 'eSF' })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt'));
  };
  R.todasEquipes = () => {
    const out = [];
    R.unidades
      .concat(['Município'])
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .forEach((u) => R.equipesDa(u).forEach((e) => out.push({ id: u + '|' + e.nome, u, nome: e.nome, tipo: e.tipo })));
    return out;
  };
  R.quadAtual = R.quadDe(R.atual);
  R.quads = [...new Set(meses.map(R.quadDe))];
  return R;
}
