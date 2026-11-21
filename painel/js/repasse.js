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
