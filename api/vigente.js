// Qual linha de indicador vale numa competência: por indicador e equipe, a da coleta bem-sucedida mais recente.
// A equipe é reconhecida pelo INE quando há (o nome da unidade pode mudar de uma coleta para outra, como nas eMulti,
// que a extensão já pôs em unidades diferentes); sem INE, por unidade e nome da equipe.
export const CHAVE_EQUIPE = (a = 'i') =>
  `CASE WHEN ${a}.ine IS NOT NULL AND ${a}.ine <> '' THEN 'ine:' || ${a}.ine ELSE ${a}.unidade || '|' || ${a}.equipe END`;

// As eMulti atendem várias unidades: seus valores são da equipe, sem unidade (aparecem em "Município").
export const UNIDADE_EXIBIDA = (a = 'i') => `CASE WHEN ${a}.codigo IN ('M1', 'M2') THEN 'Município' ELSE ${a}.unidade END`;

// Equipes de atenção domiciliar (Saúde em Casa / Melhor em Casa, EMAD, EMAP): não contam em nada.
// (UPPER do SQLite só troca letras sem acento; o % cobre o "Ú" de "SAÚDE".)
export const EQUIPE_FORA = (a = 'i') => {
  const e = `(' ' || UPPER(COALESCE(${a}.equipe, '')) || ' ')`;
  return `(${e} LIKE '% EMAD %' OR ${e} LIKE '% EMAP %' OR ${e} LIKE '% SA%DE EM CASA %' OR ${e} LIKE '% MELHOR EM CASA %')`;
};
// Linha que conta: a C1 é só de eSF e eAP — fora "Sem equipe" e "INE não encontrado" (agrupamentos do PEC, não equipes)
// e o Consultório na Rua; e nenhuma linha de equipe de atenção domiciliar.
export const LINHA_CONTA = (a = 'i') =>
  `NOT (${a}.codigo = 'C1' AND (UPPER(${a}.equipe) LIKE '%SEM EQUIPE%' OR UPPER(${a}.equipe) LIKE 'INE N%ENCONTRADO%' OR UPPER(${a}.equipe) LIKE '%CONSULT%RIO%RUA%'))
   AND NOT ${EQUIPE_FORA(a)}`;
