import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../api/index.js';
import { ambiente, CHAVES } from './d1-local.mjs';
import { semear, cuboAtendimentos, linhasIdosos, U } from './exemplos.mjs';

function cliente(env, chave = CHAVES.TOKEN_COLETA) {
  return async function chamar(metodo, caminho, corpo, opcoes = {}) {
    const headers = { 'content-type': 'application/json' };
    const token = opcoes.chave === undefined ? chave : opcoes.chave;
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await worker.fetch(new Request(`http://local/api/v1${caminho}`, {
      method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
    const dados = await r.json();
    if (!opcoes.permitirErro && r.status >= 400) throw new Error(`${metodo} ${caminho} → ${r.status}: ${JSON.stringify(dados)}`);
    return { status: r.status, ...dados };
  };
}

async function contar(env, tabela, onde = '1 = 1', ...params) {
  return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE ${onde}`).bind(...params).first()).n;
}

test('saúde é pública; demais rotas exigem a chave certa', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  assert.equal((await chamar('GET', '/saude', undefined, { chave: '' })).ok, true);
  assert.equal((await chamar('GET', '/coletas', undefined, { chave: '', permitirErro: true })).status, 401);
  assert.equal((await chamar('GET', '/coletas', undefined, { chave: 'errada-errada-errada', permitirErro: true })).status, 401);
  // a chave de backup não grava coletas
  const r = await chamar('POST', '/coletas', { competencia: '2026-10' }, { chave: CHAVES.TOKEN_BACKUP, permitirErro: true });
  assert.equal(r.status, 401);
  // a chave de coleta não restaura
  const r2 = await chamar('POST', '/restauracao/iniciar', { confirmar: 'APAGAR E RESTAURAR' }, { permitirErro: true });
  assert.equal(r2.status, 401);
  // chave não configurada nunca autentica
  const env2 = { DB: env.DB, TOKEN_COLETA: '' };
  const r3 = await cliente(env2, '')('GET', '/coletas', undefined, { chave: 'qualquer', permitirErro: true });
  assert.equal(r3.status, 401);
});

test('valida entradas e rotas', async () => {
  const chamar = cliente(ambiente());
  assert.equal((await chamar('POST', '/coletas', { competencia: '2026-13' }, { permitirErro: true })).status, 400);
  assert.equal((await chamar('GET', '/inexistente', undefined, { permitirErro: true })).status, 404);
  assert.equal((await chamar('DELETE', '/coletas', undefined, { permitirErro: true })).status, 405);
  assert.equal((await chamar('PUT', '/coletas/nao-existe/etapa', { chave: 'x', bloco: 'x', coletadoEm: '2026-11-01T00:00:00Z' },
    { permitirErro: true })).status, 404);
  await chamar('POST', '/coletas', { id: 'c1', competencia: '2026-10' });
  const semCampos = await chamar('PUT', '/coletas/c1/etapa', { chave: 'lista:x', bloco: 'x', coletadoEm: '2026-11-01T00:00:00Z',
    linhas: [{ codigo: 'C3' }] }, { permitirErro: true });
  assert.equal(semCampos.status, 400);
  assert.equal((await chamar('POST', '/coletas', { id: 'c1', competencia: '2026-09' }, { permitirErro: true })).status, 409);
});

test('etapa reenviada substitui a anterior, sem duplicar', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  const c = await chamar('POST', '/coletas', { id: 'c1', competencia: '2026-10' });
  assert.equal(c.criada, true);
  assert.equal((await chamar('POST', '/coletas', { id: 'c1', competencia: '2026-10' })).criada, false);
  const base = { chave: 'gerencial:atendimentos', bloco: 'atendimentos', status: 'ok', coletadoEm: '2026-11-03T10:00:00Z' };
  await chamar('PUT', '/coletas/c1/etapa', { ...base, cubos: { atendimentos: cuboAtendimentos(4) } });
  assert.equal(await contar(env, 'cubo_atendimento'), 4);
  await chamar('PUT', '/coletas/c1/etapa', { ...base, cubos: { atendimentos: cuboAtendimentos(2) } });
  assert.equal(await contar(env, 'cubo_atendimento'), 2);
  assert.equal(await contar(env, 'etapa'), 1);
});

test('falha nunca apaga dados bons da mesma etapa', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await semear(chamar);
  const antes = await contar(env, 'indicador_equipe', "etapa_chave = 'lista:gestantes:0002104741'");
  const r = await chamar('PUT', '/coletas/col-2026-10-a/etapa', { chave: 'lista:gestantes:0002104741', bloco: 'gestantes',
    status: 'falhou', erro: 'Sessão expirada', coletadoEm: '2026-11-03T11:00:00Z' });
  assert.equal(r.gravada, false);
  assert.equal(await contar(env, 'indicador_equipe', "etapa_chave = 'lista:gestantes:0002104741'"), antes);
  const e = await env.DB.prepare("SELECT status FROM etapa WHERE chave = 'lista:gestantes:0002104741'").first();
  assert.equal(e.status, 'ok');
});

test('linhas guardam itens e campos extras; avisos ficam registrados', async () => {
  const env = ambiente();
  await semear(cliente(env));
  const l = await env.DB.prepare("SELECT itens, extras FROM indicador_equipe WHERE codigo = 'C3' AND recorte = 'situacao'").first();
  assert.deepEqual(JSON.parse(l.itens), { A: 30, B: 22, C: 18 });
  assert.deepEqual(JSON.parse(l.extras), { puerperasPor294: 4 });
  assert.equal(await contar(env, 'aviso'), 1);
  const desfecho = await env.DB.prepare("SELECT denominador FROM indicador_equipe WHERE codigo = 'C3' AND recorte = 'desfecho'").first();
  assert.equal(desfecho.denominador, 6);
});

test('situação mostra pendências; nova tentativa em outra coleta vira a versão vigente', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await semear(chamar);

  let s = await chamar('GET', '/situacao?competencia=2026-10');
  assert.equal(s.total, 5);
  assert.equal(s.pendentes, 1);
  assert.equal(s.etapas.find(e => e.chave === 'lista:idosos:0002104741').status, 'falhou');

  // Coleta avulsa no dia seguinte: refaz só os idosos e a recoleta dos atendimentos.
  await chamar('POST', '/coletas', { id: 'col-2026-10-b', competencia: '2026-10', tipo: 'avulsa', iniciadoEm: '2026-11-04T09:00:00Z' });
  await chamar('PUT', '/coletas/col-2026-10-b/etapa', { chave: 'lista:idosos:0002104741', bloco: 'idosos', unidade: U,
    equipe: 'EQUIPE PANORAMA', ine: '0002104741', status: 'ok', coletadoEm: '2026-11-04T09:01:00Z', linhas: linhasIdosos(465) });
  await chamar('PUT', '/coletas/col-2026-10-b/etapa', { chave: 'gerencial:atendimentos', bloco: 'atendimentos', status: 'ok',
    coletadoEm: '2026-11-11T09:00:00Z', cubos: { atendimentos: cuboAtendimentos(7) } });
  await chamar('POST', '/coletas/col-2026-10-b/concluir', {});

  s = await chamar('GET', '/situacao?competencia=2026-10');
  assert.equal(s.pendentes, 0);
  const idosos = s.etapas.find(e => e.chave === 'lista:idosos:0002104741');
  assert.equal(idosos.coletaId, 'col-2026-10-b');

  const dados = await chamar('GET', '/dados?competencia=2026-10');
  assert.equal(dados.atendimentos.length, 7, 'recoleta dos gerenciais substitui a preliminar');
  assert.equal(dados.indicadores.filter(i => i.codigo === 'C6')[0].denominador, 465);
  assert.equal(dados.indicadores.filter(i => i.codigo === 'C3').length, 2);
  assert.deepEqual(dados.indicadores.find(i => i.codigo === 'C3' && i.recorte === 'situacao').itens, { A: 30, B: 22, C: 18 });
  assert.equal(dados.escuta.find(e => e.categoria === 'MÉDICO').periodoOk, false);
  // o histórico continua guardado
  assert.equal(await contar(env, 'cubo_atendimento'), 12);

  const lista = await chamar('GET', '/coletas?competencia=2026-10');
  assert.equal(lista.coletas.length, 2);
  const comps = await chamar('GET', '/competencias');
  assert.equal(comps.competencias[0].competencia, '2026-10');
});

test('etapa grande (15 mil linhas) é gravada de uma vez', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await chamar('POST', '/coletas', { id: 'g', competencia: '2026-10' });
  const t0 = Date.now();
  const r = await chamar('PUT', '/coletas/g/etapa', { chave: 'gerencial:atendimentos', bloco: 'atendimentos', status: 'ok',
    coletadoEm: '2026-11-03T10:00:00Z', cubos: { atendimentos: cuboAtendimentos(15000) } });
  assert.equal(r.contagens.atendimentos, 15000);
  assert.equal(await contar(env, 'cubo_atendimento'), 15000);
  assert.ok(Date.now() - t0 < 10000);
});

test('backup paginado e restauração devolvem exatamente os mesmos dados', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await semear(chamar);
  const backup = cliente(env, CHAVES.TOKEN_BACKUP);
  const admin = cliente(env, CHAVES.TOKEN_ADMIN);
  const antes = await chamar('GET', '/dados?competencia=2026-10');

  const m = await backup('GET', '/backup/manifesto');
  assert.equal(m.formato, 'indicadores-aps-backup');
  assert.equal(m.tabelas.coleta, 1);
  assert.ok(m.ultimaAlteracao);

  // páginas de 2 linhas para exercitar a paginação
  const tabelas = {};
  for (const nome of Object.keys(m.tabelas)) {
    tabelas[nome] = [];
    let depois = 0;
    for (;;) {
      const p = await backup('GET', `/backup/tabela/${nome}?depois=${depois}&limite=2`);
      tabelas[nome].push(...p.linhas);
      if (p.proximo === null) break;
      depois = p.proximo;
    }
    assert.equal(tabelas[nome].length, m.tabelas[nome], `contagem de ${nome}`);
  }
  // a chave de backup não restaura
  assert.equal((await backup('POST', '/restauracao/iniciar', { confirmar: 'APAGAR E RESTAURAR', versaoEsquema: 1 },
    { permitirErro: true })).status, 401);
  // sem a frase de confirmação, nada é apagado
  assert.equal((await admin('POST', '/restauracao/iniciar', { versaoEsquema: 1 }, { permitirErro: true })).status, 400);
  assert.equal((await admin('POST', '/restauracao/iniciar', { confirmar: 'APAGAR E RESTAURAR', versaoEsquema: 9 },
    { permitirErro: true })).status, 409);

  await admin('POST', '/restauracao/iniciar', { confirmar: 'APAGAR E RESTAURAR', versaoEsquema: m.versaoEsquema });
  assert.equal(await contar(env, 'coleta'), 0);
  for (const [nome, linhas] of Object.entries(tabelas)) {
    for (let i = 0; i < linhas.length; i += 3) await admin('POST', `/restauracao/tabela/${nome}`, { linhas: linhas.slice(i, i + 3) });
  }
  const fim = await admin('POST', '/restauracao/concluir', { contagens: m.tabelas });
  assert.equal(fim.ok, true, JSON.stringify(fim.divergencias));
  const depois = await chamar('GET', '/dados?competencia=2026-10');
  assert.deepEqual(depois, antes);
});
