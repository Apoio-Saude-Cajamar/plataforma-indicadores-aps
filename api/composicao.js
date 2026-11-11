// Composição das equipes: a extensão envia a árvore pronta; o painel lê a mais recente.
import { ErroHttp, agora, competencia, dataIso } from './util.js';

const LIMITE = 2 * 1024 * 1024;

export async function gravarComposicao(env, corpo) {
  const comp = competencia(corpo.competencia);
  if (!Array.isArray(corpo.unidades)) throw new ErroHttp(400, 'Faltou a lista de unidades.');
  const dados = JSON.stringify({ resumo: corpo.resumo || null, alertas: corpo.alertas || [], unidades: corpo.unidades, versaoExtensao: corpo.versaoExtensao || null });
  if (dados.length > LIMITE) throw new ErroHttp(413, 'Composição grande demais.');
  const coletado = dataIso(corpo.coletadoEm || agora(), 'coletadoEm');
  await env.DB.prepare(`INSERT INTO composicao (competencia, coletado_em, recebido_em, dados) VALUES (?, ?, ?, ?)
    ON CONFLICT (competencia) DO UPDATE SET coletado_em = excluded.coletado_em, recebido_em = excluded.recebido_em, dados = excluded.dados`)
    .bind(comp, coletado, agora(), dados).run();
  return { ok: true, competencia: comp };
}

export async function lerComposicao(env, comp) {
  const r = comp
    ? await env.DB.prepare('SELECT * FROM composicao WHERE competencia = ?').bind(competencia(comp)).first()
    : await env.DB.prepare('SELECT * FROM composicao ORDER BY competencia DESC LIMIT 1').first();
  const lista = (await env.DB.prepare('SELECT competencia FROM composicao ORDER BY competencia DESC').all()).results.map(x => x.competencia);
  if (!r) return { competencias: lista, composicao: null };
  return { competencias: lista, composicao: { competencia: r.competencia, coletadoEm: r.coletado_em, ...JSON.parse(r.dados) } };
}
