// Registros de ações (quem fez o quê e quando) e estado do backup, para o menu do usuário.
// Nunca expõe senhas nem endereços de IP; os registros só trazem a ação e o detalhe gravados.
import { manifesto } from './backup.js';

export async function meusRegistros(env, usuarioId) {
  if (!usuarioId) return { registros: [] };
  const { results } = await env.DB.prepare(
    'SELECT quando, acao, detalhe FROM registro_acesso WHERE usuario_id = ? ORDER BY id DESC LIMIT 30',
  )
    .bind(usuarioId)
    .all();
  return { registros: results };
}

export async function registros(env) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.quando, r.acao, r.detalhe, u.nome AS usuario, u.login
    FROM registro_acesso r LEFT JOIN usuario u ON u.id = r.usuario_id ORDER BY r.id DESC LIMIT 300`,
  ).all();
  return { registros: results };
}

export async function estadoBackup(env) {
  const m = await manifesto(env);
  return { geradoEm: m.geradoEm, ultimaAlteracao: m.ultimaAlteracao, versaoEsquema: m.versaoEsquema, tabelas: m.tabelas };
}
