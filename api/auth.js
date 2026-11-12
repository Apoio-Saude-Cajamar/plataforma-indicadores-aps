// Painel APS: login por usuário e senha, sessões por cookie e administração de usuários.
//
// Segurança:
// - Senha: PBKDF2-SHA256 com 100.000 iterações (máximo aceito pelo Workers) e sal aleatório por usuário.
// - Sessão: código aleatório de 32 bytes no cookie __Host-painelaps (HttpOnly, Secure, SameSite=Lax);
//   o banco guarda só o resumo SHA-256 do código. Vale 12 horas.
// - Tentativas: no máximo 5 erros por login e 30 por IP a cada 15 minutos.
// - Pedidos que mudam algo com cookie precisam vir da própria origem (cabeçalho Origin).
import { ErroHttp, json, agora, lerJson, texto } from './util.js';

const COOKIE = '__Host-painelaps';
const HORAS_SESSAO = 12;
const ITERACOES = 100000;
// Iterações para senhas novas: 100.000 (máximo do Cloudflare). Se o plano gratuito acusar
// excesso de CPU no login (erro 1102), defina a variável SENHA_ITERACOES (mínimo 20.000).
// Cada senha guarda o próprio número de iterações, então mudar isto não invalida as antigas.
const iteracoes = env => { const n = Number(env && env.SENHA_ITERACOES); return Number.isFinite(n) && n >= 20000 && n <= ITERACOES ? Math.trunc(n) : ITERACOES; };
const JANELA_MIN = 15;
const MAX_ERROS_LOGIN = 5;
const MAX_ERROS_IP = 30;
const SENHA_MIN = 10;
export const PERFIS = ['admin', 'gestor', 'leitor'];

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = buf => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const aleatorio = n => crypto.getRandomValues(new Uint8Array(n));

async function sha256(texto) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

export async function resumoSenha(senha, salB64, iter = ITERACOES) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const sal = Uint8Array.from(atob(salB64), c => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, chave, 256);
  return b64(bits);
}

export async function novaSenha(senha, env) {
  const sal = b64(aleatorio(16)), it = iteracoes(env);
  return { senha_hash: await resumoSenha(senha, sal, it), senha_sal: sal, senha_iter: it };
}

function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function conferirPoliticaSenha(senha, login) {
  if (typeof senha !== 'string' || senha.length < SENHA_MIN) throw new ErroHttp(400, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  if (senha.length > 200) throw new ErroHttp(400, 'Senha longa demais.');
  if (login && senha.toLowerCase().includes(String(login).toLowerCase())) throw new ErroHttp(400, 'A senha não pode conter o usuário.');
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) throw new ErroHttp(400, 'Use letras e números na senha.');
}

// Senha provisória legível (sem caracteres que se confundem), para entregar ao usuário.
export function senhaProvisoria() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = aleatorio(14);
  let s = '';
  for (const x of b) s += alfabeto[x % alfabeto.length];
  return s.slice(0, 4) + '-' + s.slice(4, 9) + '-' + s.slice(9) + '7';
}

const ip = req => req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '';
const janelaAtual = () => { const d = new Date(); d.setUTCMinutes(Math.floor(d.getUTCMinutes() / JANELA_MIN) * JANELA_MIN, 0, 0); return d.toISOString(); };

export async function registrar(env, usuarioId, acao, detalhe, req) {
  await env.DB.prepare('INSERT INTO registro_acesso (quando, usuario_id, acao, detalhe, ip) VALUES (?, ?, ?, ?, ?)')
    .bind(agora(), usuarioId ?? null, acao, detalhe ?? null, req ? ip(req) : null).run();
}

// ---------- cookies e sessão ----------
function lerCookie(req, nome) {
  const c = req.headers.get('cookie') || '';
  for (const parte of c.split(/;\s*/)) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i) === nome) return parte.slice(i + 1);
  }
  return null;
}

export function cookieSessao(token, maxAge = HORAS_SESSAO * 3600) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function criarSessao(env, usuarioId, origem, req) {
  const token = b64url(aleatorio(32));
  const criada = new Date();
  const expira = new Date(criada.getTime() + HORAS_SESSAO * 3600 * 1000);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessao (token_hash, usuario_id, origem, criada_em, expira_em, ip, agente) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(await sha256(token), usuarioId, origem, criada.toISOString(), expira.toISOString(), ip(req) || null, texto(req.headers.get('user-agent'), 200)),
    env.DB.prepare('UPDATE usuario SET ultimo_acesso = ? WHERE id = ?').bind(criada.toISOString(), usuarioId),
    env.DB.prepare('DELETE FROM sessao WHERE expira_em < ?').bind(criada.toISOString())
  ]);
  return token;
}

// Devolve { usuario, tokenHash } da sessão do pedido, ou null.
export async function sessaoDoPedido(req, env) {
  const token = lerCookie(req, COOKIE);
  if (!token || token.length > 100) return null;
  const h = await sha256(token);
  const r = await env.DB.prepare(
    `SELECT s.token_hash, s.expira_em, s.origem, u.id, u.login, u.nome, u.email, u.perfil, u.unidade, u.trocar_senha, u.ativo
       FROM sessao s JOIN usuario u ON u.id = s.usuario_id WHERE s.token_hash = ?`).bind(h).first();
  if (!r || !r.ativo || r.expira_em < agora()) return null;
  return {
    tokenHash: h,
    usuario: { id: r.id, login: r.login, nome: r.nome, email: r.email, perfil: r.perfil, unidade: r.unidade,
               trocarSenha: !!r.trocar_senha && r.origem === 'senha', origem: r.origem }
  };
}

// Pedidos que mudam algo, autenticados por cookie, precisam vir da mesma origem.
export function conferirOrigem(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const o = req.headers.get('origin');
  if (o && o !== new URL(req.url).origin) throw new ErroHttp(403, 'Origem não permitida.');
}

export async function exigirSessao(req, env, perfis) {
  const s = await sessaoDoPedido(req, env);
  if (!s) throw new ErroHttp(401, 'Faça login para continuar.');
  conferirOrigem(req);
  if (perfis && !perfis.includes(s.usuario.perfil)) throw new ErroHttp(403, 'Seu perfil não permite esta ação.');
  return s;
}

// ---------- rotas de login ----------
async function erros(env, chave) {
  const r = await env.DB.prepare('SELECT n FROM tentativa_login WHERE chave = ? AND janela = ?').bind(chave, janelaAtual()).first();
  return r ? r.n : 0;
}
async function somarErro(env, chaves) {
  const j = janelaAtual();
  await env.DB.batch(chaves.map(c => env.DB.prepare(
    'INSERT INTO tentativa_login (chave, janela, n) VALUES (?, ?, 1) ON CONFLICT (chave, janela) DO UPDATE SET n = n + 1').bind(c, j)));
}

const SAL_FALSO = b64(new Uint8Array(16));

export async function entrar(req, env) {
  conferirOrigem(req);
  const corpo = await lerJson(req);
  const login = texto(corpo.login, 80);
  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
  if (!login || !senha) throw new ErroHttp(400, 'Informe usuário e senha.');
  const chaveLogin = 'login:' + login.toLowerCase(), chaveIp = 'ip:' + ip(req);
  if (await erros(env, chaveLogin) >= MAX_ERROS_LOGIN || await erros(env, chaveIp) >= MAX_ERROS_IP) {
    throw new ErroHttp(429, `Muitas tentativas. Espere ${JANELA_MIN} minutos e tente de novo.`);
  }
  const u = await env.DB.prepare('SELECT * FROM usuario WHERE login = ?').bind(login).first();
  // Mesmo sem usuário, calcula um resumo, para o tempo de resposta não revelar quem existe.
  const h = await resumoSenha(senha, (u && u.senha_sal) || SAL_FALSO, (u && u.senha_iter) || iteracoes(env));
  if (!u || !u.ativo || !u.senha_hash || !iguais(h, u.senha_hash)) {
    await somarErro(env, [chaveLogin, chaveIp]);
    await registrar(env, u ? u.id : null, 'login_falhou', login, req);
    throw new ErroHttp(401, 'Usuário ou senha incorretos.');
  }
  const token = await criarSessao(env, u.id, 'senha', req);
  await registrar(env, u.id, 'login', null, req);
  return new Response(JSON.stringify({ ok: true, trocarSenha: !!u.trocar_senha }), {
    status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': cookieSessao(token) }
  });
}

export async function sair(req, env) {
  conferirOrigem(req);
  const s = await sessaoDoPedido(req, env);
  if (s) await env.DB.prepare('DELETE FROM sessao WHERE token_hash = ?').bind(s.tokenHash).run();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': cookieSessao('', 0) }
  });
}

export async function eu(req, env) {
  const s = await exigirSessao(req, env);
  return json({ usuario: s.usuario });
}

export async function trocarSenha(req, env) {
  const s = await exigirSessao(req, env);
  const corpo = await lerJson(req);
  const u = await env.DB.prepare('SELECT * FROM usuario WHERE id = ?').bind(s.usuario.id).first();
  if (u.senha_hash) {
    const h = await resumoSenha(String(corpo.atual || ''), u.senha_sal, u.senha_iter);
    if (!iguais(h, u.senha_hash)) throw new ErroHttp(400, 'A senha atual não confere.');
  }
  conferirPoliticaSenha(corpo.nova, u.login);
  const n = await novaSenha(corpo.nova, env);
  await env.DB.batch([
    env.DB.prepare('UPDATE usuario SET senha_hash = ?, senha_sal = ?, senha_iter = ?, trocar_senha = 0, atualizado_em = ? WHERE id = ?')
      .bind(n.senha_hash, n.senha_sal, n.senha_iter, agora(), u.id),
    // encerra as outras sessões do usuário
    env.DB.prepare('DELETE FROM sessao WHERE usuario_id = ? AND token_hash <> ?').bind(u.id, s.tokenHash)
  ]);
  await registrar(env, u.id, 'senha_trocada', null, req);
  return json({ ok: true });
}

// ---------- administração de usuários (perfil admin ou chave TOKEN_ADMIN) ----------
const CAMPOS_PUBLICOS = 'id, login, nome, email, perfil, unidade, ativo, trocar_senha, criado_em, atualizado_em, ultimo_acesso, (senha_hash IS NOT NULL) AS tem_senha';

export async function listarUsuarios(env) {
  const r = await env.DB.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM usuario ORDER BY nome`).all();
  return { usuarios: r.results };
}

function validarUsuario(c, parcial) {
  const out = {};
  if (!parcial || c.login !== undefined) {
    const l = texto(c.login, 60);
    if (!l || !/^[a-z0-9._-]{3,60}$/i.test(l)) throw new ErroHttp(400, 'Usuário inválido: use 3 a 60 letras, números, ponto, hífen ou sublinhado.');
    out.login = l.toLowerCase();
  }
  if (!parcial || c.nome !== undefined) {
    const n = texto(c.nome, 120);
    if (!n) throw new ErroHttp(400, 'Informe o nome.');
    out.nome = n;
  }
  if (c.email !== undefined) out.email = texto(c.email, 160);
  if (c.perfil !== undefined || !parcial) {
    const p = c.perfil || 'leitor';
    if (!PERFIS.includes(p)) throw new ErroHttp(400, 'Perfil inválido.');
    out.perfil = p;
  }
  if (c.unidade !== undefined) out.unidade = texto(c.unidade, 160);
  if (c.ativo !== undefined) out.ativo = c.ativo ? 1 : 0;
  return out;
}

export async function criarUsuario(req, env, quem) {
  const c = await lerJson(req);
  const d = validarUsuario(c, false);
  const provisoria = c.senha ? null : senhaProvisoria();
  const senha = c.senha || provisoria;
  conferirPoliticaSenha(senha, d.login);
  const n = await novaSenha(senha, env);
  const t = agora();
  try {
    await env.DB.prepare(`INSERT INTO usuario (login, nome, email, perfil, unidade, senha_hash, senha_sal, senha_iter, trocar_senha, ativo, criado_em, atualizado_em)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
      .bind(d.login, d.nome, d.email ?? null, d.perfil, d.unidade ?? null, n.senha_hash, n.senha_sal, n.senha_iter, t, t).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new ErroHttp(409, 'Já existe um usuário com esse login.');
    throw e;
  }
  const u = await env.DB.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE login = ?`).bind(d.login).first();
  await registrar(env, quem, 'usuario_criado', d.login, req);
  return { usuario: u, senhaProvisoria: provisoria };
}

export async function alterarUsuario(req, env, id, quem) {
  const c = await lerJson(req);
  const atual = await env.DB.prepare('SELECT * FROM usuario WHERE id = ?').bind(id).first();
  if (!atual) throw new ErroHttp(404, 'Usuário não encontrado.');
  const d = validarUsuario(c, true);
  delete d.login;
  // Não deixa o sistema sem nenhum administrador ativo.
  if ((d.perfil && d.perfil !== 'admin') || d.ativo === 0) {
    if (atual.perfil === 'admin') {
      const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM usuario WHERE perfil = 'admin' AND ativo = 1 AND id <> ?").bind(id).first()).n;
      if (!n) throw new ErroHttp(400, 'Este é o único administrador ativo.');
    }
  }
  const sets = Object.keys(d).map(k => `${k} = ?`);
  const vals = Object.values(d);
  let provisoria = null;
  if (c.redefinirSenha) {
    provisoria = senhaProvisoria();
    const n = await novaSenha(provisoria, env);
    sets.push('senha_hash = ?', 'senha_sal = ?', 'senha_iter = ?', 'trocar_senha = 1');
    vals.push(n.senha_hash, n.senha_sal, n.senha_iter);
  }
  if (!sets.length) throw new ErroHttp(400, 'Nada para alterar.');
  sets.push('atualizado_em = ?');
  vals.push(agora());
  const ops = [env.DB.prepare(`UPDATE usuario SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id)];
  if (c.redefinirSenha || d.ativo === 0) ops.push(env.DB.prepare('DELETE FROM sessao WHERE usuario_id = ?').bind(id));
  await env.DB.batch(ops);
  await registrar(env, quem, c.redefinirSenha ? 'senha_redefinida' : 'usuario_alterado', atual.login, req);
  const u = await env.DB.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id = ?`).bind(id).first();
  return { usuario: u, senhaProvisoria: provisoria };
}

// ---------- integração com o login do Apoio ----------
// O Apoio autentica a pessoa e devolve para /auth/apoio?handoff=<código de uso único>.
// O Painel APS troca o código pela identidade num endpoint do Apoio (servidor a servidor),
// configurado nas variáveis APOIO_RESGATE_URL e APOIO_CHAVE. Sem elas, a integração fica desligada.
export function configApoio(env) {
  return {
    ligado: !!(env.APOIO_LOGIN_URL && env.APOIO_RESGATE_URL && env.APOIO_CHAVE),
    loginUrl: env.APOIO_LOGIN_URL || null
  };
}

export async function retornoApoio(req, env, url) {
  const destinoErro = m => Response.redirect(new URL('/entrar?erro=' + encodeURIComponent(m), url).toString(), 302);
  const cfg = configApoio(env);
  if (!cfg.ligado) return destinoErro('A entrada pelo Apoio ainda não está ligada.');
  const codigo = url.searchParams.get('handoff');
  if (!codigo || codigo.length > 512) return destinoErro('Código do Apoio ausente. Tente entrar de novo.');
  let dados;
  try {
    const r = await fetch(env.APOIO_RESGATE_URL, {
      method: 'POST',
      // 'x-handoff-secret' é o cabeçalho que o Apoio já usa em /api/handoff/consume; 'authorization' vale para um endpoint novo.
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.APOIO_CHAVE, 'x-handoff-secret': env.APOIO_CHAVE },
      body: JSON.stringify({ token: codigo, servico: env.APOIO_SERVICO || 'painelaps' })
    });
    if (!r.ok) return destinoErro(r.status === 403 ? 'Seu usuário do Apoio não tem acesso ao Painel APS.' : 'O código do Apoio expirou. Tente entrar de novo.');
    dados = await r.json();
  } catch {
    return destinoErro('Não foi possível falar com o Apoio agora.');
  }
  const ext = dados && (dados.usuario || dados.user) || {};
  const login = texto(ext.login || ext.username, 60);
  if (!login) return destinoErro('O Apoio não informou o usuário.');
  let u = await env.DB.prepare('SELECT * FROM usuario WHERE login = ?').bind(login.toLowerCase()).first();
  // Quem é super_admin no Apoio entra como administrador do Painel APS (é criado ou promovido na hora).
  // A lista pode ser mudada em APOIO_PERFIS_ADMIN (separada por vírgula); vazio desliga esta regra.
  const perfisAdmin = String(env.APOIO_PERFIS_ADMIN ?? 'super_admin').split(',').map(x => x.trim()).filter(Boolean);
  const ehAdminApoio = perfisAdmin.includes(String(ext.role || ext.perfil || ''));
  if (ehAdminApoio) {
    const t = agora();
    if (!u) {
      await env.DB.prepare(`INSERT INTO usuario (login, nome, email, perfil, trocar_senha, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, 'admin', 0, 1, ?, ?)`)
        .bind(login.toLowerCase(), texto(ext.nome || ext.name, 120) || login, texto(ext.email, 160), t, t).run();
      u = await env.DB.prepare('SELECT * FROM usuario WHERE login = ?').bind(login.toLowerCase()).first();
      await registrar(env, u.id, 'admin_criado_apoio', login, req);
    } else if (u.ativo && u.perfil !== 'admin') {
      await env.DB.prepare(`UPDATE usuario SET perfil = 'admin', atualizado_em = ? WHERE id = ?`).bind(t, u.id).run();
      u = await env.DB.prepare('SELECT * FROM usuario WHERE login = ?').bind(login.toLowerCase()).first();
      await registrar(env, u.id, 'admin_promovido_apoio', login, req);
    }
  }
  if (!u && env.APOIO_CRIAR_USUARIOS === 'sim') {
    const t = agora();
    await env.DB.prepare(`INSERT INTO usuario (login, nome, email, perfil, trocar_senha, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, 'leitor', 0, 1, ?, ?)`)
      .bind(login.toLowerCase(), texto(ext.nome || ext.name, 120) || login, texto(ext.email, 160), t, t).run();
    u = await env.DB.prepare('SELECT * FROM usuario WHERE login = ?').bind(login.toLowerCase()).first();
    await registrar(env, u.id, 'usuario_criado_apoio', login, req);
  }
  if (!u || !u.ativo) return destinoErro('Seu usuário ainda não foi liberado no Painel APS. Fale com o administrador.');
  const token = await criarSessao(env, u.id, 'apoio', req);
  await registrar(env, u.id, 'login_apoio', null, req);
  return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': cookieSessao(token), 'cache-control': 'no-store' } });
}
