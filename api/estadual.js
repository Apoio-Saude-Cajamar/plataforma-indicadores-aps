// Cofinanciamento estadual (IGM SUS Paulista): valores por quadrimestre lançados por formulário.
// Só inclusões: o valor vigente de um item no período é o lançamento mais recente. A tabela se cria sozinha na primeira chamada.
import { ErroHttp, agora, lerJson, texto, competencia } from './util.js';
import { registrar } from './auth.js';

const ITENS = ['polio', 'penta', 'pneumo', 'triplice', 'esf', 'internacoes', 'sifilis', 'hpv', 'liraa', 'mortalidade', 'obito_materno', 'alvo_menor1', 'alvo_1ano', 'alvo_hpv'];
const RE_PERIODO = /^\d{4}-Q[1-3]$/;
const SQL = `CREATE TABLE IF NOT EXISTS lancamento_estadual (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, periodo TEXT NOT NULL,
  valor REAL, anterior REAL, mediana REAL, quartil INTEGER, quartil_ant INTEGER,
  obs TEXT, lancado_por INTEGER, lancado_em TEXT NOT NULL)`;
const prontas = new WeakSet();
export async function garantir(env) {
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

// Doses de vacina do PEC (estimativa): a extensão envia as doses do mês; o Painel troca as doses daquele mês.
const SQL_VAC = `CREATE TABLE IF NOT EXISTS vacina_pec (
  competencia TEXT NOT NULL, vacina TEXT NOT NULL, imunobiologico TEXT NOT NULL, faixa TEXT NOT NULL, dose TEXT NOT NULL,
  n INTEGER NOT NULL, atualizado_em TEXT NOT NULL, PRIMARY KEY (competencia, imunobiologico, faixa, dose))`;
const vacProntas = new WeakSet();
export async function garantirVac(env) {
  if (vacProntas.has(env.DB)) return;
  await env.DB.prepare(SQL_VAC).run();
  vacProntas.add(env.DB);
}
const VACINAS = ['polio', 'penta', 'pneumo', 'triplice', 'hpv'];

export async function gravarVacinasPec(env, corpo) {
  const comp = competencia(corpo.competencia);
  const lista = Array.isArray(corpo.doses) ? corpo.doses : null;
  if (!lista) throw new ErroHttp(400, 'Envie a lista de doses.');
  if (lista.length > 3000) throw new ErroHttp(400, 'Lista grande demais.');
  await garantirVac(env);
  const quando = agora();
  const ins = 'INSERT OR REPLACE INTO vacina_pec (competencia, vacina, imunobiologico, faixa, dose, n, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const ops = [env.DB.prepare('DELETE FROM vacina_pec WHERE competencia = ?').bind(comp)];
  let n = 0;
  for (const d of lista) {
    const imuno = texto(d.imunobiologico, 120), faixa = texto(d.faixa, 40), dose = texto(d.dose, 40);
    if (!VACINAS.includes(d.vacina) || !imuno || !faixa || !dose || !Number.isInteger(d.n) || d.n < 0) continue;
    ops.push(env.DB.prepare(ins).bind(comp, d.vacina, imuno, faixa, dose, d.n, quando)); n++;
  }
  for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
  return { competencia: comp, gravados: n };
}

export async function lerVacinasPec(env) {
  await garantirVac(env);
  const { results } = await env.DB.prepare('SELECT competencia, vacina, faixa, dose, SUM(n) AS n FROM vacina_pec GROUP BY competencia, vacina, faixa, dose ORDER BY competencia').all();
  return { doses: results };
}
