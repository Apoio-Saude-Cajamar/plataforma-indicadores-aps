import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
  // só o dashboard pode ser exibido em quadro (aba Dashboard de /indicadores), e apenas pelo próprio Painel
  r = await nav.pedir('GET', '/notas');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  r = await nav.pedir('GET', '/indicadores');
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
  assert.deepEqual(d.composicao.unidades.map(u => u.nome), ['U1', 'U2'], 'envio parcial junta as unidades do mês');
  d = await (await nav.pedir('GET', '/api/v1/composicao?competencia=2026-09')).json();
  assert.equal(d.composicao.unidades[0].nome, 'U0');
  // a sessão não grava
  assert.equal((await nav.pedir('PUT', '/api/v1/composicao', { competencia: '2026-10', unidades: [] })).status, 401);
  assert.equal((await nav.pedir('GET', '/composicao')).status, 200);
  for (const p of ['/', '/filas', '/notas', '/indicadores', '/lancamentos', '/lancamentos-vacinas', '/federal', '/federal-notas', '/estadual', '/municipal']) assert.equal((await nav.pedir('GET', p)).status, 200, p);
  for (const p of ['/extensao', '/downloads/coletor-aps-v0.9.6.zip']) assert.notEqual((await nav.pedir('GET', p)).status, 200, p + ' só para administrador');
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

test('pendências: exige login, aponta unidade sem composição e valor acima do denominador', async () => {
  const { analisar } = await import('../api/pendencias.js');
  const l = (unidade, codigo, numerador, denominador) => ({ unidade, codigo, numerador, denominador, soma_pontos: null });
  const r = analisar({
    linhas: [l('U1', 'C1', 5, 10), l('U1', 'C2', 5, 10), l('U2', 'C1', 12, 10), l('U3', 'C1', 1, 10), l('U3', 'C2', 1, 10)],
    filas: { U1: 3 }, agenda: { U1: 3 }, horario: { U1: 3 },
    composicaoUnidades: ['U1', 'U3'], temComposicao: true, comps: ['2026-10'], comp: '2026-10', agora: Date.UTC(2026, 10, 3),
  });
  const textos = r.achados.map((a) => a.unidade + '|' + a.tema);
  assert.ok(textos.includes('U2|Valores suspeitos'));
  assert.ok(textos.includes('U2|Composição'));
  assert.ok(textos.includes('U2|Indicadores ausentes'));
  assert.ok(!textos.some((x) => x.startsWith('U1|Valores')));
  const env = comPaginas(ambiente());
  assert.equal((await navegador(env).pedir('GET', '/api/v1/pendencias')).status, 401);
  await admin(env, { login: 'ana', nome: 'Ana', senha: 'Painel#Forte2026', perfil: 'admin' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  const nav = navegador(env);
  await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'ana', senha: 'Painel#Forte2026' });
  const resp = await nav.pedir('GET', '/api/v1/pendencias');
  assert.equal(resp.status, 200);
  assert.ok(Array.isArray((await resp.json()).achados));
  assert.equal((await nav.pedir('GET', '/pendencias')).status, 200);
});

test('pendências: conferência da B4 aponta sessão grande, falta de documento e salto', async () => {
  const { conferirB4 } = await import('../api/pendencias.js');
  const conf = (o) => Object.assign({ atividades: 2, participacoes: 40, participacoesFaixa: 30, criancas: 20, semDocumento: 0, maiorAtividade: 25, criancasEmOutraEquipe: 0, semDentista: 0, semCbo: 0 }, o);
  const r = conferirB4(
    [
      { unidade: 'U1', equipe: 'ESB 1', ine: '1', numerador: 20, denominador: 100, conferencia: conf({ maiorAtividade: 90, participacoes: 120, semDocumento: 20 }) },
      { unidade: 'U2', equipe: 'ESB 2', ine: '2', numerador: 90, denominador: 100, conferencia: conf({ criancas: 90, participacoesFaixa: 95 }) },
      { unidade: 'U3', equipe: 'ESB 3', ine: '3', numerador: 5, denominador: 100, conferencia: null },
    ],
    [{ unidade: 'U2', equipe: 'ESB 2', ine: '2', numerador: 20, conferencia: null }],
  );
  const t = r.achados.map((a) => a.unidade + '|' + a.texto);
  assert.ok(t.some((x) => x.startsWith('U1|') && /média de 60/.test(x)));
  assert.ok(t.some((x) => x.startsWith('U1|') && /uma atividade com 90/.test(x)));
  assert.ok(t.some((x) => x.startsWith('U1|') && /40% das participações/.test(x)));
  assert.ok(t.some((x) => x.startsWith('U2|') && /de 20 no mês anterior para 90/.test(x)));
  assert.equal(r.linhas.find((l) => l.ine === '3').semConferencia, true);
  assert.ok(!/\d{11,}/.test(JSON.stringify(r)), "nenhum número de documento");
});

test('produção e notas: página exige login; totais de coletivas (COLET) não viram pendência', async () => {
  const { analisar } = await import('../api/pendencias.js');
  const l = (unidade, codigo, numerador, denominador) => ({ unidade, codigo, numerador, denominador, soma_pontos: null });
  const r = analisar({
    linhas: [l('U1', 'C1', 5, 10), l('U1', 'COLET', 8, null), l('U2', 'C1', 5, 10)],
    filas: {}, agenda: {}, horario: {}, composicaoUnidades: ['U1', 'U2'], temComposicao: true, comps: ['2026-10'], comp: '2026-10', agora: Date.UTC(2026, 10, 3),
  });
  assert.ok(!r.achados.some((a) => /COLET/.test(a.texto)));
  const env = comPaginas(ambiente());
  assert.notEqual((await navegador(env).pedir('GET', '/producao')).status, 200);
  await admin(env, { login: 'ana', nome: 'Ana', senha: 'Painel#Forte2026', perfil: 'admin' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  const nav = navegador(env);
  await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'ana', senha: 'Painel#Forte2026' });
  assert.equal((await nav.pedir('GET', '/producao')).status, 200);
  assert.equal((await nav.pedir('POST', '/api/v1/relatorios/emissao', { tipo: 'producao', competencia: '2026-10', formato: 'pdf' })).status, 200);
});

test('produção por profissional: a extensão troca o mês com a chave; só admin e gestor leem; período limitado', async () => {
  const env = comPaginas(ambiente());
  const H = { headers: { authorization: 'Bearer ' + CHAVES.TOKEN_COLETA } };
  const n = navegador(env);
  const P = (nome, ind) => ({ unidade: 'UBS A', equipe: 'EMULTI 1', ine: '9', cbo: '251510', cboNome: 'PSICOLOGO CLINICO', nome, individuais: ind, compartilhados: 2, porTipo: { 'CONSULTA AGENDADA': ind }, coletivasResponsavel: 1, coletivasEnvolvido: 0, participacoes: 10 });
  assert.equal((await n.pedir('PUT', '/api/v1/producao', { competencia: '2026-10', profissionais: [P('Ana', 30), P('Bia', 20), P('Ana', 5)] }, H)).status, 200);
  assert.equal((await n.pedir('PUT', '/api/v1/producao', { competencia: '2026-10', profissionais: [P('Ana', 40)] }, H)).status, 200);
  assert.equal((await n.pedir('PUT', '/api/v1/producao', { competencia: '2026-11', profissionais: [P('Ana', 50)] }, H)).status, 200);
  assert.notEqual((await n.pedir('GET', '/api/v1/producao', undefined, H)).status, 200);
  await admin(env, { login: 'gil', nome: 'Gil', senha: 'Painel#Forte2026', perfil: 'gestor' });
  await admin(env, { login: 'leo', nome: 'Leo', senha: 'Painel#Forte2026', perfil: 'leitor' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  const g = navegador(env);
  await g.pedir('POST', '/api/v1/auth/entrar', { login: 'gil', senha: 'Painel#Forte2026' });
  const d = await (await g.pedir('GET', '/api/v1/producao?de=2026-10&ate=2026-11')).json();
  assert.deepEqual(d.profissionais.map((p) => [p.competencia, p.nome, p.individuais]), [['2026-10', 'Ana', 40], ['2026-11', 'Ana', 50]]);
  assert.equal(d.profissionais[0].porTipo['CONSULTA AGENDADA'], 40);
  assert.equal((await g.pedir('GET', '/api/v1/producao?de=2024-01&ate=2026-11')).status, 400);
  const l = navegador(env);
  await l.pedir('POST', '/api/v1/auth/entrar', { login: 'leo', senha: 'Painel#Forte2026' });
  assert.equal((await l.pedir('GET', '/api/v1/producao')).status, 403);
});

test('faixas federais: B4 em percentual e fronteiras como nas notas do MS', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../painel/js/federal-calculo.js', import.meta.url), 'utf8');
  const { conceito } = new Function(src + ';return { conceito }')();
  const casos = [['B4', 54.38, 'b'], ['B4', 50, 's'], ['B4', 100, 'b'], ['B4', 100.1, 'o'], ['B6', 8, 'b'], ['B6', 3, 'r'], ['B3', 3, 'o'], ['B5', 85, 'o'], ['B5', 85.1, 'r'], ['C1', 70, 'o'], ['C1', 70.1, 'r'], ['M2', 5, 'b']];
  for (const [c, v, e] of casos) assert.equal(conceito(c, v), e, c + ' ' + v);
});

test('prévia do repasse: nota final, faixas e valores como na NT 6/2025 e na Portaria 3.493', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../painel/js/repasse.js', import.meta.url), 'utf8');
  const r = new Function(src + ';return { REPASSE, classeDaNota, tipoRepasse, notaEquipe, valorMensal, quadrimestreRepasse, pontosAtencao, tipoPorIndicadores, coberturaRepasse }')();
  for (const [g, p] of Object.entries(r.REPASSE.pesos)) assert.equal(Object.values(p).reduce((a, b) => a + b, 0), 10, 'pesos de ' + g + ' somam 10');
  const casos = [[7.51, 'o'], [7.5, 'b'], [5, 'b'], [4.75, 's'], [2.75, 's'], [2.5, 'r'], [2.5 + 1e-9, 's']];
  for (const [n, k] of casos) assert.equal(r.classeDaNota(n), k, 'nota ' + n);
  const todos = (k) => Object.fromEntries(Object.keys(r.REPASSE.pesos.esf).map((c) => [c, k]));
  assert.equal(r.notaEquipe('esf', todos('o')).min, 10);
  assert.equal(r.notaEquipe('esf', todos('r')).min, 2.5);
  const parcial = r.notaEquipe('esf', { ...todos('b'), C7: null });
  assert.deepEqual([parcial.completa, parcial.faltam, parcial.min, parcial.max], [false, ['C7'], 6.5, 8]);
  assert.deepEqual([parcial.cmin, parcial.cmax], ['b', 'o']);
  assert.equal(r.valorMensal('esf', 'b'), 6000);
  assert.equal(r.valorMensal('esb', 'o'), 2449);
  assert.equal(r.tipoRepasse('EMULTI', 'eMulti Estratégica 1').valor, 'emultiEst');
  assert.equal(r.tipoRepasse('EMULTI', 'eMulti Complementar 2').valor, 'emultiCom');
  assert.equal(r.tipoRepasse('EAP', 'eAP Jordanésia').valor, 'eap20');
  assert.equal(r.tipoRepasse('ECR', 'Consultório na Rua'), null);
  // quadrimestre e meses de pagamento: jan–abr paga mai–ago; mai–ago paga set–dez; set–dez paga jan–abr do ano seguinte
  assert.deepEqual(r.quadrimestreRepasse('2026-03'), { meses: ['2026-01', '2026-02', '2026-03', '2026-04'], pagoDe: '2026-05', pagoAte: '2026-08' });
  assert.deepEqual([r.quadrimestreRepasse('2026-06').pagoDe, r.quadrimestreRepasse('2026-06').pagoAte], ['2026-09', '2026-12']);
  assert.deepEqual([r.quadrimestreRepasse('2026-10').meses[0], r.quadrimestreRepasse('2026-10').pagoDe, r.quadrimestreRepasse('2026-10').pagoAte], ['2026-09', '2027-01', '2027-04']);
  // pontos de atenção: o que mais tirou nota, quem está perto de subir ou de cair, o que falta de dado e o vínculo abaixo de Bom
  const eq = (nome, classes, extra = {}) => ({ nome, grupo: 'esf', valor: 'esf', classes, n: r.notaEquipe('esf', classes), vin: null, vmin: 0, vmax: 0, ...extra });
  const c = (o) => ({ C1: 'o', C2: 'o', C3: 'o', C4: 'o', C5: 'o', C6: 'o', C7: 'o', ...o });
  const A = r.pontosAtencao([
    eq('Cima', c({})), // 10: Ótimo, longe do limite
    eq('Limite', c({ C1: 'b', C2: 'b', C3: 'b', C6: 'b', C7: 'b' })), // 8: Ótimo a 0,25 do limite de 7,75
    eq('Baixa', c({ C1: 'r', C2: 'r', C3: 's', C4: 'r', C5: 'r', C6: 's', C7: 's' })), // 3,75: Suficiente
    eq('Sem dado', c({ C3: null }), { vin: { sc: null, k: null }, vmin: 6000, vmax: 14000 }),
    eq('Vínculo', c({}), { vin: { sc: 5, k: 's' } }),
  ]);
  assert.deepEqual(A.dist, { o: 3, b: 0, s: 1, r: 0 });
  assert.equal(A.comNota, 4);
  assert.equal(A.indicadores[0].cod, 'C2'); // peso 2: Limite perde 0,5 e Baixa 1,5
  assert.equal(A.indicadores[0].perdidos, 2);
  assert.ok(A.indicadores.every((x) => x.perdidos > 0));
  assert.deepEqual(A.baixas.map((x) => x.nome), ['Baixa']);
  const baixa = A.subir.find((x) => x.nome === 'Baixa');
  assert.deepEqual([baixa.para, baixa.falta, baixa.ganho], ['b', 1.25, 2000]);
  assert.deepEqual(baixa.alavancas.map((x) => x.cod), ['C2', 'C3']); // maior peso e pior conceito primeiro
  assert.equal(A.subir.some((x) => x.nome === 'Cima'), false, 'Ótimo não tem classe acima');
  assert.deepEqual(A.risco.map((x) => [x.nome, x.margem, x.perda]), [['Limite', 0.25, 2000]]);
  assert.deepEqual(A.semDado.map((x) => [x.nome, x.faltam]), [['Sem dado', ['C3', 'CVAT']]]);
  assert.equal(A.emJogo, 8000);
  assert.deepEqual(A.vinculo.map((x) => [x.nome, x.ganho]), [['Vínculo', 2000]]);
  // linhas B e M chegam sem tipo de equipe: o tipo vem dos indicadores; a cobertura diz o que ficou fora
  assert.equal(r.tipoPorIndicadores(['B1', 'B4']), 'ESB');
  assert.equal(r.tipoPorIndicadores(['M2']), 'EMULTI');
  assert.equal(r.tipoPorIndicadores(['C1', 'CVAT']), '');
  const cob = r.coberturaRepasse([{ tipo: 'ESF', incluida: true }, { tipo: '', incluida: false }, { tipo: 'ECR', incluida: false }, { tipo: '', incluida: false }]);
  assert.deepEqual([cob.total, cob.incluidas], [4, 1]);
  assert.deepEqual(cob.fora, [{ tipo: 'tipo não identificado', n: 2 }, { tipo: 'Consultório na Rua', n: 1 }]);
  // empates viram um item só, com o total; a lista de subir vai do maior retorno por ponto ao menor
  const igual = (k) => c(Object.fromEntries(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'].map((x) => [x, k])));
  const lote = [
    ...[1, 2, 3].map((i) => eq('Perto ' + i, igual('b'), { unidade: 'U1' })), // 7,5: Bom, falta 0,25 para Ótimo
    eq('Regular 1', igual('r'), { unidade: 'U2' }), // 2,5: Regular, falta 0,25 para Suficiente
    ...[1, 2].map((i) => eq('Risco ' + i, igual('s'), { unidade: 'U1' })), // 5,0: Bom sem folga
  ];
  const B = r.pontosAtencao(lote);
  assert.equal(B.subir.length, 6);
  assert.equal(B.subirGrupos.length, 3, 'as três equipes iguais viram um grupo');
  const g = B.subirGrupos[0];
  assert.deepEqual([g.n, g.nomes.length, g.falta, g.ganho, g.total, g.retorno], [3, 3, 0.25, 2000, 6000, 8000]);
  assert.equal(B.subirGrupos[1].nomes[0], 'Regular 1'); // mesmo retorno por equipe, total menor
  assert.equal(B.subirGrupos[2].nomes.length, 2); // Bom sem folga: falta 2,75 para Ótimo, o menor retorno
  assert.equal(B.riscoGrupos.length, 1);
  assert.deepEqual([B.riscoGrupos[0].n, B.riscoGrupos[0].margem, B.riscoGrupos[0].perda, B.riscoGrupos[0].para], [2, 0, 2000, 's']);
  assert.deepEqual([B.jogo.abaixoBomN, B.jogo.abaixoBomGanho, B.jogo.pertoN, B.jogo.riscoN, B.jogo.riscoPerda], [1, 4000, 0, 2, 4000]);
  assert.equal(B.sensiveis, 6);
  const c2 = B.indicadores.find((x) => x.cod === 'C2');
  assert.deepEqual([c2.peso, c2.todas], [2, false]);
  assert.ok(Math.abs(c2.media - 5 / 6) < 1e-9, 'média de pontos perdidos por equipe');
  assert.deepEqual(B.porUnidade.map((u) => [u.unidade, u.equipes]), [['U1', 5], ['U2', 1]]);
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
  // Itens ao vivo: o administrador liga só médicos; enfermeiros e nomes não aparecem.
  await env.DB.prepare(`INSERT INTO fila_profissional (competencia, unidade, equipe, cbo, categoria, nome, faltas, atendimentos, atualizado_em) VALUES ('2026-10','UBS A','EQ 1','Médico - 1','Médico','Dr. Sigiloso',5,45,'x'), ('2026-10','UBS A','EQ 1','Enfermeiro - 2','Enfermeiro','Enf. Sigilosa',2,48,'x')`).run();
  assert.equal((await ana.pedir('PUT', '/api/v1/publicacao', { itens: ['vivo:filas:Médico'], confirmo: true })).status, 200);
  const vivo = await (await anon.pedir('GET', '/api/v1/publico/dados')).text();
  assert.ok(!/Sigil/.test(vivo), 'sem nomes de profissionais');
  const vd = JSON.parse(vivo);
  assert.deepEqual(vd.vivos.filas.linhas.map(l => l.cat), ['Médico']);
  assert.equal(vd.vivos.filas.linhas[0].f, 5);
  assert.equal(vd.vivos.federal, undefined);
  assert.equal((await ana.pedir('PUT', '/api/v1/publicacao', { itens: ['vivo:filas:Médico', 'vivo:filas:min3'], confirmo: true })).status, 200);
  assert.deepEqual((await (await anon.pedir('GET', '/api/v1/publico/dados')).json()).vivos.filas.linhas, [], 'mínimo de 3 oculta equipe com 1 profissional');
  await ana.pedir('PUT', '/api/v1/publicacao', { itens: [], confirmo: true });
  d = await (await anon.pedir('GET', '/api/v1/publico/dados')).json();
  assert.deepEqual(d.categorias, [], 'revogação imediata');
  const h = await (await ana.pedir('GET', '/api/v1/publicacao/historico')).json();
  assert.equal(h.historico.length, 4);
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
  assert.equal((await ana.pedir('DELETE', '/api/v1/chaves/' + c.id + '/excluir')).status, 409, 'chave ativa não se exclui: revogue antes');
  assert.equal((await ana.pedir('DELETE', '/api/v1/chaves/' + c.id)).status, 200);
  assert.equal((await leo.pedir('DELETE', '/api/v1/chaves/' + c.id + '/excluir')).status, 403);
  assert.equal((await ana.pedir('DELETE', '/api/v1/chaves/' + c.id + '/excluir')).status, 200, 'revogada pode ser excluída');
  assert.equal((await (await ana.pedir('GET', '/api/v1/chaves')).json()).chaves.length, 0);
  assert.equal((await ana.pedir('DELETE', '/api/v1/chaves/' + c.id + '/excluir')).status, 404);
  const c2 = await (await ana.pedir('POST', '/api/v1/chaves', { nome: 'Outro PC' })).json();
  const c3 = await (await ana.pedir('POST', '/api/v1/chaves', { nome: 'PC antigo' })).json();
  await ana.pedir('DELETE', '/api/v1/chaves/' + c3.id);
  assert.equal((await (await ana.pedir('DELETE', '/api/v1/chaves/inativas')).json()).excluidas, 1);
  assert.deepEqual((await (await ana.pedir('GET', '/api/v1/chaves')).json()).chaves.map(x => x.nome), ['Outro PC'], 'a ativa continua');
  assert.equal((await com(c.chave, 'POST', '/api/v1/coletas', { id: 'c3', competencia: '2026-10' })).status, 401, 'revogada');
  assert.equal((await ana.pedir('GET', '/chaves')).status, 200);
  assert.notEqual((await leo.pedir('GET', '/chaves')).status, 200);
});

test('lançamentos por formulário: gestor lança, leitor só consulta, o histórico guarda tudo e o vigente é o mais recente', async () => {
  const env = comPaginas(ambiente());
  const criar = async (login, perfil) => { const r = await admin(env, { login, nome: login, perfil }); env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run(); const n = navegador(env); assert.equal((await n.pedir('POST', '/api/v1/auth/entrar', { login, senha: r.senhaProvisoria })).status, 200); return n; };
  const gestor = await criar('gestor.um', 'gestor'), leitor = await criar('leitor.um', 'leitor');
  const O = { headers: { origin: BASE } };
  assert.equal((await leitor.pedir('POST', '/api/v1/lancamentos', { tipo: 'meta', item: '1.1.2', competencia: '2026-10', valor: 0.1 }, O)).status, 403);
  assert.equal((await gestor.pedir('POST', '/api/v1/lancamentos', { tipo: 'meta', item: 'x', competencia: '2026-10', valor: 1 }, O)).status, 400);
  assert.equal((await gestor.pedir('POST', '/api/v1/lancamentos', { tipo: 'meta', item: '1.1.2', competencia: '2026-10', valor: -1 }, O)).status, 400);
  assert.equal((await gestor.pedir('POST', '/api/v1/lancamentos', { tipo: 'meta', item: '1.1.2', competencia: '2026-10', valor: 0.1 }, O)).status, 201);
  assert.equal((await gestor.pedir('POST', '/api/v1/lancamentos', { tipo: 'meta', item: '1.1.2', competencia: '2026-10', valor: 0.2, obs: 'correção' }, O)).status, 201);
  assert.equal((await gestor.pedir('POST', '/api/v1/lancamentos', { tipo: 'vacina', item: '1. BCG', competencia: '2026-10', valor: 0.95 }, O)).status, 201);
  const d = await (await leitor.pedir('GET', '/api/v1/lancamentos?tipo=meta')).json();
  assert.equal(d.vigentes.length, 1); assert.equal(d.vigentes[0].valor, 0.2); assert.equal(d.historico.length, 2); assert.equal(d.vigentes[0].por, 'gestor.um');
  assert.equal((await (await leitor.pedir('GET', '/api/v1/lancamentos?tipo=vacina')).json()).vigentes.length, 1);
  assert.equal((await leitor.pedir('GET', '/api/v1/lancamentos')).status, 400);
});

test('recoleta do mesmo mês: vale a linha mais recente de cada indicador e equipe, sem apagar o que só a coleta anterior tinha', async () => {
  const env = comPaginas(ambiente());
  const H = { headers: { authorization: 'Bearer ' + CHAVES.TOKEN_COLETA } };
  const n = navegador(env);
  const enviar = async (id, quando, linhas) => {
    assert.equal((await n.pedir('POST', '/api/v1/coletas', { id, competencia: '2026-10', tipo: 'completa', versaoExtensao: 't', iniciadoEm: quando }, H)).status, 201);
    assert.equal((await n.pedir('PUT', `/api/v1/coletas/${id}/etapa`, { chave: 'unidade:UBS A', bloco: 'unidade', unidade: 'UBS A', status: 'ok', coletadoEm: quando, linhas }, H)).status, 200);
  };
  const L = (codigo, numerador) => ({ codigo, unidade: 'UBS A', equipe: 'EQ 1', numerador, denominador: 100 });
  await enviar('c1', '2026-11-01T10:00:00.000Z', [L('C1', 40), L('B2', 30)]);
  await enviar('c2', '2026-11-05T10:00:00.000Z', [L('C1', 55)]); // recoleta parcial: só o C1
  const d = await (await n.pedir('GET', '/api/v1/dados?competencia=2026-10', undefined, { headers: { authorization: 'Bearer ' + CHAVES.TOKEN_COLETA } })).json();
  const por = Object.fromEntries(d.indicadores.map(l => [l.codigo, l.numerador]));
  assert.deepEqual(por, { C1: 55, B2: 30 });
});

test('recoleta com "substituir todos": só vale o que a nova coleta trouxe, e só se ela terminar completa', async () => {
  const env = comPaginas(ambiente());
  const H = { headers: { authorization: 'Bearer ' + CHAVES.TOKEN_COLETA } };
  const n = navegador(env);
  const enviar = async (id, quando, unidade, linhas) => {
    await n.pedir('POST', '/api/v1/coletas', { id, competencia: '2026-10', tipo: 'completa', versaoExtensao: 't', iniciadoEm: quando }, H);
    assert.equal((await n.pedir('PUT', `/api/v1/coletas/${id}/etapa`, { chave: 'unidade:' + unidade, bloco: 'unidade', unidade, status: 'ok', coletadoEm: quando, linhas }, H)).status, 200);
  };
  const L = (unidade, codigo, numerador) => ({ codigo, unidade, equipe: 'EQ 1', numerador, denominador: 100 });
  const ler = async () => {
    const d = await (await n.pedir('GET', '/api/v1/dados?competencia=2026-10', undefined, H)).json();
    return Object.fromEntries(d.indicadores.map((l) => [l.unidade + '|' + l.codigo, l.numerador]));
  };
  await enviar('c1', '2026-11-01T10:00:00.000Z', 'UBS A', [L('UBS A', 'C1', 40), L('UBS A', 'B2', 30)]);
  await enviar('c1', '2026-11-01T10:00:00.000Z', 'UBS B', [L('UBS B', 'C1', 20)]);
  await n.pedir('POST', '/api/v1/coletas/c1/concluir', { status: 'concluida' }, H);
  // Parcial com "todos": nada é substituído.
  await enviar('c2', '2026-11-05T10:00:00.000Z', 'UBS A', [L('UBS A', 'C1', 55)]);
  const p = await (await n.pedir('POST', '/api/v1/coletas/c2/concluir', { status: 'parcial', substituir: 'todos' }, H)).json();
  assert.equal(p.substituidas, 0);
  assert.deepEqual(await ler(), { 'UBS A|C1': 55, 'UBS A|B2': 30, 'UBS B|C1': 20 });
  // Completa com "todos": o que a nova coleta não trouxe deixa de valer.
  await enviar('c3', '2026-11-10T10:00:00.000Z', 'UBS A', [L('UBS A', 'C1', 60)]);
  const r = await (await n.pedir('POST', '/api/v1/coletas/c3/concluir', { status: 'concluida', substituir: 'todos' }, H)).json();
  assert.equal(r.substituidas, 3);
  assert.deepEqual(await ler(), { 'UBS A|C1': 60 });
  // Nada foi apagado: as etapas antigas continuam no banco, marcadas como substituídas.
  const lista = await (await n.pedir('GET', '/api/v1/coletas?competencia=2026-10', undefined, H)).json();
  const c1 = lista.coletas.find((c) => c.id === 'c1');
  assert.equal(c1.etapasSubstituidas, 2);
  assert.equal(c1.etapasComFalha, 0);
});

test('filas e faltas: a extensão envia por profissional, a recoleta parcial não apaga, só admin e gestor leem', async () => {
  const env = comPaginas(ambiente());
  const H = { headers: { authorization: 'Bearer ' + CHAVES.TOKEN_COLETA } };
  const n = navegador(env);
  const P = (x) => Object.assign({ unidade: 'UBS A', equipe: 'EQ 1', cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA - 225142', categoria: 'Médico', nome: 'Profissional Um' }, x);
  assert.equal((await n.pedir('PUT', '/api/v1/filas', { competencia: '2026-10', profissionais: [P({ faltas: 10, atendimentos: 90 }), P({ nome: 'Fora', categoria: 'Dentista', faltas: 1 })] }, H)).status, 200);
  assert.equal((await n.pedir('PUT', '/api/v1/filas', { competencia: '2026-10', profissionais: [P({ diasVaga: 12, proximaVaga: '2026-11-28', semVaga: false, agendaLidaEm: '2026-11-16T12:00:00.000Z' })] }, H)).status, 200);
  const criar = async (login, perfil) => { const r = await admin(env, { login, nome: login, perfil }); env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run(); const v = navegador(env); assert.equal((await v.pedir('POST', '/api/v1/auth/entrar', { login, senha: r.senhaProvisoria })).status, 200); return v; };
  const gestor = await criar('gestor.fila', 'gestor'), leitor = await criar('leitor.fila', 'leitor');
  assert.equal((await leitor.pedir('GET', '/api/v1/filas')).status, 403);
  const d = await (await gestor.pedir('GET', '/api/v1/filas')).json();
  assert.equal(d.profissionais.length, 1);
  assert.deepEqual([d.profissionais[0].faltas, d.profissionais[0].atendimentos, d.profissionais[0].diasVaga], [10, 90, 12]);
});

test('filas: evolução devolve os meses guardados em ordem, com limite e corte por competência; só admin e gestor leem', async () => {
  const env = comPaginas(ambiente());
  const H = { headers: { authorization: 'Bearer ' + CHAVES.TOKEN_COLETA } };
  const n = navegador(env);
  const P = (x) => Object.assign({ unidade: 'UBS A', equipe: 'EQ 1', cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA - 225142', categoria: 'Médico', nome: 'Profissional Um' }, x);
  for (const [c, f] of [['2026-08', 5], ['2026-09', 9], ['2026-10', 12]])
    assert.equal((await n.pedir('PUT', '/api/v1/filas', { competencia: c, profissionais: [P({ faltas: f, atendimentos: 50 })] }, H)).status, 200);
  const criar = async (login, perfil) => { const u = await admin(env, { login, nome: login, perfil }); env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run(); const v = navegador(env); assert.equal((await v.pedir('POST', '/api/v1/auth/entrar', { login, senha: u.senhaProvisoria })).status, 200); return v; };
  const gestor = await criar('gestor.evo', 'gestor'), leitor = await criar('leitor.evo', 'leitor');
  assert.equal((await leitor.pedir('GET', '/api/v1/filas/evolucao')).status, 403);
  const d = await (await gestor.pedir('GET', '/api/v1/filas/evolucao')).json();
  assert.deepEqual(d.competencias, ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(d.profissionais.map((p) => [p.competencia, p.faltas]), [['2026-08', 5], ['2026-09', 9], ['2026-10', 12]]);
  const d2 = await (await gestor.pedir('GET', '/api/v1/filas/evolucao?ate=2026-09&meses=2')).json();
  assert.deepEqual(d2.competencias, ['2026-08', '2026-09']);
  assert.equal(d2.profissionais.length, 2);
  assert.equal((await gestor.pedir('GET', '/api/v1/filas/evolucao?ate=2026-13')).status, 400);
});

test('faltas por horário: a extensão envia a grade por profissional, grade inválida fica de fora, só admin e gestor leem', async () => {
  const env = comPaginas(ambiente());
  const H = { headers: { authorization: 'Bearer ' + CHAVES.TOKEN_COLETA } };
  const n = navegador(env);
  const P = (x) => Object.assign({ unidade: 'UBS A', equipe: 'EQ 1', cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA - 225142', categoria: 'Médico', nome: 'Profissional Um' }, x);
  const r = await n.pedir('PUT', '/api/v1/filas/horarios', { competencia: '2026-10', profissionais: [
    P({ grade: { 1: { 8: [10, 7, 3], 9: [5, 5, 0] }, 9: { 8: [1, 1, 0] }, 2: { 30: [1, 1, 0], 10: [2, 2, 2] } } }),
    P({ nome: 'Sem grade', grade: {} }), P({ nome: 'Fora', categoria: 'Dentista', grade: { 1: { 8: [1, 1, 0] } } })] }, H);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).gravados, 1);
  assert.equal((await n.pedir('PUT', '/api/v1/filas/horarios', { competencia: '2026-10', profissionais: [] })).status, 401);
  const criar = async (login, perfil) => { const u = await admin(env, { login, nome: login, perfil }); env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run(); const v = navegador(env); assert.equal((await v.pedir('POST', '/api/v1/auth/entrar', { login, senha: u.senhaProvisoria })).status, 200); return v; };
  const gestor = await criar('gestor.hora', 'gestor'), leitor = await criar('leitor.hora', 'leitor');
  assert.equal((await leitor.pedir('GET', '/api/v1/filas')).status, 403);
  const d = await (await gestor.pedir('GET', '/api/v1/filas')).json();
  assert.deepEqual(d.competencias, ['2026-10']);
  assert.equal(d.profissionais.length, 0);
  assert.equal(d.horarios.length, 1);
  assert.deepEqual(d.horarios[0].grade, { 1: { 8: [10, 7, 3], 9: [5, 5, 0] } });
  // A recoleta troca a grade do profissional.
  assert.equal((await n.pedir('PUT', '/api/v1/filas/horarios', { competencia: '2026-10', profissionais: [P({ grade: { 3: { 14: [4, 2, 1] } } })] }, H)).status, 200);
  const d2 = await (await gestor.pedir('GET', '/api/v1/filas')).json();
  assert.deepEqual(d2.horarios[0].grade, { 3: { 14: [4, 2, 1] } });
});

test('estadual: gestor lança por quadrimestre, vale o mais recente, leitor só consulta', async () => {
  const env = comPaginas(ambiente());
  const n = navegador(env);
  const criar = async (login, perfil) => { const u = await admin(env, { login, nome: login, perfil }); env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run(); const v = navegador(env); assert.equal((await v.pedir('POST', '/api/v1/auth/entrar', { login, senha: u.senhaProvisoria })).status, 200); return v; };
  const gestor = await criar('gestor.est', 'gestor'), leitor = await criar('leitor.est', 'leitor');
  assert.equal((await n.pedir('GET', '/api/v1/estadual/lancamentos')).status, 401);
  const L = { item: 'polio', periodo: '2026-Q1', valor: 97.5, anterior: 96, mediana: 88 };
  assert.equal((await leitor.pedir('POST', '/api/v1/estadual/lancamentos', L)).status, 403);
  assert.equal((await gestor.pedir('POST', '/api/v1/estadual/lancamentos', L)).status, 201);
  assert.equal((await gestor.pedir('POST', '/api/v1/estadual/lancamentos', Object.assign({}, L, { valor: 98 }))).status, 201);
  assert.equal((await gestor.pedir('POST', '/api/v1/estadual/lancamentos', { item: 'x', periodo: '2026-Q1', valor: 1 })).status, 400);
  assert.equal((await gestor.pedir('POST', '/api/v1/estadual/lancamentos', { item: 'polio', periodo: '2026-Q4', valor: 1 })).status, 400);
  assert.equal((await gestor.pedir('POST', '/api/v1/estadual/lancamentos', { item: 'mortalidade', periodo: '2026-Q1', valor: 5, quartil: 9 })).status, 400);
  const d = await (await leitor.pedir('GET', '/api/v1/estadual/lancamentos')).json();
  assert.equal(d.vigentes.length, 1);
  assert.equal(d.vigentes[0].valor, 98);
  assert.equal(d.vigentes[0].mediana, 88);
  assert.equal(d.historico.length, 2);
});

test('menu do usuário: meus registros para qualquer logado; histórico e estado do backup só para administrador', async () => {
  const env = comPaginas(ambiente());
  const n = navegador(env);
  const criar = async (login, perfil) => { const u = await admin(env, { login, nome: login, perfil }); env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run(); const v = navegador(env); assert.equal((await v.pedir('POST', '/api/v1/auth/entrar', { login, senha: u.senhaProvisoria })).status, 200); return v; };
  const gestor = await criar('gestor.menu', 'gestor');
  assert.equal((await n.pedir('GET', '/api/v1/meus-registros')).status, 401);
  assert.equal((await gestor.pedir('GET', '/api/v1/meus-registros')).status, 200);
  assert.equal((await gestor.pedir('GET', '/api/v1/registros')).status, 403);
  assert.equal((await gestor.pedir('GET', '/api/v1/backups/estado')).status, 403);
  const adm = await criar('adm.menu', 'admin');
  const h = await (await adm.pedir('GET', '/api/v1/registros')).json();
  assert.ok(Array.isArray(h.registros));
  assert.ok(!JSON.stringify(h).includes('"ip"'));
  const b = await (await adm.pedir('GET', '/api/v1/backups/estado')).json();
  assert.ok(b.tabelas && typeof b.tabelas === 'object');
});

test('vacinas do PEC: troca as doses do mês, ignora vacina fora do cálculo e devolve só totais', async () => {
  const { gravarVacinasPec, lerVacinasPec } = await import('../api/estadual.js');
  const env = ambiente();
  const d = (vacina, faixa, dose, n) => ({ vacina, imunobiologico: 'Vacina ' + vacina, faixa, dose, n });
  await gravarVacinasPec(env, { competencia: '2026-10', doses: [d('polio', 'Menos de 01 ano', '3ª DOSE', 140), d('gripe', 'Menos de 01 ano', '1ª DOSE', 5), d('penta', 'Menos de 01 ano', '3ª DOSE', 141)] });
  let r = await lerVacinasPec(env);
  assert.equal(r.doses.length, 2, 'vacina fora do cálculo não entra');
  await gravarVacinasPec(env, { competencia: '2026-10', doses: [d('polio', 'Menos de 01 ano', '3ª DOSE', 150)] });
  r = await lerVacinasPec(env);
  assert.deepEqual(r.doses.map(x => [x.vacina, x.n]), [['polio', 150]], 'recoleta do mês troca as doses');
  assert.deepEqual(Object.keys(r.doses[0]).sort(), ['competencia', 'dose', 'faixa', 'n', 'vacina']);
});

test('composição: "substituir" troca o mês inteiro', async () => {
  const env = ambiente();
  const put = corpo => worker.fetch(new Request(BASE + '/api/v1/composicao', { method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CHAVES.TOKEN_COLETA }, body: JSON.stringify(corpo) }), env);
  const un = nome => ({ nome, equipes: [{ nome: 'Eq', profissionais: [] }], alertas: [], lotacoesLidas: 5 });
  await put({ competencia: '2026-10', unidades: [un('A'), un('B')] });
  await put({ competencia: '2026-10', unidades: [un('C')] });
  let r = JSON.parse((await env.DB.prepare('SELECT dados FROM composicao').first()).dados);
  assert.deepEqual(r.unidades.map(u => u.nome), ['A', 'B', 'C']);
  assert.equal(r.resumo.unidades, 3);
  assert.equal(r.resumo.lotacoes, 15);
  await put({ competencia: '2026-10', unidades: [un('Z')], substituir: true });
  r = JSON.parse((await env.DB.prepare('SELECT dados FROM composicao').first()).dados);
  assert.deepEqual(r.unidades.map(u => u.nome), ['Z']);
});

test('Como coletamos: página fechada para quem não entrou e texto igual ao da extensão', async () => {
  const env = comPaginas(ambiente());
  const r = await worker.fetch(new Request(BASE + '/coleta'), env);
  assert.ok([301, 302, 303, 307, 308, 401].includes(r.status), 'status ' + r.status);
  const painel = readFileSync(new URL('../painel/js/extracao.js', import.meta.url), 'utf8');
  const ext = new URL('../../coletor-aps/shared/extracao.js', import.meta.url);
  if (existsSync(ext)) assert.equal(painel, readFileSync(ext, 'utf8'), 'extracao.js diferente entre extensão e Painel');
});

test('relatório: emissão fica registrada para quem emitiu e valida o tipo', async () => {
  const env = comPaginas(ambiente());
  await admin(env, { login: 'rita', nome: 'Rita', senha: 'Painel#Forte2026' });
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
  const nav = navegador(env);
  assert.equal((await nav.pedir('POST', '/api/v1/relatorios/emissao', { tipo: 'geral', competencia: '2026-10' })).status, 401);
  await nav.pedir('POST', '/api/v1/auth/entrar', { login: 'rita', senha: 'Painel#Forte2026' });
  assert.equal((await nav.pedir('POST', '/api/v1/relatorios/emissao', { tipo: 'inexistente', competencia: '2026-10' })).status, 400);
  assert.equal((await nav.pedir('POST', '/api/v1/relatorios/emissao', { tipo: 'federal', competencia: '2026-10', formato: 'csv', unidade: 'UBS A' })).status, 200);
  assert.equal((await nav.pedir('POST', '/api/v1/relatorios/emissao', { tipo: 'lote', competencia: '2026-10', formato: 'pdf', unidade: 'todos · 34 dossiês' })).status, 200);
  const r = await (await nav.pedir('GET', '/api/v1/meus-registros')).json();
  assert.ok(r.registros.some(x => x.acao === 'relatorio.emitido' && /federal · 2026-10 · csv · UBS A/.test(x.detalhe)));
  assert.equal((await nav.pedir('GET', '/relatorio')).status, 200);
});
