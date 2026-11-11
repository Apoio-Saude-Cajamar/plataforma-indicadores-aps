// Exportação (backup) e restauração do banco, em páginas pequenas.
// O script do Google Drive lê tabela por tabela; cada requisição fica leve,
// dentro dos limites do plano gratuito do Cloudflare.
import { TABELAS, VERSAO_ESQUEMA } from './esquema.js';
import { ErroHttp, agora } from './util.js';

const LIMITE_PADRAO = 2000;
const LIMITE_MAXIMO = 5000;
export const FRASE_CONFIRMACAO = 'APAGAR E RESTAURAR';

function tabelaValida(nome) {
  if (!Object.prototype.hasOwnProperty.call(TABELAS, nome)) throw new ErroHttp(404, `Tabela desconhecida: ${nome}.`);
  return TABELAS[nome];
}

export async function manifesto(env) {
  const nomes = Object.keys(TABELAS);
  const contagens = await env.DB.prepare(`SELECT ${nomes.map(n => `(SELECT COUNT(*) FROM ${n}) AS ${n}`).join(', ')}`).first();
  const meta = await env.DB.prepare("SELECT chave, valor FROM meta WHERE chave IN ('versao_esquema', 'ultima_alteracao')").all();
  const m = Object.fromEntries(meta.results.map(r => [r.chave, r.valor]));
  return {
    formato: 'indicadores-aps-backup',
    versaoEsquema: Number(m.versao_esquema || VERSAO_ESQUEMA),
    ultimaAlteracao: m.ultima_alteracao || null,
    geradoEm: agora(),
    tabelas: Object.fromEntries(nomes.map(n => [n, Number(contagens[n] || 0)])),
    paginaMaxima: LIMITE_MAXIMO
  };
}

// Uma página de uma tabela, a partir de um rowid. Devolve { tabela, linhas, proximo }.
export async function paginaTabela(env, nome, depois, limite) {
  const colunas = tabelaValida(nome);
  const apos = Math.max(0, Number.parseInt(depois, 10) || 0);
  const lim = Math.min(LIMITE_MAXIMO, Math.max(1, Number.parseInt(limite, 10) || LIMITE_PADRAO));
  const objeto = colunas.map(c => `'${c}', ${c}`).join(', ');
  const r = await env.DB.prepare(`
    SELECT json_group_array(json_object(${objeto})) AS linhas, MAX(rid) AS ultimo, COUNT(*) AS n
    FROM (SELECT rowid AS rid, * FROM ${nome} WHERE rowid > ? ORDER BY rowid LIMIT ?)`).bind(apos, lim).first();
  const proximo = r && r.n === lim ? r.ultimo : null;
  return `{"tabela":"${nome}","linhas":${(r && r.n ? r.linhas : '[]')},"proximo":${proximo === null ? 'null' : proximo}}`;
}

// Restauração em três passos: iniciar (apaga tudo), enviar as tabelas em partes, concluir (confere contagens).
export async function iniciarRestauracao(env, corpo) {
  if (corpo.confirmar !== FRASE_CONFIRMACAO) {
    throw new ErroHttp(400, `Para restaurar, envie "confirmar": "${FRASE_CONFIRMACAO}". Todos os dados atuais serão substituídos.`);
  }
  if (Number(corpo.versaoEsquema) !== VERSAO_ESQUEMA) {
    throw new ErroHttp(409, `O backup é da versão ${corpo.versaoEsquema} do esquema; o banco está na versão ${VERSAO_ESQUEMA}.`);
  }
  // Apaga na ordem inversa da restauração.
  const nomes = Object.keys(TABELAS).reverse();
  await env.DB.batch(nomes.map(n => env.DB.prepare(`DELETE FROM ${n}`)));
  return { apagadas: nomes };
}

export async function restaurarParte(env, nome, corpo) {
  const colunas = tabelaValida(nome);
  const linhas = corpo.linhas;
  if (!Array.isArray(linhas)) throw new ErroHttp(400, 'Envie "linhas" como lista.');
  if (linhas.length > LIMITE_MAXIMO) throw new ErroHttp(413, `No máximo ${LIMITE_MAXIMO} linhas por parte.`);
  if (!linhas.length) return { tabela: nome, inseridas: 0 };
  const expr = colunas.map(c => `json_extract(value, '$.${c}')`).join(', ');
  await env.DB.prepare(`INSERT INTO ${nome} (${colunas.join(', ')}) SELECT ${expr} FROM json_each(?)`)
    .bind(JSON.stringify(linhas)).run();
  return { tabela: nome, inseridas: linhas.length };
}

export async function concluirRestauracao(env, corpo) {
  const esperado = corpo.contagens || {};
  const atual = (await manifesto(env)).tabelas;
  const divergencias = Object.keys(TABELAS)
    .filter(n => esperado[n] !== undefined && Number(esperado[n]) !== atual[n])
    .map(n => ({ tabela: n, esperado: Number(esperado[n]), encontrado: atual[n] }));
  const quando = agora();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO meta (chave, valor) VALUES ('restaurado_em', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").bind(quando),
    env.DB.prepare("INSERT INTO meta (chave, valor) VALUES ('ultima_alteracao', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").bind(quando)
  ]);
  return { ok: divergencias.length === 0, contagens: atual, divergencias };
}
