// Prévia do repasse federal da APS (componente de Qualidade). Funções puras, usadas pela aba "Prévia do repasse" de /indicadores.
// Fontes: Nota Técnica nº 6/2025-DEAPS/SAPS/MS (pesos, pontos por conceito e faixas da nota final) e Portaria GM/MS nº 3.493/2024
// (valores mensais por equipe e conceito, Anexo III). O resultado oficial é o do Ministério (Siaps).
const REPASSE = {
  // Pontos de cada conceito no cálculo da nota final.
  pontos: { r: 0.25, s: 0.5, b: 0.75, o: 1 },
  // Pesos por indicador (soma 10 em cada tipo de equipe).
  pesos: {
    esf: { C1: 1, C2: 2, C3: 2, C4: 1, C5: 1, C6: 1, C7: 2 },
    esb: { B1: 2, B2: 2, B3: 2, B4: 2, B5: 1, B6: 1 },
    emulti: { M1: 6, M2: 4 },
  },
  // Valor mensal por equipe, na ordem [Ótimo, Bom, Suficiente, Regular] (R$).
  valores: {
    esf: { nome: 'eSF 40 h', v: [8000, 6000, 4000, 2000] },
    eap30: { nome: 'eAP 30 h', v: [4000, 3000, 2000, 1000] },
    eap20: { nome: 'eAP 20 h', v: [3000, 2250, 1500, 750] },
    esb: { nome: 'eSB I comum', v: [2449, 1836.75, 1224.5, 612.25] },
    emultiAmp: { nome: 'eMulti ampliada', v: [9000, 6750, 4500, 2250] },
    emultiCom: { nome: 'eMulti complementar', v: [6000, 4500, 3000, 1500] },
    emultiEst: { nome: 'eMulti estratégica', v: [3000, 2250, 1500, 750] },
  },
};
const ORDEM_CLASSE = ['o', 'b', 's', 'r'];
// Nota final: Ótimo > 7,5; Bom de 5 a 7,5; Suficiente > 2,5 e < 5; Regular ≤ 2,5.
function classeDaNota(n) {
  return n > 7.5 ? 'o' : n >= 5 ? 'b' : n > 2.5 ? 's' : 'r';
}
// Grupo de pesos e chave de valor de uma equipe, pelo tipo e pelo nome (eMulti: complementar, estratégica ou ampliada; eAP: 30 h se o nome disser).
function tipoRepasse(tipoEquipe, nome) {
  const t = String(tipoEquipe || '').toUpperCase(),
    n = String(nome || '');
  if (t === 'ESF') return { pesos: 'esf', valor: 'esf' };
  if (t === 'EAP') return { pesos: 'esf', valor: /30\s*h/i.test(n) ? 'eap30' : 'eap20' };
  if (t === 'ESB') return { pesos: 'esb', valor: 'esb' };
  if (t === 'EMULTI')
    return { pesos: 'emulti', valor: /estrat/i.test(n) ? 'emultiEst' : /ampli/i.test(n) ? 'emultiAmp' : 'emultiCom' };
  return null; // eCR e outros: sem valor de qualidade nem pesos publicados nesta prévia
}
// classes: { cod: 'o'|'b'|'s'|'r'|null }. Indicador sem conceito entra como Regular na nota mínima e como Ótimo na máxima.
function notaEquipe(grupoPesos, classes) {
  const pesos = REPASSE.pesos[grupoPesos];
  let min = 0,
    max = 0;
  const faltam = [];
  for (const [cod, w] of Object.entries(pesos)) {
    const k = classes[cod];
    if (k) {
      min += w * REPASSE.pontos[k];
      max += w * REPASSE.pontos[k];
    } else {
      faltam.push(cod);
      min += w * REPASSE.pontos.r;
      max += w * REPASSE.pontos.o;
    }
  }
  return { min, max, faltam, completa: !faltam.length, cmin: classeDaNota(min), cmax: classeDaNota(max) };
}
function valorMensal(chaveValor, classe) {
  return REPASSE.valores[chaveValor].v[ORDEM_CLASSE.indexOf(classe)];
}
// Quadrimestre (jan–abr, mai–ago, set–dez) de uma competência 'AAAA-MM' e os quatro meses em que o incentivo dele é pago (NT 6/2025: "pago nos quatro meses seguintes").
function quadrimestreRepasse(comp) {
  const [a, m] = comp.split('-').map(Number),
    ini = Math.floor((m - 1) / 4) * 4 + 1,
    fim = ini + 3,
    soma = (ano, mes, n) => {
      const t = ano * 12 + (mes - 1) + n;
      return { a: Math.floor(t / 12), m: (t % 12) + 1 };
    },
    c = (x) => x.a + '-' + String(x.m).padStart(2, '0'),
    pg = soma(a, fim, 1);
  return {
    meses: [0, 1, 2, 3].map((i) => c({ a, m: ini + i })),
    pagoDe: c(pg),
    pagoAte: c(soma(pg.a, pg.m, 3)),
  };
}
// Menor nota (múltipla de 0,25) de cada classe, e a classe vizinha: medem quanto falta para subir e quanto sobra antes de cair.
const NOTA_MIN_CLASSE = { r: 0, s: 2.75, b: 5, o: 7.75 };
const CLASSE_ACIMA = { r: 's', s: 'b', b: 'o', o: null };
const CLASSE_ABAIXO = { o: 'b', b: 's', s: 'r', r: null };
// Pontos de atenção do recorte. equipes: [{ nome, grupo (pesos), valor (chave de valores), classes, n (notaEquipe), vin: {sc,k}|null, vmin, vmax }].
// Só usa o que está no recorte; nada aqui é meta oficial. Cada lista vem ordenada do mais para o menos urgente.
function pontosAtencao(equipes) {
  const pesosDe = (e) => REPASSE.pesos[e.grupo],
    ordem = (k) => ORDEM_CLASSE.indexOf(k), // 0 = Ótimo ... 3 = Regular
    porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    completas = equipes.filter((e) => e.n.completa),
    dist = { o: 0, b: 0, s: 0, r: 0 };
  completas.forEach((e) => dist[e.n.cmin]++);
  // Indicadores: quantos pontos da nota (máximo 10 por equipe) cada um tirou, somando as equipes.
  const ind = new Map();
  for (const e of equipes)
    for (const [cod, w] of Object.entries(pesosDe(e))) {
      const k = e.classes[cod];
      if (!k) continue;
      const x = ind.get(cod) || { cod, perdidos: 0, equipes: 0, baixas: 0 };
      x.perdidos += w * (1 - REPASSE.pontos[k]);
      x.equipes++;
      if (k === 'r' || k === 's') x.baixas++;
      ind.set(cod, x);
    }
  const indicadores = [...ind.values()]
    .filter((x) => x.perdidos > 0)
    .sort((a, b) => b.perdidos - a.perdidos || b.baixas - a.baixas || a.cod.localeCompare(b.cod));
  // Equipes com nota completa: as de classe baixa, as mais perto de subir e as que podem cair com um passo em um indicador.
  const baixas = [],
    subir = [],
    risco = [];
  for (const e of completas) {
    const k = e.n.cmin,
      nota = e.n.min,
      acima = CLASSE_ACIMA[k],
      abaixo = CLASSE_ABAIXO[k];
    if (k === 'r' || k === 's') baixas.push({ nome: e.nome, k, nota });
    if (acima) {
      const alavancas = Object.entries(pesosDe(e))
        .filter(([cod]) => e.classes[cod] !== 'o')
        .map(([cod, peso]) => ({ cod, peso, k: e.classes[cod] }))
        .sort((a, b) => b.peso - a.peso || ordem(b.k) - ordem(a.k) || a.cod.localeCompare(b.cod));
      subir.push({
        nome: e.nome,
        k,
        nota,
        para: acima,
        falta: NOTA_MIN_CLASSE[acima] - nota,
        ganho: valorMensal(e.valor, acima) - valorMensal(e.valor, k),
        alavancas: alavancas.slice(0, 2),
      });
    }
    if (abaixo && nota - NOTA_MIN_CLASSE[k] <= 0.5)
      risco.push({
        nome: e.nome,
        k,
        nota,
        para: abaixo,
        margem: nota - NOTA_MIN_CLASSE[k],
        perda: valorMensal(e.valor, k) - valorMensal(e.valor, abaixo),
      });
  }
  baixas.sort((a, b) => a.nota - b.nota || porNome(a, b));
  subir.sort((a, b) => a.falta - b.falta || b.ganho - a.ganho || porNome(a, b));
  risco.sort((a, b) => a.margem - b.margem || b.perda - a.perda || porNome(a, b));
  // Dados que faltam: indicadores de qualidade sem conceito ou vínculo sem nota. A estimativa vira uma faixa por causa deles.
  const porInd = new Map(),
    semDado = [];
  for (const e of equipes) {
    const faltam = [...e.n.faltam, ...(e.vin && e.vin.sc == null ? ['CVAT'] : [])];
    if (!faltam.length) continue;
    semDado.push({ nome: e.nome, faltam, variacao: (e.vmax || 0) - (e.vmin || 0) });
    faltam.forEach((c) => porInd.set(c, (porInd.get(c) || 0) + 1));
  }
  semDado.sort((a, b) => b.variacao - a.variacao || b.faltam.length - a.faltam.length || porNome(a, b));
  const semDadoPorIndicador = [...porInd].map(([cod, n]) => ({ cod, n })).sort((a, b) => b.n - a.n || a.cod.localeCompare(b.cod));
  // Vínculo (CVAT) abaixo de Bom: o que chegar a Bom vale por mês.
  const vinculo = equipes
    .filter((e) => e.vin && e.vin.k && (e.vin.k === 's' || e.vin.k === 'r'))
    .map((e) => ({ nome: e.nome, sc: e.vin.sc, k: e.vin.k, ganho: valorMensal(e.valor, 'b') - valorMensal(e.valor, e.vin.k) }))
    .sort((a, b) => a.sc - b.sc || b.ganho - a.ganho || porNome(a, b));
  return {
    dist,
    comNota: completas.length,
    indicadores,
    baixas,
    subir,
    risco,
    semDado,
    semDadoPorIndicador,
    emJogo: semDado.reduce((a, x) => a + x.variacao, 0),
    vinculo,
  };
}
