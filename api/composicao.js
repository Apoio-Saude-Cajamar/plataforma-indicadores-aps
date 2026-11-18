// Composição das equipes: a extensão envia a árvore pronta; o painel lê a mais recente.
import { ErroHttp, agora, competencia, dataIso } from './util.js';

const LIMITE = 2 * 1024 * 1024;

export async function gravarComposicao(env, corpo) {
  const comp = competencia(corpo.competencia);
  if (!Array.isArray(corpo.unidades)) throw new ErroHttp(400, 'Faltou a lista de unidades.');
  // Uma coleta parcial (só algumas unidades) não apaga as unidades já recebidas do mesmo mês: elas se juntam por nome.
  // "substituir: true" troca o mês inteiro.
  let unidades = corpo.unidades;
  let resumo = corpo.resumo || null;
  let alertas = corpo.alertas || [];
  if (!corpo.substituir) {
    const antes = await env.DB.prepare('SELECT dados FROM composicao WHERE competencia = ?').bind(comp).first();
    const ant = antes ? JSON.parse(antes.dados) : null;
    if (ant && Array.isArray(ant.unidades)) {
      const novas = new Set(corpo.unidades.map((u) => u.nome));
      const mantidas = ant.unidades.filter((u) => !novas.has(u.nome));
      if (mantidas.length) {
        unidades = [...mantidas, ...corpo.unidades].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
        resumo = {
          unidades: unidades.length,
          equipes: unidades.reduce((n, u) => n + (u.equipes || []).length, 0),
          lotacoes: unidades.reduce((n, u) => n + (Number(u.lotacoesLidas) || 0), 0),
          alertas: unidades.reduce((n, u) => n + (u.alertas || []).length, 0),
        };
        alertas = corpo.alertas || ant.alertas || [];
      }
    }
  }
  const dados = JSON.stringify({ resumo, alertas, unidades, versaoExtensao: corpo.versaoExtensao || null });
  if (dados.length > LIMITE) throw new ErroHttp(413, 'Composição grande demais.');
  const coletado = dataIso(corpo.coletadoEm || agora(), 'coletadoEm');
  await env.DB.prepare(
    `INSERT INTO composicao (competencia, coletado_em, recebido_em, dados) VALUES (?, ?, ?, ?)
    ON CONFLICT (competencia) DO UPDATE SET coletado_em = excluded.coletado_em, recebido_em = excluded.recebido_em, dados = excluded.dados`,
  )
    .bind(comp, coletado, agora(), dados)
    .run();
  return { ok: true, competencia: comp };
}

export async function lerComposicao(env, comp) {
  const r = comp
    ? await env.DB.prepare('SELECT * FROM composicao WHERE competencia = ?').bind(competencia(comp)).first()
    : await env.DB.prepare('SELECT * FROM composicao ORDER BY competencia DESC LIMIT 1').first();
  const lista = (await env.DB.prepare('SELECT competencia FROM composicao ORDER BY competencia DESC').all()).results.map(
    (x) => x.competencia,
  );
  if (!r) return { competencias: lista, composicao: null };
  return { competencias: lista, composicao: { competencia: r.competencia, coletadoEm: r.coletado_em, ...JSON.parse(r.dados) } };
}
