// Equipes homologadas, isto é, avaliadas pelo Ministério no cofinanciamento federal. O Painel não tem como saber isso pelo
// PEC: o administrador marca na página Composição. Equipe sem marcação segue a regra padrão (painel/js/homologacao.js).
// Fica numa linha só da tabela meta: { marcadas: { "<INE>": true|false }, em, por }.
import { ErroHttp, agora } from './util.js';

const CHAVE = 'equipes:homologacao';
const ine10 = (v) => String(v ?? '').replace(/\D/g, '').padStart(10, '0');

export async function lerHomologacao(env) {
  const r = await env.DB.prepare('SELECT valor FROM meta WHERE chave = ?').bind(CHAVE).first();
  let v = {};
  try {
    v = r && r.valor ? JSON.parse(r.valor) : {};
  } catch (_) {
    v = {};
  }
  return { marcadas: v.marcadas || {}, atualizadoEm: v.em || null, por: v.por || null };
}

// corpo: { ine, homologada: true | false | null } — null volta a equipe para a regra padrão.
export async function gravarHomologacao(env, corpo, quem) {
  const bruto = String(corpo && corpo.ine != null ? corpo.ine : '').replace(/\D/g, '');
  if (bruto.length < 6 || bruto.length > 10) throw new ErroHttp(400, 'INE inválido.');
  const h = corpo.homologada;
  if (h !== true && h !== false && h !== null) throw new ErroHttp(400, 'Informe "homologada": true, false ou null.');
  const ine = ine10(bruto);
  const atual = await lerHomologacao(env);
  const marcadas = { ...atual.marcadas };
  if (h === null) delete marcadas[ine];
  else marcadas[ine] = h;
  const valor = JSON.stringify({ marcadas, em: agora(), por: quem ?? null });
  await env.DB.prepare('INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor')
    .bind(CHAVE, valor)
    .run();
  return { ok: true, ine, homologada: h, marcadas };
}
