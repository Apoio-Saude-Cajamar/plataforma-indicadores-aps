// População estimada do município, direto da API de agregados do IBGE (tabela 6579, variável 9324).
// Vale a estimativa mais recente publicada; o resultado fica em cache por um dia.
import { ErroHttp } from './util.js';

const MUNICIPIO = '3509205'; // Cajamar (SP)

export async function populacaoMunicipio(env, buscar = fetch) {
  const url = `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[${env.IBGE_MUNICIPIO || MUNICIPIO}]`;
  let r;
  try { r = await buscar(url, { cf: { cacheTtl: 86400, cacheEverything: true } }); }
  catch { throw new ErroHttp(502, 'Não foi possível consultar o IBGE agora.'); }
  if (!r.ok) throw new ErroHttp(502, 'O IBGE não respondeu como esperado.');
  const j = await r.json().catch(() => null);
  const serie = j && j[0] && j[0].resultados && j[0].resultados[0] && j[0].resultados[0].series && j[0].resultados[0].series[0];
  const anos = serie && serie.serie ? Object.keys(serie.serie) : [];
  const ano = anos.sort().pop();
  const valor = ano ? Number(serie.serie[ano]) : NaN;
  if (!Number.isFinite(valor) || valor <= 0) throw new ErroHttp(502, 'Resposta do IBGE sem população.');
  return { municipio: serie.localidade ? serie.localidade.nome : null, codigo: env.IBGE_MUNICIPIO || MUNICIPIO, populacao: valor, ano: Number(ano), fonte: 'IBGE, estimativas de população (tabela 6579)' };
}
