import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../api/index.js';
import { ambiente, CHAVES } from './d1-local.mjs';

const BASE = 'https://painelaps.teste';

// Páginas falsas no lugar do ASSETS do Cloudflare.
function comPaginas(env) {
  env.ASSETS = { fetch: async req => new Response('pagina:' + new URL(req.url).pathname, { status: 200, headers: { 'content-type': 'text/html' } }) };
  return env;
}

function navegador(env) {
  let cookie = '';
  async function pedir(metodo, caminho, corpo, extra = {}) {
    const headers = { ...(extra.headers || {}) };
    if (corpo !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const r = await worker.fetch(new Request(BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo), redirect: 'manual' }), env);
    const sc = r.headers.get('set-cookie');
    if (sc) { const v = sc.split(';')[0]; cookie = /=$/.test(v) ? '' : v; }
    return r;
  }
  return { pedir, get cookie() { return cookie; } };
}

async function admin(env, corpo) {
  const r = await worker.fetch(new Request(BASE + '/api/v1/usuarios', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CHAVES.TOKEN_ADMIN }, body: JSON.stringify(corpo)
  }), env);
  return { status: r.status, ...(await r.json()) };
}

test('primeiro administrador pela chave TOKEN_ADMIN, com senha provisória', async () => {
  const env = comPaginas(ambiente());
  const r = await admin(env, { login: 'Herbet.Santos', nome: 'Herbet Santos', perfil: 'admin' });
  assert.equal(r.status, 201);
  assert.equal(r.usuario.login, 'herbet.santos');
  assert.match(r.senhaProvisoria, /^\S{4}-\S{5}-\S+$/);
  const linha = await env.DB.prepare('SELECT senha_hash, senha_sal FROM usuario WHERE login = ?').bind('herbet.santos').first();
  assert.ok(linha.senha_hash && !linha.senha_hash.includes(r.senhaProvisoria), 'senha guardada só como resumo');
  assert.equal((await admin(env, { login: 'herbet.santos', nome: 'X' })).status, 409);
  const semChave = await worker.fetch(new Request(BASE + '/api/v1/usuarios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), env);
  assert.equal(semChave.status, 401);
});

test('login, troca obrigatória de senha, painel protegido e saída', async () => {
  const env = comPaginas(ambiente());
  const { senhaProvisoria } = await admin(env, { login: 'ana', nome: 'Ana Lima', perfil: 'leitor' });
  const nav = navegador(env);

  // sem sessão: painel manda para /entrar, que é público
  let r = await nav.pedir('GET', '/');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/entrar$/);
  r = await nav.pedir('GET', '/usuarios?x=1');
  assert.match(r.headers.get('location'), /\/entrar\?volta=%2Fusuarios%3Fx%3D1$/);
  assert.equal((await nav.pedir('GET', '/entrar')).status, 200);
  assert.equal((await nav.pedir('GET', '/api/v1/dados?competencia=2026-10')).status, 401);

  // senha errada
  r = await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'ana', senha: 'errada123456' });
  assert.equal(r.status, 401);

  // senha provisória: entra, mas precisa trocar
  r = await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'ANA', senha: senhaProvisoria });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).trocarSenha, true);
  assert.match(nav.cookie, /^__Host-painelaps=/);
  r = await nav.pedir('GET', '/');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/trocar-senha$/);

  // política de senha
  r = await nav.pedir('POST', '/api/v1/auth/senha', { atual: senhaProvisoria, nova: 'curta1' });
  assert.equal(r.status, 400);
  r = await nav.pedir('POST', '/api/v1/auth/senha', { atual: senhaProvisoria, nova: 'ana-senha-2026x' });
  assert.equal(r.status, 400, 'não pode conter o usuário');
  r = await nav.pedir('POST', '/api/v1/auth/senha', { atual: 'errada', nova: 'Painel2026certa' });
  assert.equal(r.status, 400);
  r = await nav.pedir('POST', '/api/v1/auth/senha', { atual: senhaProvisoria, nova: 'Painel2026certa' });
  assert.equal(r.status, 200);

  // agora o painel abre, e a leitura de dados aceita a sessão
  r = await nav.pedir('GET', '/');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal((await nav.pedir('GET', '/api/v1/auth/eu')).status, 200);
  assert.equal((await nav.pedir('GET', '/api/v1/competencias')).status, 200);
  // leitor não administra usuários nem abre a página de usuários
  assert.equal((await nav.pedir('GET', '/api/v1/usuarios')).status, 403);
  assert.equal((await nav.pedir('GET', '/usuarios')).status, 302);
  // sessão não grava coletas (só a chave da extensão)
  assert.equal((await nav.pedir('POST', '/api/v1/coletas', { competencia: '2026-10' })).status, 401);

  // pedido de outra origem é recusado
  r = await nav.pedir('POST', '/api/v1/auth/senha', { atual: 'x', nova: 'y' }, { headers: { origin: 'https://malicioso.exemplo' } });
  assert.equal(r.status, 403);

  // sair encerra a sessão no banco
  assert.equal((await nav.pedir('POST', '/api/v1/auth/sair')).status, 200);
  assert.equal(nav.cookie, '');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM sessao').first()).n, 0);
});

test('limite de tentativas por login', async () => {
  const env = comPaginas(ambiente());
  await admin(env, { login: 'bia', nome: 'Bia', senha: 'SenhaForte2026' });
  const nav = navegador(env);
  for (let i = 0; i < 5; i++) assert.equal((await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'bia', senha: 'errada' + i + 'xxxxx' })).status, 401);
  const r = await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'bia', senha: 'SenhaForte2026' });
  assert.equal(r.status, 429, 'bloqueia mesmo com a senha certa até a janela passar');
  assert.equal((await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'naoexiste', senha: 'x' })).status, 401);
});

test('administrador: redefinir senha, desativar e proteger o último admin', async () => {
  const env = comPaginas(ambiente());
  await admin(env, { login: 'chefe', nome: 'Chefe', perfil: 'admin', senha: 'Admin#Forte2026' });
  const { usuario } = await admin(env, { login: 'leo', nome: 'Leo', senha: 'Painel#Forte2026' });
  const navA = navegador(env), navL = navegador(env);
  await navA.pedir('POST', '/api/v1/auth/entrar', { login: 'chefe', senha: 'Admin#Forte2026' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  await navL.pedir('POST', '/api/v1/auth/entrar', { login: 'leo', senha: 'Painel#Forte2026' });

  let r = await navA.pedir('GET', '/api/v1/usuarios');
  assert.equal((await r.json()).usuarios.length, 2);
  assert.equal((await navA.pedir('GET', '/usuarios')).status, 200);

  r = await navA.pedir('PATCH', '/api/v1/usuarios/' + usuario.id, { redefinirSenha: true });
  const d = await r.json();
  assert.ok(d.senhaProvisoria);
  // a sessão do Leo caiu
  assert.equal((await navL.pedir('GET', '/api/v1/auth/eu')).status, 401);

  r = await navA.pedir('PATCH', '/api/v1/usuarios/' + usuario.id, { ativo: false });
  assert.equal(r.status, 200);
  assert.equal((await navL.pedir('POST', '/api/v1/auth/entrar', { login: 'leo', senha: d.senhaProvisoria })).status, 401);

  const idChefe = (await env.DB.prepare("SELECT id FROM usuario WHERE login = 'chefe'").first()).id;
  r = await navA.pedir('PATCH', '/api/v1/usuarios/' + idChefe, { perfil: 'leitor' });
  assert.equal(r.status, 400, 'não deixa sem administrador');
});

test('entrada pelo Apoio fica desligada sem configuração e funciona com ela', async () => {
  const env = comPaginas(ambiente());
  let r = await worker.fetch(new Request(BASE + '/api/v1/auth/config'), env);
  assert.equal((await r.json()).apoio.ligado, false);
  r = await worker.fetch(new Request(BASE + '/auth/apoio?handoff=abc', { redirect: 'manual' }), env);
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/entrar\?erro=/);

  Object.assign(env, { APOIO_LOGIN_URL: 'https://apoio.teste/login', APOIO_RESGATE_URL: 'https://apoio.teste/api/handoff/resgatar', APOIO_CHAVE: 'k'.repeat(40) });
  await admin(env, { login: 'carla', nome: 'Carla', senha: 'Apoio#Forte2026' });
  const original = globalThis.fetch;
  let recebido = null;
  globalThis.fetch = async (url, init) => {
    recebido = { url: String(url), auth: init.headers.authorization, corpo: JSON.parse(init.body) };
    if (recebido.corpo.token === 'bom') return new Response(JSON.stringify({ user: { username: 'carla', name: 'Carla' } }), { status: 200 });
    if (recebido.corpo.token === 'semacesso') return new Response('{}', { status: 403 });
    return new Response('{}', { status: 410 });
  };
  try {
    r = await worker.fetch(new Request(BASE + '/auth/apoio?handoff=bom', { redirect: 'manual' }), env);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/');
    assert.match(r.headers.get('set-cookie'), /^__Host-painelaps=/);
    assert.equal(recebido.auth, 'Bearer ' + 'k'.repeat(40));
    assert.equal(recebido.corpo.servico, 'painelaps');
    r = await worker.fetch(new Request(BASE + '/auth/apoio?handoff=semacesso', { redirect: 'manual' }), env);
    assert.match(decodeURIComponent(r.headers.get('location')), /não tem acesso/);
    // usuário do Apoio que não existe no Painel APS: não entra (APOIO_CRIAR_USUARIOS != "sim")
    globalThis.fetch = async () => new Response(JSON.stringify({ user: { username: 'desconhecido' } }), { status: 200 });
    r = await worker.fetch(new Request(BASE + '/auth/apoio?handoff=x', { redirect: 'manual' }), env);
    assert.match(decodeURIComponent(r.headers.get('location')), /ainda não foi liberado/);
    // super_admin do Apoio: é criado como administrador; usuário comum existente não é promovido
    globalThis.fetch = async () => new Response(JSON.stringify({ valid: true, user: { username: 'chefe', name: 'Chefe', role: 'super_admin' } }), { status: 200 });
    r = await worker.fetch(new Request(BASE + '/auth/apoio?handoff=a', { redirect: 'manual' }), env);
    assert.equal(r.headers.get('location'), '/');
    const chefe = await env.DB.prepare("SELECT perfil, ativo FROM usuario WHERE login = 'chefe'").first();
    assert.equal(chefe.perfil, 'admin');
    globalThis.fetch = async () => new Response(JSON.stringify({ valid: true, user: { username: 'carla', role: 'admin' } }), { status: 200 });
    await worker.fetch(new Request(BASE + '/auth/apoio?handoff=b', { redirect: 'manual' }), env);
    assert.notEqual((await env.DB.prepare("SELECT perfil FROM usuario WHERE login = 'carla'").first()).perfil, 'admin');
  } finally {
    globalThis.fetch = original;
  }
});

test('ponto de entrada do Pages (functions/_middleware.js) usa a mesma lógica', async () => {
  const { onRequest } = await import('../functions/_middleware.js');
  const env = comPaginas(ambiente());
  let r = await onRequest({ request: new Request(BASE + '/api/v1/saude'), env });
  assert.equal((await r.json()).servico, 'painelaps');
  r = await onRequest({ request: new Request(BASE + '/', { redirect: 'manual' }), env });
  assert.equal(r.status, 302);
});

test('composição: a extensão grava com a chave e o painel lê com a sessão', async () => {
  const env = comPaginas(ambiente());
  const put = (corpo, chave = CHAVES.TOKEN_COLETA) => worker.fetch(new Request(BASE + '/api/v1/composicao', { method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + chave }, body: JSON.stringify(corpo) }), env);
  assert.equal((await put({ competencia: '2026-10' })).status, 400);
  assert.equal((await put({ competencia: '2026-10', unidades: [] }, CHAVES.TOKEN_BACKUP)).status, 401);
  assert.equal((await put({ competencia: '2026-09', coletadoEm: '2026-10-01T10:00:00Z', unidades: [{ nome: 'U0', equipes: [] }] })).status, 200);
  assert.equal((await put({ competencia: '2026-10', coletadoEm: '2026-11-03T10:00:00Z', alertas: ['x'], unidades: [{ nome: 'U1', equipes: [] }] })).status, 200);
  assert.equal((await put({ competencia: '2026-10', coletadoEm: '2026-11-04T10:00:00Z', unidades: [{ nome: 'U2', equipes: [] }] })).status, 200);

  await admin(env, { login: 'dora', nome: 'Dora', senha: 'Painel#Forte2026' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  const nav = navegador(env);
  assert.equal((await nav.pedir('GET', '/api/v1/composicao')).status, 401);
  await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'dora', senha: 'Painel#Forte2026' });
  let d = await (await nav.pedir('GET', '/api/v1/composicao')).json();
  assert.deepEqual(d.competencias, ['2026-10', '2026-09']);
  assert.equal(d.composicao.unidades[0].nome, 'U2', 'vale o último envio da competência');
  d = await (await nav.pedir('GET', '/api/v1/composicao?competencia=2026-09')).json();
  assert.equal(d.composicao.unidades[0].nome, 'U0');
  // a sessão não grava
  assert.equal((await nav.pedir('PUT', '/api/v1/composicao', { competencia: '2026-10', unidades: [] })).status, 401);
  assert.equal((await nav.pedir('GET', '/composicao')).status, 200);
  for (const p of ['/', '/federal', '/federal-notas', '/estadual', '/municipal']) assert.equal((await nav.pedir('GET', p)).status, 200, p);
  for (const p of ['/extensao', '/downloads/coletor-aps-v0.8.2.zip']) assert.notEqual((await nav.pedir('GET', p)).status, 200, p + ' só para administrador');
});

test('população: lê a estimativa mais recente do IBGE (com resposta simulada)', async () => {
  const { populacaoMunicipio } = await import('../api/populacao.js');
  const resp = { ok: true, json: async () => [{ resultados: [{ series: [{ localidade: { nome: 'Cajamar - SP' }, serie: { 2024: '80100', 2025: '81234' } }] }] }] };
  const r = await populacaoMunicipio({}, async () => resp);
  assert.equal(r.populacao, 81234);
  assert.equal(r.ano, 2025);
  await assert.rejects(() => populacaoMunicipio({}, async () => ({ ok: true, json: async () => [] })));
  await assert.rejects(() => populacaoMunicipio({}, async () => ({ ok: false })));
});

test('monitoramento: só administrador; avisa quando não há coleta e quando a composição tem pontos a conferir', async () => {
  const env = comPaginas(ambiente());
  await admin(env, { login: 'ana', nome: 'Ana', senha: 'Painel#Forte2026', perfil: 'admin' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  const anon = navegador(env);
  assert.equal((await anon.pedir('GET', '/api/v1/monitoramento')).status, 401);
  const nav = navegador(env);
  await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'ana', senha: 'Painel#Forte2026' });
  let r = await nav.pedir('GET', '/api/v1/monitoramento');
  assert.equal(r.status, 200);
  let d = await r.json();
  assert.equal(d.situacao, 'erro');
  assert.ok(d.itens.some(i => i.titulo === 'Nenhuma coleta recebida'));
  await worker.fetch(new Request(BASE + '/api/v1/composicao', { method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CHAVES.TOKEN_COLETA },
    body: JSON.stringify({ competencia: '2026-10', coletadoEm: new Date().toISOString(), unidades: [{ nome: 'U1', alertas: [], equipes: [{ nome: 'E1', tipo: 'ESF', alertas: ['Sem médico lotado.'] }] }] }) }), env);
  d = await (await nav.pedir('GET', '/api/v1/monitoramento')).json();
  const c = d.itens.find(i => i.fonte === 'Composição das equipes' && i.nivel === 'atencao');
  assert.ok(c && c.lista[0].includes('Sem médico lotado.'));
  assert.equal((await nav.pedir('GET', '/monitoramento')).status, 200);
});

test('comunicados: administrador publica, usuário vê e marca "Entendi", público respeitado', async () => {
  const env = comPaginas(ambiente());
  await admin(env, { login: 'ana', nome: 'Ana', senha: 'Painel#Forte2026', perfil: 'admin' });
  await admin(env, { login: 'leo', nome: 'Leo', senha: 'Painel#Forte2026', perfil: 'leitor' });
  await admin(env, { login: 'gil', nome: 'Gil', senha: 'Painel#Forte2026', perfil: 'gestor' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  const entrar = async l => { const n = navegador(env); await n.pedir('POST', '/api/v1/auth/entrar', { login: l, senha: 'Painel#Forte2026' }); return n; };
  const ana = await entrar('ana'), leo = await entrar('leo'), gil = await entrar('gil');
  assert.equal((await leo.pedir('POST', '/api/v1/comunicados', { titulo: 'x', texto: 'y' })).status, 403);
  assert.equal((await ana.pedir('POST', '/api/v1/comunicados', { titulo: '', texto: 'y' })).status, 400);
  assert.equal((await ana.pedir('POST', '/api/v1/comunicados', { titulo: 'Manutenção', texto: 'Sábado o painel fica fora do ar.', nivel: 'importante' })).status, 201);
  assert.equal((await ana.pedir('POST', '/api/v1/comunicados', { titulo: 'Só gestores', texto: 'Reunião.', publico: 'gestor' })).status, 201);
  assert.equal((await ana.pedir('POST', '/api/v1/comunicados', { titulo: 'Vencido', texto: 'Já passou.', fimEm: '2020-01-01T00:00:00Z' })).status, 201);
  let d = await (await leo.pedir('GET', '/api/v1/comunicados/ativos')).json();
  assert.deepEqual(d.comunicados.map(c => c.titulo), ['Manutenção']);
  d = await (await gil.pedir('GET', '/api/v1/comunicados/ativos')).json();
  assert.deepEqual(d.comunicados.map(c => c.titulo).sort(), ['Manutenção', 'Só gestores']);
  const id = d.comunicados.find(c => c.titulo === 'Manutenção').id;
  assert.equal((await leo.pedir('POST', '/api/v1/comunicados/' + id + '/lido')).status, 200);
  d = await (await leo.pedir('GET', '/api/v1/comunicados/ativos')).json();
  assert.equal(d.comunicados[0].lido, true);
  const lista = await (await ana.pedir('GET', '/api/v1/comunicados')).json();
  assert.equal(lista.comunicados.find(c => c.id === id).leituras, 1);
  assert.equal((await ana.pedir('PATCH', '/api/v1/comunicados/' + id, { ativo: false })).status, 200);
  d = await (await leo.pedir('GET', '/api/v1/comunicados/ativos')).json();
  assert.equal(d.comunicados.length, 0);
  assert.equal((await ana.pedir('GET', '/comunicados')).status, 200);
  assert.equal((await leo.pedir('GET', '/comunicados')).status, 302);
});

test('página pública: tudo privado por padrão, só o admin autoriza, só campos permitidos saem sem senha', async () => {
  const env = comPaginas(ambiente());
  const { readFileSync } = await import('node:fs');
  env.ASSETS = { fetch: async req => { const p = new URL(req.url).pathname; for (const c of [p, p + '.html']) { try { return new Response(readFileSync('painel' + c, 'utf8'), { status: 200 }); } catch {} } return new Response('x', { status: 404 }); } };
  const ana = navegador(env), leo = navegador(env), anon = navegador(env);
  await admin(env, { login: 'ana', nome: 'Ana', senha: 'Painel#Forte2026', perfil: 'admin' });
  await admin(env, { login: 'leo', nome: 'Leo', senha: 'Painel#Forte2026', perfil: 'leitor' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  for (const [n, l] of [[ana, 'ana'], [leo, 'leo']]) assert.equal((await n.pedir('POST', '/api/v1/auth/entrar', { login: l, senha: 'Painel#Forte2026' })).status, 200);
  let d = await (await anon.pedir('GET', '/api/v1/publico/dados')).json();
  assert.deepEqual(d.categorias, [], 'nada público no início');
  assert.equal((await leo.pedir('GET', '/api/v1/publicacao')).status, 403);
  assert.equal((await leo.pedir('PUT', '/api/v1/publicacao', { itens: [], confirmo: true })).status, 403);
  const cat = await (await ana.pedir('GET', '/api/v1/publicacao')).json();
  assert.ok(cat.categorias.length >= 3);
  const meta = cat.categorias.find(c => c.id.startsWith('municipal-') && c.id !== 'municipal-vacinas').itens[0].id;
  assert.equal((await ana.pedir('PUT', '/api/v1/publicacao', { itens: [meta] })).status, 400, 'exige confirmação');
  assert.equal((await ana.pedir('PUT', '/api/v1/publicacao', { itens: ['municipal:meta:nao-existe'], confirmo: true })).status, 400);
  assert.equal((await ana.pedir('PUT', '/api/v1/publicacao', { itens: [meta], confirmo: true })).status, 200);
  const txt = await (await anon.pedir('GET', '/api/v1/publico/dados')).text();
  d = JSON.parse(txt);
  assert.equal(d.categorias.length, 1);
  assert.equal(d.categorias[0].itens.length, 1);
  assert.ok(!/"resp"|"obs"|pendencias/.test(txt), 'sem responsável nem observações');
  assert.equal((await anon.pedir('GET', '/publico')).status, 200);
  assert.equal((await anon.pedir('GET', '/publicacao')).status, 302);
  await ana.pedir('PUT', '/api/v1/publicacao', { itens: [], confirmo: true });
  d = await (await anon.pedir('GET', '/api/v1/publico/dados')).json();
  assert.deepEqual(d.categorias, [], 'revogação imediata');
  const h = await (await ana.pedir('GET', '/api/v1/publicacao/historico')).json();
  assert.equal(h.historico.length, 2);
});

test('chaves de coleta: admin gera, a chave só envia coleta, revogação vale na hora, nada do hash vaza', async () => {
  const env = comPaginas(ambiente());
  await admin(env, { login: 'ana', nome: 'Ana', senha: 'Painel#Forte2026', perfil: 'admin' });
  await admin(env, { login: 'leo', nome: 'Leo', senha: 'Painel#Forte2026', perfil: 'leitor' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  const ana = navegador(env), leo = navegador(env);
  await ana.pedir('POST', '/api/v1/auth/entrar', { login: 'ana', senha: 'Painel#Forte2026' });
  await leo.pedir('POST', '/api/v1/auth/entrar', { login: 'leo', senha: 'Painel#Forte2026' });
  assert.equal((await leo.pedir('POST', '/api/v1/chaves', { nome: 'x' })).status, 403);
  assert.equal((await ana.pedir('POST', '/api/v1/chaves', { nome: '' })).status, 400);
  const c = await (await ana.pedir('POST', '/api/v1/chaves', { nome: 'PC Vigilância', dias: 30 })).json();
  assert.match(c.chave, /^pc_[\w-]{40,}$/);
  const com = (chave, m, caminho, corpo) => worker.fetch(new Request(BASE + caminho, { method: m, headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }), env);
  assert.equal((await com(c.chave, 'POST', '/api/v1/coletas', { id: 'c1', competencia: '2026-10' })).status, 201);
  assert.equal((await com(c.chave, 'GET', '/api/v1/usuarios')).status, 401, 'chave de coleta não administra');
  assert.equal((await com('pc_' + 'a'.repeat(43), 'POST', '/api/v1/coletas', { id: 'c2', competencia: '2026-10' })).status, 401);
  const l = await (await ana.pedir('GET', '/api/v1/chaves')).json();
  assert.equal(l.chaves.length, 1);
  assert.ok(l.chaves[0].ultimoUso, 'registra o último uso');
  assert.ok(!JSON.stringify(l).includes(c.chave.slice(3)) && !('hash' in l.chaves[0]));
  assert.equal((await ana.pedir('DELETE', '/api/v1/chaves/' + c.id)).status, 200);
  assert.equal((await com(c.chave, 'POST', '/api/v1/coletas', { id: 'c3', competencia: '2026-10' })).status, 401, 'revogada');
  assert.equal((await ana.pedir('GET', '/chaves')).status, 200);
  assert.notEqual((await leo.pedir('GET', '/chaves')).status, 200);
});
