// Consultas de leitura: situação das etapas de uma competência e dados vigentes.
// Os resultados são montados como JSON pelo próprio banco, para poupar CPU do Worker.
import { competencia, agora } from './util.js';
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

// Os cubos (atendimentos, faltas, escuta) partem das etapas vigentes da competência (índice de etapa por competência) e
// chegam às linhas pelo índice (coleta, etapa). O CROSS JOIN fixa essa ordem: sem ela o banco varria o cubo inteiro, de
// todos os meses e de todas as coletas, a cada pedido — e o dashboard pede todos os meses, o que estourava o limite diário
// de leituras do D1.
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
    FROM etapa_vigente v
    CROSS JOIN cubo_atendimento c ON c.coleta_id = v.coleta_id AND c.etapa_chave = v.chave
    WHERE v.competencia = ? AND NOT ${EQUIPE_FORA('c')}`,
  absenteismo: `
    SELECT json_group_array(json_object('unidade', c.unidade, 'equipe', c.equipe, 'cbo', c.cbo, 'cboCodigo', c.cbo_codigo,
      'grupoCBO', c.grupo_cbo, 'tipoFalta', c.tipo_falta, 'n', c.n)) AS dados
    FROM etapa_vigente v
    CROSS JOIN cubo_falta c ON c.coleta_id = v.coleta_id AND c.etapa_chave = v.chave
    WHERE v.competencia = ? AND NOT ${EQUIPE_FORA('c')}`,
  escuta: `
    SELECT json_group_array(json_object('unidade', c.unidade, 'ine', c.ine, 'equipe', c.equipe, 'categoria', c.categoria,
      'escuta', c.escuta, 'periodoOk', json(CASE c.periodo_ok WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE 'null' END))) AS dados
    FROM etapa_vigente v
    CROSS JOIN cubo_escuta c ON c.coleta_id = v.coleta_id AND c.etapa_chave = v.chave
    WHERE v.competencia = ? AND NOT ${EQUIPE_FORA('c')}`,
};

// Resposta pronta guardada no próprio banco, por competência e partes pedidas: os valores do mês ficam calculados de uma
// vez (no fim de cada coleta, ou na primeira leitura depois de uma mudança) e valem enquanto nada mudou naquele mês (a
// marca "alteracao:AAAA-MM" muda a cada etapa gravada ou coleta concluída do mês; a restauração de backup apaga tudo).
// Abrir o dashboard de novo lê 2 linhas por mês, em vez de refazer a seleção das linhas vigentes (milhares por mês).
const SQL_CACHE = `CREATE TABLE IF NOT EXISTS dados_cache (
  competencia TEXT NOT NULL, partes TEXT NOT NULL, versao TEXT NOT NULL, json TEXT NOT NULL, gerado_em TEXT NOT NULL,
  PRIMARY KEY (competencia, partes))`;
const cacheProntos = new WeakSet();
export async function garantirCache(env) {
  if (cacheProntos.has(env.DB)) return;
  await env.DB.prepare(SQL_CACHE).run();
  cacheProntos.add(env.DB);
}
const TAMANHO_MAXIMO_CACHE = 1800000; // o D1 aceita até 2 MB por linha

// Dados vigentes de uma competência, num único JSON: { competencia, indicadores, atendimentos, absenteismo, escuta }.
// "partes" (ex.: "indicadores") limita ao que a tela usa: o dashboard e a tela Dados só precisam dos indicadores.
export async function dadosVigentes(env, comp, pedido) {
  comp = competencia(comp);
  const pedidas = String(pedido || '')
    .split(',')
    .map((p) => p.trim());
  const todas = Object.keys(CONSULTAS_VIGENTES);
  const nomes = pedidas.some((p) => todas.includes(p)) ? todas.filter((n) => pedidas.includes(n)) : todas;
  const chave = nomes.join(',');
  let versao = null;
  try {
    await garantirCache(env);
    const [m, c] = await env.DB.batch([
      env.DB.prepare("SELECT valor FROM meta WHERE chave = 'alteracao:' || ?").bind(comp),
      env.DB.prepare('SELECT versao, json FROM dados_cache WHERE competencia = ? AND partes = ?').bind(comp, chave),
    ]);
    versao = String(m.results[0]?.valor ?? 'inicial');
    const guardado = c.results[0];
    if (guardado && guardado.versao === versao) return guardado.json;
  } catch (_) {
    versao = null; // sem a tabela de respostas prontas, responde direto do banco
  }
  const resultados = await env.DB.batch(nomes.map((n) => env.DB.prepare(CONSULTAS_VIGENTES[n]).bind(comp)));
  const partes = nomes.map((n, i) => `"${n}":${resultados[i].results[0]?.dados || '[]'}`);
  const texto = `{"competencia":"${comp}",${partes.join(',')}}`;
  if (versao !== null && texto.length < TAMANHO_MAXIMO_CACHE) {
    try {
      await env.DB.prepare(
        `INSERT INTO dados_cache (competencia, partes, versao, json, gerado_em) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (competencia, partes) DO UPDATE SET versao = excluded.versao, json = excluded.json, gerado_em = excluded.gerado_em`,
      )
        .bind(comp, chave, versao, texto, agora())
        .run();
    } catch (_) {}
  }
  return texto;
}

export async function competencias(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT competencia, COUNT(*) AS coletas, MAX(COALESCE(concluido_em, iniciado_em)) AS ultimaColetaEm
    FROM coleta WHERE status <> 'cancelada' GROUP BY competencia ORDER BY competencia DESC`,
  ).all();
  return { competencias: results };
}
