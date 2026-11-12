// Comunicados internos: o administrador publica, cada usuário vê até marcar "Entendi".
import { ErroHttp, agora, lerJson, texto } from './util.js';
import { exigirSessao, registrar } from './auth.js';

const NIVEIS = ['info', 'importante'];
const PUBLICOS = ['todos', 'admin', 'gestor', 'leitor'];

function data(v, campo) {
  if (v === undefined || v === null || v === '') return null;
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) throw new ErroHttp(400, `Data inválida em ${campo}.`);
  return t.toISOString();
}

function validar(c, parcial) {
  const o = {};
  if (!parcial || c.titulo !== undefined) { o.titulo = texto(c.titulo, 120); if (!o.titulo) throw new ErroHttp(400, 'Informe o título.'); }
  if (!parcial || c.texto !== undefined) { o.texto = texto(c.texto, 2000); if (!o.texto) throw new ErroHttp(400, 'Informe o texto do comunicado.'); }
  if (!parcial || c.nivel !== undefined) { o.nivel = c.nivel || 'info'; if (!NIVEIS.includes(o.nivel)) throw new ErroHttp(400, 'Nível inválido.'); }
  if (!parcial || c.publico !== undefined) { o.publico = c.publico || 'todos'; if (!PUBLICOS.includes(o.publico)) throw new ErroHttp(400, 'Público inválido.'); }
  if (!parcial || c.inicioEm !== undefined) o.inicio_em = data(c.inicioEm, 'início');
  if (!parcial || c.fimEm !== undefined) o.fim_em = data(c.fimEm, 'fim');
  if (c.ativo !== undefined) o.ativo = c.ativo ? 1 : 0;
  return o;
}

// Comunicados em vigor para o usuário logado, com a marca de lido.
export async function comunicadosAtivos(req, env) {
  const { usuario } = await exigirSessao(req, env);
  const t = agora();
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.titulo, c.texto, c.nivel, c.criado_em AS criadoEm, (l.usuario_id IS NOT NULL) AS lido
    FROM comunicado c LEFT JOIN comunicado_leitura l ON l.comunicado_id = c.id AND l.usuario_id = ?
    WHERE c.ativo = 1 AND (c.inicio_em IS NULL OR c.inicio_em <= ?) AND (c.fim_em IS NULL OR c.fim_em >= ?)
      AND c.publico IN ('todos', ?)
    ORDER BY (c.nivel = 'importante') DESC, c.criado_em DESC LIMIT 20`).bind(usuario.id, t, t, usuario.perfil).all();
  return { comunicados: results.map(r => ({ ...r, lido: !!r.lido })) };
}

export async function marcarLido(req, env, id) {
  const { usuario } = await exigirSessao(req, env);
  const c = await env.DB.prepare('SELECT id FROM comunicado WHERE id = ?').bind(id).first();
  if (!c) throw new ErroHttp(404, 'Comunicado não encontrado.');
  await env.DB.prepare('INSERT OR IGNORE INTO comunicado_leitura (comunicado_id, usuario_id, lido_em) VALUES (?, ?, ?)').bind(id, usuario.id, agora()).run();
  return { ok: true };
}

export async function listarComunicados(env) {
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.titulo, c.texto, c.nivel, c.publico, c.inicio_em AS inicioEm, c.fim_em AS fimEm, c.ativo, c.criado_em AS criadoEm,
           (SELECT COUNT(*) FROM comunicado_leitura l WHERE l.comunicado_id = c.id) AS leituras
    FROM comunicado c ORDER BY c.criado_em DESC LIMIT 100`).all();
  const alvo = await env.DB.prepare(`SELECT perfil, COUNT(*) AS n FROM usuario WHERE ativo = 1 GROUP BY perfil`).all();
  const porPerfil = Object.fromEntries(alvo.results.map(r => [r.perfil, r.n]));
  const total = Object.values(porPerfil).reduce((a, b) => a + b, 0);
  return { comunicados: results.map(r => ({ ...r, ativo: !!r.ativo, destinatarios: r.publico === 'todos' ? total : (porPerfil[r.publico] || 0) })) };
}

export async function criarComunicado(req, env, adminId) {
  const o = validar(await lerJson(req), false);
  if (o.inicio_em && o.fim_em && o.fim_em < o.inicio_em) throw new ErroHttp(400, 'O fim deve ser depois do início.');
  const t = agora();
  const r = await env.DB.prepare(`INSERT INTO comunicado (titulo, texto, nivel, publico, inicio_em, fim_em, ativo, criado_por, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).bind(o.titulo, o.texto, o.nivel, o.publico, o.inicio_em, o.fim_em, adminId ?? null, t, t).run();
  const id = r.meta.last_row_id;
  if (adminId) await registrar(env, adminId, 'comunicado_criado', String(id), req);
  return { id };
}

export async function alterarComunicado(req, env, id, adminId) {
  const o = validar(await lerJson(req), true);
  const campos = Object.keys(o);
  if (!campos.length) throw new ErroHttp(400, 'Nada para alterar.');
  const r = await env.DB.prepare(`UPDATE comunicado SET ${campos.map(c => c + ' = ?').join(', ')}, atualizado_em = ? WHERE id = ?`).bind(...campos.map(c => o[c]), agora(), id).run();
  if (!r.meta.changes) throw new ErroHttp(404, 'Comunicado não encontrado.');
  if (adminId) await registrar(env, adminId, 'comunicado_alterado', String(id), req);
  return { ok: true };
}
