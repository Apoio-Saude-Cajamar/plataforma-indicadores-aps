// Cofinanciamento estadual (IGM SUS Paulista): valores por quadrimestre lançados por formulário.
// Só inclusões: o valor vigente de um item no período é o lançamento mais recente. A tabela se cria sozinha na primeira chamada.
import { ErroHttp, agora, lerJson, texto } from './util.js';
import { registrar } from './auth.js';

const ITENS = ['polio', 'penta', 'pneumo', 'triplice', 'esf', 'internacoes', 'sifilis', 'hpv', 'liraa', 'mortalidade', 'obito_materno'];
const RE_PERIODO = /^\d{4}-Q[1-3]$/;
const SQL = `CREATE TABLE IF NOT EXISTS lancamento_estadual (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, periodo TEXT NOT NULL,
  valor REAL, anterior REAL, mediana REAL, quartil INTEGER, quartil_ant INTEGER,
  obs TEXT, lancado_por INTEGER, lancado_em TEXT NOT NULL)`;
const prontas = new WeakSet();
async function garantir(env) {
  if (prontas.has(env.DB)) return;
  await env.DB.prepare(SQL).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_lancamento_estadual ON lancamento_estadual (item, periodo, id)').run();
  prontas.add(env.DB);
}

function numero(v, campo, { min = 0, max = 1e9, inteiro = false } = {}) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max || (inteiro && !Number.isInteger(n))) throw new ErroHttp(400, `Valor inválido em ${campo}.`);
  return n;
}

export async function listarEstadual(env) {
  await garantir(env);
  const base = `SELECT l.id, l.item, l.periodo, l.valor, l.anterior, l.mediana, l.quartil, l.quartil_ant AS quartilAnt, l.obs, l.lancado_em AS lancadoEm, u.nome AS por
                FROM lancamento_estadual l LEFT JOIN usuario u ON u.id = l.lancado_por`;
  const [vig, hist] = await env.DB.batch([
    env.DB.prepare(base + ' WHERE l.id IN (SELECT MAX(id) FROM lancamento_estadual GROUP BY item, periodo) ORDER BY l.periodo, l.item'),
    env.DB.prepare(base + ' ORDER BY l.id DESC LIMIT 200')
  ]);
  return { vigentes: vig.results, historico: hist.results };
}

export async function criarEstadual(req, env, quem) {
  await garantir(env);
  const c = await lerJson(req);
  if (!ITENS.includes(c.item)) throw new ErroHttp(400, 'Escolha o indicador.');
  if (!RE_PERIODO.test(String(c.periodo || ''))) throw new ErroHttp(400, 'Escolha o quadrimestre (ex.: 2026-Q1).');
  const valor = numero(c.valor, 'valor'), anterior = numero(c.anterior, 'anterior'), mediana = numero(c.mediana, 'mediana');
  const quartil = numero(c.quartil, 'quartil', { min: 1, max: 4, inteiro: true }), quartilAnt = numero(c.quartilAnt, 'quartil anterior', { min: 1, max: 4, inteiro: true });
  if (valor === null) throw new ErroHttp(400, 'Informe o valor.');
  const r = await env.DB.prepare('INSERT INTO lancamento_estadual (item, periodo, valor, anterior, mediana, quartil, quartil_ant, obs, lancado_por, lancado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(c.item, c.periodo, valor, anterior, mediana, quartil, quartilAnt, texto(c.obs, 500) || null, quem ?? null, agora()).run();
  if (quem) await registrar(env, quem, 'lancamento_estadual', `${c.item} ${c.periodo}`, req);
  return { id: r.meta.last_row_id };
}
