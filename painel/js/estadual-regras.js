// Regras de pontuação da parte variável do IGM SUS Paulista (Deliberação CIB 150/2025, que mantém a lógica da CIB 117/2023).
// Funções puras: recebem números e devolvem { pct, motivo } (pct de 0 a 1, ou null quando falta dado).
(function (raiz) {
  const POP = 100000,
    TETO_ESF = 3500;
  // Itens, pesos (somam 10) e o que cada um precisa para ser pontuado.
  const ITENS = [
    { id: 'polio', nome: 'Cobertura vacinal: poliomielite (< 1 ano)', peso: 1.3, tipo: 'vacina', meta: 95 },
    { id: 'penta', nome: 'Cobertura vacinal: penta (< 1 ano)', peso: 1.3, tipo: 'vacina', meta: 95 },
    { id: 'pneumo', nome: 'Cobertura vacinal: pneumocócica (< 1 ano)', peso: 1.3, tipo: 'vacina', meta: 95 },
    { id: 'triplice', nome: 'Cobertura vacinal: tríplice viral D1', peso: 1.3, tipo: 'vacina', meta: 95 },
    { id: 'esf', nome: 'Cobertura da eSF', peso: 0.8, tipo: 'esf' },
    { id: 'internacoes', nome: 'Internações por causas sensíveis à APS', peso: 0.8, tipo: 'internacoes' },
    { id: 'sifilis', nome: 'Gestantes com sífilis tratadas adequadamente', peso: 0.8, tipo: 'sifilis' },
    { id: 'hpv', nome: 'Cobertura de HPV (9 a 14 anos)', peso: 0.8, tipo: 'vacina', meta: 90 },
    { id: 'liraa', nome: 'LIRAa (Aedes aegypti)', peso: 0.8, tipo: 'liraa' },
    { id: 'mortalidade', nome: 'Mortalidade infantil (janela de 3 anos)', peso: 0.8, tipo: 'mortalidade' },
  ];
  const num = (v) => typeof v === 'number' && Number.isFinite(v);

  // Vacinas e HPV: a regra depende de onde a cobertura estava no período anterior (a) e de onde está agora (v), com a mediana estadual (m).
  function vacina(v, a, m, meta) {
    if (!num(v) || !num(a) || !num(m))
      return { pct: null, motivo: 'Faltam a cobertura do período, a do período anterior ou a mediana estadual.' };
    if (a >= meta)
      return v >= meta
        ? { pct: 1, motivo: 'Seguiu em ' + meta + '% ou mais.' }
        : v >= m
          ? { pct: 0.75, motivo: 'Caiu abaixo de ' + meta + '%, mas ficou na mediana ou acima.' }
          : { pct: 0, motivo: 'Caiu abaixo da mediana estadual.' };
    if (a >= m)
      return v > a
        ? { pct: 1, motivo: 'Subiu em relação ao período anterior.' }
        : v >= m
          ? { pct: 0.75, motivo: 'Manteve ou caiu, mas ficou na mediana ou acima.' }
          : { pct: 0, motivo: 'Caiu abaixo da mediana estadual.' };
    if (v >= m) return { pct: 1, motivo: 'Subiu e alcançou a mediana estadual.' };
    return v >= a
      ? { pct: 0.5, motivo: 'Manteve ou subiu, mas segue abaixo da mediana.' }
      : { pct: 0, motivo: 'Caiu e segue abaixo da mediana.' };
  }
  // Cobertura da eSF: nº de eSF × 3.500 ÷ população, em média no quadrimestre.
  function cobertura(nEsf, pop) {
    return num(nEsf) && pop > 0 ? Math.min(100, ((nEsf * TETO_ESF) / pop) * 100) : null;
  }
  function esf(nEsf, pop) {
    const c = cobertura(nEsf, pop);
    if (c === null) return { pct: null, motivo: 'Falta o número de eSF.' };
    return c >= 70
      ? { pct: 1, motivo: '70% ou mais.' }
      : c >= 50
        ? { pct: 0.5, motivo: 'De 50% a menos de 70%.' }
        : c >= 15
          ? { pct: 0.25, motivo: 'De 15% a menos de 50%.' }
          : { pct: 0, motivo: 'Abaixo de 15%.' };
  }
  function internacoes(v, media) {
    if (!num(v) || !num(media)) return { pct: null, motivo: 'Faltam o valor do município e a média estadual.' };
    return v < media ? { pct: 1, motivo: 'Abaixo da média estadual.' } : { pct: 0.5, motivo: 'Igual ou acima da média estadual.' };
  }
  function sifilis(v) {
    if (!num(v)) return { pct: null, motivo: 'Falta o percentual.' };
    return v >= 90 ? { pct: 1, motivo: '90% ou mais.' } : { pct: 0, motivo: 'Abaixo de 90%.' };
  }
  function liraa(feito) {
    if (!num(feito)) return { pct: null, motivo: 'Informe se o levantamento foi realizado (1 = sim, 0 = não).' };
    return feito ? { pct: 1, motivo: 'Levantamento realizado.' } : { pct: 0, motivo: 'Levantamento não realizado.' };
  }
  // Mortalidade infantil: menor é melhor. q = quartil (1 a 3; o 4 conta como 3), t = taxa; "a" é o período anterior.
  function mortalidade(q, t, qa, ta) {
    if (![q, t, qa, ta].every(num)) return { pct: null, motivo: 'Faltam o quartil e a taxa da janela atual e da anterior.' };
    q = Math.min(3, q);
    qa = Math.min(3, qa);
    if (qa === 1)
      return q === 1
        ? { pct: 1, motivo: 'Permaneceu no 1º quartil.' }
        : q === 2
          ? { pct: 0.5, motivo: 'Subiu para o 2º quartil.' }
          : { pct: 0, motivo: 'Subiu para o 3º quartil.' };
    if (qa === 2)
      return q === 1
        ? { pct: 1, motivo: 'Desceu para o 1º quartil.' }
        : q === 3
          ? { pct: 0, motivo: 'Subiu para o 3º quartil.' }
          : t < ta
            ? { pct: 1, motivo: 'Caiu dentro do 2º quartil.' }
            : { pct: 0.5, motivo: 'Subiu ou ficou igual dentro do 2º quartil.' };
    return q < 3
      ? { pct: 1, motivo: 'Desceu de quartil.' }
      : t < ta
        ? { pct: 0.5, motivo: 'Caiu, mas permaneceu no 3º quartil.' }
        : { pct: 0, motivo: 'Subiu no 3º quartil.' };
  }
  // d = { valor, anterior, mediana, quartil, quartilAnt, nEsf }; pop = população.
  function pontuar(item, d, pop) {
    d = d || {};
    switch (item.tipo) {
      case 'vacina':
        return vacina(d.valor, d.anterior, d.mediana, item.meta);
      case 'esf':
        return esf(d.nEsf, pop || POP);
      case 'internacoes':
        return internacoes(d.valor, d.mediana);
      case 'sifilis':
        return sifilis(d.valor);
      case 'liraa':
        return liraa(d.valor);
      case 'mortalidade':
        return mortalidade(d.quartil, d.valor, d.quartilAnt, d.anterior);
    }
    return { pct: null, motivo: '' };
  }
  // Nota da parte variável: Σ(peso × %) ÷ 10. O ponto extra (sem óbito materno) soma 10 pontos percentuais, no máximo até 100%,
  // e só vale se nem todos os indicadores chegaram a 100%.
  function nota(resultados, semObitoMaterno) {
    const ok = resultados.filter((r) => r.pct !== null);
    const soma = ok.reduce((t, r) => t + r.peso * r.pct, 0);
    const pesoLancado = ok.reduce((t, r) => t + r.peso, 0);
    const todos100 = resultados.length > 0 && resultados.every((r) => r.pct === 1);
    const extra = semObitoMaterno === true && !todos100 ? 0.1 : 0;
    return { base: soma / 10, extra, final: Math.min(1, soma / 10 + extra), pesoLancado, completo: ok.length === resultados.length };
  }
  // Estimativa de cobertura a partir das doses do relatório de vacinação do PEC (só aproximada: a oficial vem do Estado).
  // Doses acumuladas de janeiro até o fim do quadrimestre ÷ população-alvo lançada para o ano. A faixa etária é a da data da aplicação.
  const DEF = {
    polio: { faixas: ['Menos de 01 ano'], dose: /^3ª DOSE$/, alvo: 'alvo_menor1' },
    penta: { faixas: ['Menos de 01 ano'], dose: /^3ª DOSE$/, alvo: 'alvo_menor1' },
    pneumo: { faixas: ['Menos de 01 ano'], dose: /^2ª DOSE$/, alvo: 'alvo_menor1' },
    triplice: { faixas: ['01 ano'], dose: /^1ª DOSE$/, alvo: 'alvo_1ano' },
    hpv: { faixas: ['05 a 09 anos', '10 a 14 anos'], dose: /^(ÚNICA|2ª DOSE)$/, alvo: 'alvo_hpv' },
  };
  const FIM_Q = { 1: 4, 2: 8, 3: 12 };
  // linhas: [{ competencia 'AAAA-MM', vacina, faixa, dose, n }]; alvo: população-alvo (número) ou null.
  function estimativa(id, linhas, periodo, alvo) {
    const d = DEF[id],
      m = /^(\d{4})-Q([1-3])$/.exec(String(periodo || ''));
    if (!d || !m) return null;
    const ano = m[1],
      fim = FIM_Q[m[2]],
      esperados = fim;
    const meses = new Set();
    let doses = 0;
    for (const l of linhas || []) {
      const [a, mm] = String(l.competencia).split('-');
      if (a !== ano || Number(mm) > fim) continue;
      meses.add(mm);
      if (l.vacina === id && d.faixas.includes(l.faixa) && d.dose.test(l.dose)) doses += l.n;
    }
    if (!meses.size) return null;
    return {
      doses,
      meses: meses.size,
      esperados,
      completo: meses.size >= esperados,
      cobertura: num(alvo) && alvo > 0 ? (doses / alvo) * 100 : null,
    };
  }
  const API = { estimativa, DEF, POP, TETO_ESF, ITENS, vacina, cobertura, esf, internacoes, sifilis, liraa, mortalidade, pontuar, nota };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ESTADUAL_REGRAS = API;
})(typeof window !== 'undefined' ? window : globalThis);
