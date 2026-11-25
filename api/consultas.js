// Consultas de leitura: situação das etapas de uma competência e dados vigentes.
// Os resultados são montados como JSON pelo próprio banco, para poupar CPU do Worker.
import { competencia } from './util.js';
import { CHAVE_EQUIPE, UNIDADE_EXIBIDA, LINHA_CONTA, EQUIPE_FORA } from './vigente.js';

// Para cada etapa da competência: a versão vigente (última bem-sucedida) ou,
// se nunca deu certo, a última falha. É o que a extensão usa para "tentar de novo as falhas".
export async function situacao(env, comp) {
  comp = competencia(comp);
  const { results } = await env.DB.prepare(
    `
    WITH ordenadas AS (
      SELECT e.*, ROW_NUMBER() OVER (
        PARTITION BY e.chave
        ORDER BY (e.status = 'ok') DESC, e.coletado_em DESC, e.coleta_id DESC) AS ordem
      FROM etapa e WHERE e.competencia = ? AND e.bloco <> 'registro')
    SELECT chave, bloco, unidade, equipe, ine, status, tentativas, erro,
           coletado_em AS coletadoEm, coleta_id AS coletaId
    FROM ordenadas WHERE ordem = 1
    ORDER BY unidade, equipe, chave`,
  )
    .bind(comp)
    .all();
  const ok = results.filter((r) => r.status === 'ok').length;
  return { competencia: comp, total: results.length, ok, pendentes: results.length - ok, etapas: results };
}

const CONSULTAS_VIGENTES = {
  // Por indicador, recorte e equipe (pelo INE, ou unidade e nome sem INE) vale a linha da coleta bem-sucedida mais recente.
  // Assim uma recoleta do mesmo mês atualiza o que trouxe e não apaga o que só a coleta anterior tinha (unidade que falhou,
  // indicador desmarcado), e uma equipe que mudou de unidade entre coletas não conta duas vezes.
  indicadores: `
    SELECT json_group_array(json_object(
      'codigo', codigo, 'recorte', recorte, 'unidade', unidade_exibida, 'unidadeCnes', unidade_cnes,
      'equipe', equipe, 'ine', ine, 'tipoEquipe', tipo_equipe,
      'numerador', numerador, 'denominador', denominador, 'somaPontos', soma_pontos, 'valor', valor,
      'excluidos', excluidos, 'itens', json(itens), 'extras', json(extras),
      'coletadoEm', coletado_em, 'coletaId', coleta_id)) AS dados
    FROM (
      SELECT i.*, e.coletado_em AS coletado_em, ${UNIDADE_EXIBIDA()} AS unidade_exibida, ROW_NUMBER() OVER (
        PARTITION BY i.codigo, i.recorte, ${CHAVE_EQUIPE()}
        ORDER BY e.coletado_em DESC, i.coleta_id DESC) AS ordem
      FROM indicador_equipe i
      JOIN etapa e ON e.coleta_id = i.coleta_id AND e.chave = i.etapa_chave
      WHERE i.competencia = ? AND e.status = 'ok' AND ${LINHA_CONTA()})
    WHERE ordem = 1`,
  atendimentos: `
    SELECT json_group_array(json_object('unidade', c.unidade, 'equipe', c.equipe, 'cbo', c.cbo, 'cboCodigo', c.cbo_codigo,
      'grupoCBO', c.grupo_cbo, 'tipoAtendimento', c.tipo_atendimento, 'n', c.n)) AS dados
    FROM cubo_atendimento c
    JOIN etapa_vigente v ON v.coleta_id = c.coleta_id AND v.chave = c.etapa_chave
    WHERE c.competencia = ? AND NOT ${EQUIPE_FORA('c')}`,
  absenteismo: `
    SELECT json_group_array(json_object('unidade', c.unidade, 'equipe', c.equipe, 'cbo', c.cbo, 'cboCodigo', c.cbo_codigo,
      'grupoCBO', c.grupo_cbo, 'tipoFalta', c.tipo_falta, 'n', c.n)) AS dados
    FROM cubo_falta c
    JOIN etapa_vigente v ON v.coleta_id = c.coleta_id AND v.chave = c.etapa_chave
    WHERE c.competencia = ? AND NOT ${EQUIPE_FORA('c')}`,
  escuta: `
    SELECT json_group_array(json_object('unidade', c.unidade, 'ine', c.ine, 'equipe', c.equipe, 'categoria', c.categoria,
      'escuta', c.escuta, 'periodoOk', json(CASE c.periodo_ok WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE 'null' END))) AS dados
    FROM cubo_escuta c
    JOIN etapa_vigente v ON v.coleta_id = c.coleta_id AND v.chave = c.etapa_chave
    WHERE c.competencia = ? AND NOT ${EQUIPE_FORA('c')}`,
};

// Dados vigentes de uma competência, num único JSON: { competencia, indicadores, atendimentos, absenteismo, escuta }.
export async function dadosVigentes(env, comp) {
  comp = competencia(comp);
  const nomes = Object.keys(CONSULTAS_VIGENTES);
  const resultados = await env.DB.batch(nomes.map((n) => env.DB.prepare(CONSULTAS_VIGENTES[n]).bind(comp)));
  const partes = nomes.map((n, i) => `"${n}":${resultados[i].results[0]?.dados || '[]'}`);
  return `{"competencia":"${comp}",${partes.join(',')}}`;
}

export async function competencias(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT competencia, COUNT(*) AS coletas, MAX(COALESCE(concluido_em, iniciado_em)) AS ultimaColetaEm
    FROM coleta WHERE status <> 'cancelada' GROUP BY competencia ORDER BY competencia DESC`,
  ).all();
  return { competencias: results };
}
