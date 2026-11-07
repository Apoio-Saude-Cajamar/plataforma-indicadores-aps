// Consultas de leitura: situação das etapas de uma competência e dados vigentes.
// Os resultados são montados como JSON pelo próprio banco, para poupar CPU do Worker.
import { competencia } from './util.js';

// Para cada etapa da competência: a versão vigente (última bem-sucedida) ou,
// se nunca deu certo, a última falha. É o que a extensão usa para "tentar de novo as falhas".
export async function situacao(env, comp) {
  comp = competencia(comp);
  const { results } = await env.DB.prepare(`
    WITH ordenadas AS (
      SELECT e.*, ROW_NUMBER() OVER (
        PARTITION BY e.chave
        ORDER BY (e.status = 'ok') DESC, e.coletado_em DESC, e.coleta_id DESC) AS ordem
      FROM etapa e WHERE e.competencia = ?)
    SELECT chave, bloco, unidade, equipe, ine, status, tentativas, erro,
           coletado_em AS coletadoEm, coleta_id AS coletaId
    FROM ordenadas WHERE ordem = 1
    ORDER BY unidade, equipe, chave`).bind(comp).all();
  const ok = results.filter(r => r.status === 'ok').length;
  return { competencia: comp, total: results.length, ok, pendentes: results.length - ok, etapas: results };
}

const CONSULTAS_VIGENTES = {
  indicadores: `
    SELECT json_group_array(json_object(
      'codigo', i.codigo, 'recorte', i.recorte, 'unidade', i.unidade, 'unidadeCnes', i.unidade_cnes,
      'equipe', i.equipe, 'ine', i.ine, 'tipoEquipe', i.tipo_equipe,
      'numerador', i.numerador, 'denominador', i.denominador, 'somaPontos', i.soma_pontos, 'valor', i.valor,
      'excluidos', i.excluidos, 'itens', json(i.itens), 'extras', json(i.extras),
      'coletadoEm', v.coletado_em, 'coletaId', i.coleta_id)) AS dados
    FROM indicador_equipe i
    JOIN etapa_vigente v ON v.coleta_id = i.coleta_id AND v.chave = i.etapa_chave
    WHERE i.competencia = ?`,
  atendimentos: `
    SELECT json_group_array(json_object('unidade', c.unidade, 'equipe', c.equipe, 'cbo', c.cbo, 'cboCodigo', c.cbo_codigo,
      'grupoCBO', c.grupo_cbo, 'tipoAtendimento', c.tipo_atendimento, 'n', c.n)) AS dados
    FROM cubo_atendimento c
    JOIN etapa_vigente v ON v.coleta_id = c.coleta_id AND v.chave = c.etapa_chave
    WHERE c.competencia = ?`,
  absenteismo: `
    SELECT json_group_array(json_object('unidade', c.unidade, 'equipe', c.equipe, 'cbo', c.cbo, 'cboCodigo', c.cbo_codigo,
      'grupoCBO', c.grupo_cbo, 'tipoFalta', c.tipo_falta, 'n', c.n)) AS dados
    FROM cubo_falta c
    JOIN etapa_vigente v ON v.coleta_id = c.coleta_id AND v.chave = c.etapa_chave
    WHERE c.competencia = ?`,
  escuta: `
    SELECT json_group_array(json_object('unidade', c.unidade, 'ine', c.ine, 'equipe', c.equipe, 'categoria', c.categoria,
      'escuta', c.escuta, 'periodoOk', json(CASE c.periodo_ok WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE 'null' END))) AS dados
    FROM cubo_escuta c
    JOIN etapa_vigente v ON v.coleta_id = c.coleta_id AND v.chave = c.etapa_chave
    WHERE c.competencia = ?`
};

// Dados vigentes de uma competência, num único JSON: { competencia, indicadores, atendimentos, absenteismo, escuta }.
export async function dadosVigentes(env, comp) {
  comp = competencia(comp);
  const nomes = Object.keys(CONSULTAS_VIGENTES);
  const resultados = await env.DB.batch(nomes.map(n => env.DB.prepare(CONSULTAS_VIGENTES[n]).bind(comp)));
  const partes = nomes.map((n, i) => `"${n}":${resultados[i].results[0]?.dados || '[]'}`);
  return `{"competencia":"${comp}",${partes.join(',')}}`;
}

export async function competencias(env) {
  const { results } = await env.DB.prepare(`
    SELECT competencia, COUNT(*) AS coletas, MAX(COALESCE(concluido_em, iniciado_em)) AS ultimaColetaEm
    FROM coleta WHERE status <> 'cancelada' GROUP BY competencia ORDER BY competencia DESC`).all();
  return { competencias: results };
}
