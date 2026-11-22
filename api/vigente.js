// Qual linha de indicador vale numa competência: por indicador e equipe, a da coleta bem-sucedida mais recente.
// A equipe é reconhecida pelo INE quando há (o nome da unidade pode mudar de uma coleta para outra, como nas eMulti,
// que a extensão já pôs em unidades diferentes); sem INE, por unidade e nome da equipe.
export const CHAVE_EQUIPE = (a = 'i') =>
  `CASE WHEN ${a}.ine IS NOT NULL AND ${a}.ine <> '' THEN 'ine:' || ${a}.ine ELSE ${a}.unidade || '|' || ${a}.equipe END`;

// As eMulti atendem várias unidades: seus valores são da equipe, sem unidade (aparecem em "Município").
export const UNIDADE_EXIBIDA = (a = 'i') => `CASE WHEN ${a}.codigo IN ('M1', 'M2') THEN 'Município' ELSE ${a}.unidade END`;
