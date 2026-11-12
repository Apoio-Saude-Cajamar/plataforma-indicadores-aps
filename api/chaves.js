// Chaves de coleta: o administrador gera, a extensão usa (só enviar coletas e composição), qualquer uma pode ser revogada.
import { ErroHttp, agora, lerJson, texto } from './util.js';
import { registrar } from './auth.js';

async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function novaChave() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return 'pc_' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function listarChaves(env) {
  const { results } = await env.DB.prepare('SELECT id, nome, prefixo, criada_em AS criadaEm, expira_em AS expiraEm, ultimo_uso AS ultimoUso, revogada_em AS revogadaEm FROM chave_coleta ORDER BY id DESC').all();
  return { chaves: results };
}

export async function criarChave(req, env, adminId) {
  const c = await lerJson(req);
  const nome = texto(c.nome, 80);
  if (!nome) throw new ErroHttp(400, 'Dê um nome à chave (por exemplo, o computador onde será usada).');
  let expira = null;
  if (c.dias !== undefined && c.dias !== null && c.dias !== '') {
    const d = Number(c.dias);
    if (!Number.isInteger(d) || d < 1 || d > 730) throw new ErroHttp(400, 'Validade deve ser de 1 a 730 dias.');
    expira = new Date(Date.now() + d * 86400000).toISOString();
  }
  const chave = novaChave();
  const r = await env.DB.prepare('INSERT INTO chave_coleta (nome, prefixo, hash, criada_por, criada_em, expira_em) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(nome, chave.slice(0, 7), await sha256(chave), adminId ?? null, agora(), expira).run();
  if (adminId) await registrar(env, adminId, 'chave_coleta_criada', String(r.meta.last_row_id), req);
  return { id: r.meta.last_row_id, chave, aviso: 'Copie agora: esta chave não será mostrada de novo.' };
}

export async function revogarChave(req, env, id, adminId) {
  const r = await env.DB.prepare('UPDATE chave_coleta SET revogada_em = ? WHERE id = ? AND revogada_em IS NULL').bind(agora(), id).run();
  if (!r.meta.changes) throw new ErroHttp(404, 'Chave não encontrada ou já revogada.');
  if (adminId) await registrar(env, adminId, 'chave_coleta_revogada', String(id), req);
  return { ok: true };
}

// Confere a chave do cabeçalho Authorization. Devolve true se for uma chave gerada, válida e não revogada.
export async function chaveGeradaValida(request, env) {
  const cab = request.headers.get('authorization') || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
  if (!/^pc_[\w-]{30,}$/.test(token)) return false;
  const l = await env.DB.prepare('SELECT id, expira_em AS exp, revogada_em AS rev, ultimo_uso AS uso FROM chave_coleta WHERE hash = ?').bind(await sha256(token)).first();
  if (!l || l.rev || (l.exp && l.exp < agora())) return false;
  const t = agora();
  if (!l.uso || Date.parse(t) - Date.parse(l.uso) > 60000) await env.DB.prepare('UPDATE chave_coleta SET ultimo_uso = ? WHERE id = ?').bind(t, l.id).run();
  return true;
}
