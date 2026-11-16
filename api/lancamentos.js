// Lançamentos por formulário: metas da PAS que não vêm do PEC e coberturas vacinais informadas pelo Ministério.
// Nada é apagado nem alterado: cada lançamento entra no histórico e o vigente é o mais recente do item no mês.
import { ErroHttp, agora, lerJson, texto, competencia } from './util.js';
import { registrar } from './auth.js';

const TIPOS = ['meta', 'vacina'];

export async function listarLancamentos(env, url) {
  const tipo = url.searchParams.get('tipo');
  if (!TIPOS.includes(tipo)) throw new ErroHttp(400, 'Informe o tipo: meta ou vacina.');
  const base = `SELECT l.id, l.item, l.competencia, l.valor, l.obs, l.lancado_em AS lancadoEm, u.nome AS por
                FROM lancamento l LEFT JOIN usuario u ON u.id = l.lancado_por WHERE l.tipo = ?`;
  const [vig, hist] = await env.DB.batch([
    env.DB.prepare(base + ' AND l.id IN (SELECT MAX(id) FROM lancamento WHERE tipo = ? GROUP BY item, competencia) ORDER BY l.item, l.competencia').bind(tipo, tipo),
    env.DB.prepare(base + ' ORDER BY l.id DESC LIMIT 300').bind(tipo)
  ]);
  return { tipo, vigentes: vig.results, historico: hist.results };
}

export async function criarLancamento(req, env, quem) {
  const c = await lerJson(req);
  if (!TIPOS.includes(c.tipo)) throw new ErroHttp(400, 'Tipo inválido.');
  const item = texto(c.item, 80);
  if (!item || (c.tipo === 'meta' && !/^\d+\.\d+\.\d+$/.test(item))) throw new ErroHttp(400, 'Escolha o item do lançamento.');
  const comp = competencia(c.competencia);
  const valor = typeof c.valor === 'number' ? c.valor : Number(String(c.valor ?? '').replace(',', '.'));
  if (c.valor === '' || c.valor === null || c.valor === undefined || !Number.isFinite(valor) || valor < 0 || valor > 1e9) throw new ErroHttp(400, 'Informe um valor numérico, igual ou maior que zero.');
  const r = await env.DB.prepare('INSERT INTO lancamento (tipo, item, competencia, valor, obs, lancado_por, lancado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(c.tipo, item, comp, valor, texto(c.obs, 500) || null, quem ?? null, agora()).run();
  if (quem) await registrar(env, quem, 'lancamento_' + c.tipo, `${item} ${comp}`, req);
  return { id: r.meta.last_row_id };
}
