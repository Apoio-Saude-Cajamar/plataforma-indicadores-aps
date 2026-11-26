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

  // Só as partes pedidas (o dashboard e a tela Dados pedem só os indicadores).
  const so = await chamar('GET', '/dados?partes=indicadores&competencia=2026-10');
  assert.deepEqual(Object.keys(so).filter((k) => k !== 'status').sort(), ['competencia', 'indicadores']);
  assert.equal(so.indicadores.length, dados.indicadores.length);
  const duas = await chamar('GET', '/dados?partes=indicadores,absenteismo&competencia=2026-10');
  assert.ok('absenteismo' in duas && !('atendimentos' in duas));

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
  for (const t of ['lancamento', 'lancamento_estadual', 'vacina_pec', 'fila_profissional', 'fila_horario', 'comunicado', 'publicacao_item']) {
    assert.equal(typeof m.tabelas[t], 'number', `backup inclui ${t}`);
  }
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

test('mesma equipe (INE) em unidades diferentes entre coletas vale uma vez; eMulti sai em "Município"', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  const etapa = (coleta, unidade, quando, linhas) => chamar('PUT', `/coletas/${coleta}/etapa`, { chave: 'unidade:' + unidade, bloco: 'unidade',
    unidade, status: 'ok', coletadoEm: quando, linhas });
  const m1 = (unidade, den) => ({ codigo: 'M1', unidade, equipe: 'COMPLEMENTAR 3', ine: '0002526255', numerador: 2874, denominador: den });
  const c6 = (unidade, eq, ine, den) => ({ codigo: 'C6', unidade, equipe: eq, ine, denominador: den, somaPontos: den * 50 });
  const q = (unidade, equipe, num, den) => ({ codigo: 'Q14.2.1', unidade, equipe, numerador: num, denominador: den });
  await chamar('POST', '/coletas', { id: 'a', competencia: '2026-10', iniciadoEm: '2026-11-16T15:00:00Z' });
  await etapa('a', 'Município', '2026-11-16T15:00:00Z', [m1('Município', 1776)]);
  await etapa('a', 'UBS A', '2026-11-16T15:00:00Z', [c6('UBS A', 'ESF 1', '0001', 10), q('UBS A', 'ESF 1', 3, 30)]);
  await chamar('POST', '/coletas', { id: 'b', competencia: '2026-10', iniciadoEm: '2026-11-19T19:00:00Z' });
  await etapa('b', 'UBS B', '2026-11-19T19:00:00Z', [m1('UBS B', 969), c6('UBS B', 'ESF 2', '0002', 20)]);
  const d = await chamar('GET', '/dados?competencia=2026-10');
  const M1 = d.indicadores.filter(l => l.codigo === 'M1');
  assert.equal(M1.length, 1, 'uma linha de M1 por equipe eMulti');
  assert.equal(M1[0].denominador, 969, 'a da coleta mais recente');
  assert.equal(M1[0].unidade, 'Município');
  // Equipes diferentes continuam separadas; linha sem INE segue pelo nome.
  assert.deepEqual(d.indicadores.filter(l => l.codigo === 'C6').map(l => l.unidade).sort(), ['UBS A', 'UBS B']);
  assert.equal(d.indicadores.filter(l => l.codigo === 'Q14.2.1').length, 1);
});

test('C1 só de eSF e eAP; Saúde em Casa (EMAD/EMAP) fora de tudo', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await chamar('POST', '/coletas', { id: 'x', competencia: '2026-01', iniciadoEm: '2026-11-22T05:00:00Z' });
  const c1 = (equipe, n, d) => ({ codigo: 'C1', unidade: 'UBS A', equipe, numerador: n, denominador: d });
  await chamar('PUT', '/coletas/x/etapa', { chave: 'unidade:UBS A', bloco: 'unidade', unidade: 'UBS A', status: 'ok', coletadoEm: '2026-11-22T05:00:00Z',
    linhas: [c1('ESF 1', 30, 50), c1('INE NÃO ENCONTRADO', 538, 657), c1('SEM EQUIPE', 1, 2), c1('CONSULTORIO RUA CAJAMAR', 0, 31),
      c1('EMAD CAJAMAR', 5, 9), { codigo: 'Q14.2.1', unidade: 'UBS A', equipe: 'Sem Equipe', numerador: 97, denominador: 342 },
      { codigo: 'Q14.2.1', unidade: 'UBS A', equipe: 'Saúde em Casa', numerador: 3, denominador: 30 }],
    cubos: { atendimentos: [{ unidade: 'UBS A', equipe: 'EMAD CAJAMAR', cbo: 'x', cboCodigo: '225142', grupoCBO: 'medicos', tipoAtendimento: 'Consulta no dia', n: 7 },
      { unidade: 'UBS A', equipe: 'ESF 1', cbo: 'x', cboCodigo: '225142', grupoCBO: 'medicos', tipoAtendimento: 'Consulta no dia', n: 4 }] } });
  const d = await chamar('GET', '/dados?competencia=2026-01');
  assert.deepEqual(d.indicadores.filter(l => l.codigo === 'C1').map(l => l.equipe), ['ESF 1']);
  assert.deepEqual(d.indicadores.filter(l => l.codigo === 'Q14.2.1').map(l => l.equipe), ['Sem Equipe'], '"Sem equipe" continua no absenteísmo');
  assert.deepEqual(d.atendimentos.map(a => a.equipe), ['ESF 1']);
});

test('registro da coleta: guardado por etapa, lido em ordem e fora dos avisos do monitoramento', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await chamar('POST', '/coletas', { id: 'r1', competencia: '2026-10' });
  const reg = l => chamar('PUT', '/coletas/r1/etapa', { chave: 'registro', bloco: 'registro', status: 'ok', coletadoEm: '2026-11-22T10:00:00Z', avisos: l });
  await reg(['10:00 · Coleta iniciada.', '10:05 · UBS A: concluída em 5 min.']);
  await reg(['10:00 · Coleta iniciada.', '10:05 · UBS A: concluída em 5 min.', '10:11 · UBS B: concluída em 6 min.']);
  await chamar('PUT', '/coletas/r1/etapa', { chave: 'avisos', bloco: 'avisos', status: 'ok', coletadoEm: '2026-11-22T10:00:00Z', avisos: ['UBS B: escuta não lida.'] });
  const r = await chamar('GET', '/coletas/r1/registro');
  assert.deepEqual(r.registro, ['10:00 · Coleta iniciada.', '10:05 · UBS A: concluída em 5 min.', '10:11 · UBS B: concluída em 6 min.']);
  assert.deepEqual(r.avisos, ['UBS B: escuta não lida.']);
});

test('registro em partes (0.11.3): lido em ordem, junto com o formato antigo, e fora da situação', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await chamar('POST', '/coletas', { id: 'r2', competencia: '2026-10' });
  const parte = (n, l) => chamar('PUT', '/coletas/r2/etapa', { chave: 'registro:' + String(n).padStart(4, '0'), bloco: 'registro', status: 'ok', coletadoEm: '2026-11-22T10:00:00Z', avisos: l });
  await parte(2, ['10:11 · UBS B: concluída em 6 min.']);
  await parte(1, ['10:00 · Coleta iniciada.', '10:05 · UBS A: concluída em 5 min.']);
  await parte(2, ['10:11 · UBS B: concluída em 6 min.', '10:12 · Coleta enviada.']); // reenvio da mesma parte: substitui, sem duplicar
  const r = await chamar('GET', '/coletas/r2/registro');
  assert.deepEqual(r.registro, ['10:00 · Coleta iniciada.', '10:05 · UBS A: concluída em 5 min.', '10:11 · UBS B: concluída em 6 min.', '10:12 · Coleta enviada.']);
  const s = await chamar('GET', '/situacao?competencia=2026-10');
  assert.equal(s.etapas.filter(e => e.bloco === 'registro').length, 0, 'as partes do registro não aparecem como etapas pendentes');
});

test('limite diário do D1: resposta 503 com mensagem clara, não "Erro interno"', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await chamar('POST', '/coletas', { id: 'l1', competencia: '2026-10' });
  const original = env.DB.batch.bind(env.DB);
  env.DB.batch = async () => { throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Please upgrade to a paid plan or wait until the next day."); };
  const r = await chamar('PUT', '/coletas/l1/etapa', { chave: 'unidade:UBS A', bloco: 'unidade', status: 'ok', coletadoEm: '2026-11-22T10:00:00Z', linhas: [] }, { permitirErro: true });
  env.DB.batch = original;
  assert.equal(r.status, 503);
  assert.equal(r.limite, 'write');
  assert.match(r.erro, /Limite diário de gravação do banco do Painel atingido/);
});

test('dados da competência não varrem os cubos inteiros (limite de leituras do D1)', async () => {
  const env = ambiente();
  const { readFileSync } = await import('node:fs');
  const fonte = readFileSync(new URL('../api/consultas.js', import.meta.url), 'utf8');
  const { EQUIPE_FORA } = await import('../api/vigente.js');
  for (const cubo of ['cubo_atendimento', 'cubo_falta', 'cubo_escuta']) {
    assert.match(fonte, new RegExp('FROM etapa_vigente v\\s+CROSS JOIN ' + cubo + ' c'), cubo + ' parte das etapas vigentes');
    const plano = env.DB.db
      .prepare(`EXPLAIN QUERY PLAN SELECT c.* FROM etapa_vigente v CROSS JOIN ${cubo} c ON c.coleta_id = v.coleta_id AND c.etapa_chave = v.chave WHERE v.competencia = ? AND NOT ${EQUIPE_FORA('c')}`)
      .all()
      .map((r) => r.detail);
    assert.ok(!plano.some((d) => /^SCAN c\b/.test(d)), cubo + ': ' + plano.join(' | '));
  }
});

test('dados da competência ficam prontos no banco e se refazem quando os dados mudam', async () => {
  const env = ambiente();
  const chamar = cliente(env);
  await semear(chamar);
  const comp = (await chamar('GET', '/competencias')).competencias[0].competencia;
  // A conclusão da coleta (no semear) já deixou o mês calculado nas três combinações que as telas pedem.
  assert.equal(await contar(env, 'dados_cache', 'competencia = ?', comp), 3);
  const a = await chamar('GET', '/dados?partes=indicadores&competencia=' + comp);
  // Mexer na resposta guardada mostra que a segunda leitura vem dela.
  await env.DB.prepare("UPDATE dados_cache SET json = '{\"competencia\":\"x\",\"indicadores\":[]}'").run();
  const b = await chamar('GET', '/dados?partes=indicadores&competencia=' + comp);
  assert.equal(b.competencia, 'x');
  // Mudança em outro mês não mexe nesta resposta pronta.
  await chamar('POST', '/coletas', { id: 'outro', competencia: '2026-09', tipo: 'avulsa', iniciadoEm: '2026-12-01T09:00:00Z' });
  await chamar('PUT', '/coletas/outro/etapa', { chave: 'lista:idosos:x', bloco: 'idosos', status: 'ok', coletadoEm: '2026-12-01T09:01:00Z', linhas: linhasIdosos(10) });
  assert.equal((await chamar('GET', '/dados?partes=indicadores&competencia=' + comp)).competencia, 'x');
  // Uma etapa nova do mês muda a marca dele: a resposta é refeita com os dados atuais.
  await chamar('POST', '/coletas', { id: 'nova', competencia: comp, tipo: 'avulsa', iniciadoEm: '2026-12-01T10:00:00Z' });
  await chamar('PUT', '/coletas/nova/etapa', { chave: 'lista:idosos:y', bloco: 'idosos', status: 'falhou', erro: 'tempo esgotado', coletadoEm: '2026-12-01T10:01:00Z' });
  const c = await chamar('GET', '/dados?partes=indicadores&competencia=' + comp);
  assert.equal(c.competencia, comp);
  assert.equal(c.indicadores.length, a.indicadores.length);
  // No fim da coleta o mês já fica calculado.
  await env.DB.prepare('DELETE FROM dados_cache').run();
  await chamar('POST', '/coletas/nova/concluir', {});
  assert.equal(await contar(env, 'dados_cache', 'competencia = ?', comp), 3);
});
