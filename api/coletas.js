// Recebimento das coletas enviadas pela extensão do Chrome.
// Cada etapa é gravada de forma atômica e idempotente: reenviar a mesma etapa
// substitui os dados anteriores dela, sem duplicar.
import { MAPA_ENVIO, TABELAS_DA_ETAPA, CAMPOS_LINHA } from './esquema.js';
import { ErroHttp, agora, competencia, dataIso, texto, inteiro } from './util.js';

const TIPOS_COLETA = new Set(['completa', 'avulsa', 'final_gerenciais', 'importada']);
const STATUS_FINAIS = new Set(['concluida', 'parcial', 'cancelada']);
const MAX_ITENS = 20000;

function marcarAlteracao(env, quando) {
  return env.DB.prepare("UPDATE meta SET valor = ? WHERE chave = 'ultima_alteracao'").bind(quando);
}

export async function criarColeta(env, corpo) {
  const id = texto(corpo.id, 80) || crypto.randomUUID();
  if (!/^[\w.:-]+$/.test(id)) throw new ErroHttp(400, 'Identificador de coleta inválido.');
  const tipo = corpo.tipo || 'completa';
  if (!TIPOS_COLETA.has(tipo)) throw new ErroHttp(400, `Tipo de coleta desconhecido: ${tipo}.`);
  const comp = competencia(corpo.competencia);
  const iniciado = dataIso(corpo.iniciadoEm || agora(), 'iniciadoEm');
  const config = corpo.config === undefined ? null : JSON.stringify(corpo.config).slice(0, 200000);
  const quando = agora();

  const existente = await env.DB.prepare('SELECT id, competencia FROM coleta WHERE id = ?').bind(id).first();
  if (existente) {
    if (existente.competencia !== comp) throw new ErroHttp(409, 'Já existe uma coleta com este identificador em outra competência.');
    return { id, criada: false };
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO coleta (id, competencia, tipo, versao_extensao, iniciado_em, status, config, recebido_em)
                    VALUES (?, ?, ?, ?, ?, 'em_andamento', ?, ?)`,
    ).bind(id, comp, tipo, texto(corpo.versaoExtensao, 40), iniciado, config, quando),
    marcarAlteracao(env, quando),
  ]);
  return { id, criada: true };
}

async function buscarColeta(env, id) {
  const c = await env.DB.prepare('SELECT id, competencia, status FROM coleta WHERE id = ?').bind(id).first();
  if (!c) throw new ErroHttp(404, 'Coleta não encontrada. Crie a coleta antes de enviar etapas.');
  return c;
}

function lista(corpo, nome) {
  const v = corpo[nome];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ErroHttp(400, `"${nome}" deve ser uma lista.`);
  if (v.length > MAX_ITENS) throw new ErroHttp(413, `"${nome}" tem itens demais (${v.length}). Divida a etapa.`);
  return v;
}

// Linhas de indicador: valida o mínimo e junta campos desconhecidos em "extras".
function normalizarLinhas(linhas) {
  return linhas.map((l, i) => {
    if (!l || typeof l !== 'object') throw new ErroHttp(400, `Linha ${i} inválida.`);
    if (!l.codigo || !l.unidade || !l.equipe) throw new ErroHttp(400, `Linha ${i}: código, unidade e equipe são obrigatórios.`);
    const extras = { ...(l.extras && typeof l.extras === 'object' ? l.extras : {}) };
    for (const k of Object.keys(l)) if (!CAMPOS_LINHA.has(k)) extras[k] = l[k];
    return {
      codigo: String(l.codigo),
      recorte: l.recorte || 'situacao',
      unidade: String(l.unidade),
      unidadeCnes: l.unidadeCnes ?? null,
      equipe: String(l.equipe),
      ine: l.ine || null,
      tipoEquipe: l.tipoEquipe ?? null,
      numerador: l.numerador ?? null,
      denominador: l.denominador ?? null,
      somaPontos: l.somaPontos ?? null,
      valor: l.valor ?? null,
      excluidos: l.excluidos ?? null,
      itens: l.itens && typeof l.itens === 'object' ? JSON.stringify(l.itens) : null,
      extras: Object.keys(extras).length ? JSON.stringify(extras) : null,
    };
  });
}

// Uma única instrução por tabela: o próprio banco percorre a lista (json_each),
// o que mantém o Worker leve mesmo com milhares de linhas.
function inserirLista(env, nomeLista, itens, coletaId, chave, comp) {
  const { tabela, campos } = MAPA_ENVIO[nomeLista];
  const colunas = ['coleta_id', 'etapa_chave', 'competencia', ...Object.keys(campos)];
  const expressoes = ['?', '?', '?', ...Object.values(campos).map((c) => `json_extract(value, '${c}')`)];
  return env.DB.prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) SELECT ${expressoes.join(', ')} FROM json_each(?)`).bind(
    coletaId,
    chave,
    comp,
    JSON.stringify(itens),
  );
}

export async function gravarEtapa(env, coletaId, corpo) {
  const coleta = await buscarColeta(env, coletaId);
  const chave = texto(corpo.chave, 200);
  const bloco = texto(corpo.bloco, 60);
  if (!chave || !bloco) throw new ErroHttp(400, 'Informe "chave" e "bloco" da etapa.');
  const status = corpo.status === 'falhou' ? 'falhou' : 'ok';
  if (corpo.status && !['ok', 'falhou'].includes(corpo.status)) throw new ErroHttp(400, 'Status da etapa deve ser "ok" ou "falhou".');
  const coletadoEm = dataIso(corpo.coletadoEm, 'coletadoEm');
  const quando = agora();
  const comp = coleta.competencia;

  const valoresEtapa = [
    coletaId,
    chave,
    comp,
    bloco,
    texto(corpo.unidade, 200),
    texto(corpo.unidadeCnes, 20),
    texto(corpo.equipe, 200),
    texto(corpo.ine, 20),
    texto(corpo.tipoEquipe, 20),
    status,
    Math.max(1, inteiro(corpo.tentativas, 1)),
    texto(corpo.erro, 2000),
    coletadoEm,
    quando,
  ];
  const sqlEtapa = `INSERT INTO etapa (coleta_id, chave, competencia, bloco, unidade, unidade_cnes, equipe, ine, tipo_equipe,
                                       status, tentativas, erro, coletado_em, recebido_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (coleta_id, chave) DO UPDATE SET
                      bloco = excluded.bloco, unidade = excluded.unidade, unidade_cnes = excluded.unidade_cnes,
                      equipe = excluded.equipe, ine = excluded.ine, tipo_equipe = excluded.tipo_equipe,
                      status = excluded.status, tentativas = excluded.tentativas, erro = excluded.erro,
                      coletado_em = excluded.coletado_em, recebido_em = excluded.recebido_em`;

  if (status === 'falhou') {
    // Uma falha nunca apaga dados bons já gravados para a mesma etapa desta coleta.
    const r = await env.DB.batch([
      env.DB.prepare(sqlEtapa + " WHERE etapa.status <> 'ok'").bind(...valoresEtapa),
      marcarAlteracao(env, quando),
    ]);
    return { chave, status, gravada: (r[0].meta?.changes ?? 1) > 0 };
  }

  const linhas = normalizarLinhas(lista(corpo, 'linhas'));
  const cubos = corpo.cubos && typeof corpo.cubos === 'object' ? corpo.cubos : {};
  const atendimentos = lista(cubos, 'atendimentos');
  const absenteismo = lista(cubos, 'absenteismo');
  const escuta = lista(cubos, 'escuta');
  const avisos = lista(corpo, 'avisos')
    .map((a) => String(typeof a === 'string' ? a : (a?.mensagem ?? '')).slice(0, 2000))
    .filter(Boolean);

  const comandos = TABELAS_DA_ETAPA.map((t) =>
    env.DB.prepare(`DELETE FROM ${t} WHERE coleta_id = ? AND etapa_chave = ?`).bind(coletaId, chave),
  );
  comandos.push(env.DB.prepare(sqlEtapa).bind(...valoresEtapa));
  if (linhas.length) comandos.push(inserirLista(env, 'linhas', linhas, coletaId, chave, comp));
  if (atendimentos.length) comandos.push(inserirLista(env, 'atendimentos', atendimentos, coletaId, chave, comp));
  if (absenteismo.length) comandos.push(inserirLista(env, 'absenteismo', absenteismo, coletaId, chave, comp));
  if (escuta.length) comandos.push(inserirLista(env, 'escuta', escuta, coletaId, chave, comp));
  if (avisos.length) {
    comandos.push(
      env.DB.prepare(
        `INSERT INTO aviso (coleta_id, etapa_chave, competencia, mensagem, criado_em)
                                  SELECT ?, ?, ?, value, ? FROM json_each(?)`,
      ).bind(coletaId, chave, comp, quando, JSON.stringify(avisos)),
    );
  }
  comandos.push(marcarAlteracao(env, quando));
  await env.DB.batch(comandos); // tudo ou nada

  return {
    chave,
    status,
    gravada: true,
    contagens: {
      linhas: linhas.length,
      atendimentos: atendimentos.length,
      absenteismo: absenteismo.length,
      escuta: escuta.length,
      avisos: avisos.length,
    },
  };
}

export const MARCA_SUBSTITUIDA = 'Substituída pela coleta ';

export async function concluirColeta(env, coletaId, corpo) {
  await buscarColeta(env, coletaId);
  const status = corpo.status || 'concluida';
  if (!STATUS_FINAIS.has(status)) throw new ErroHttp(400, 'Status final deve ser concluida, parcial ou cancelada.');
  const quando = agora();
  const concluido = dataIso(corpo.concluidoEm || quando, 'concluidoEm');
  const ops = [env.DB.prepare('UPDATE coleta SET status = ?, concluido_em = ? WHERE id = ?').bind(status, concluido, coletaId)];
  // "Substituir todos": numa coleta completa, as etapas das coletas anteriores da mesma competência deixam de valer.
  // Nada é apagado: as etapas antigas ficam marcadas como substituídas (status "falhou" com o motivo), e por isso
  // saem dos dados vigentes. Coletas iniciadas depois desta (por exemplo, um "Refazer") continuam valendo.
  const substituir = corpo.substituir === 'todos' && status === 'concluida';
  if (substituir)
    ops.push(
      env.DB.prepare(
        `UPDATE etapa SET status = 'falhou', erro = ?
         WHERE status = 'ok' AND coleta_id <> ? AND competencia = (SELECT competencia FROM coleta WHERE id = ?)
           AND coleta_id IN (SELECT a.id FROM coleta a JOIN coleta n ON n.id = ?
                             WHERE a.competencia = n.competencia AND a.id <> n.id AND a.iniciado_em <= n.iniciado_em)`,
      ).bind(MARCA_SUBSTITUIDA + coletaId + '.', coletaId, coletaId, coletaId),
    );
  ops.push(marcarAlteracao(env, quando));
  const feitos = await env.DB.batch(ops);
  const substituidas = substituir ? feitos[1].meta?.changes || 0 : 0;
  const resumo = await env.DB.prepare(
    `SELECT
      SUM(status = 'ok') AS ok, SUM(status = 'falhou') AS falhas, COUNT(*) AS total
    FROM etapa WHERE coleta_id = ?`,
  )
    .bind(coletaId)
    .first();
  return { id: coletaId, status, substituidas, etapas: { ok: resumo.ok || 0, falhas: resumo.falhas || 0, total: resumo.total || 0 } };
}

export async function listarColetas(env, comp) {
  const filtro = comp ? 'WHERE c.competencia = ?' : '';
  const stmt = env.DB.prepare(`SELECT c.id, c.competencia, c.tipo, c.versao_extensao AS versaoExtensao, c.iniciado_em AS iniciadoEm,
           c.concluido_em AS concluidoEm, c.status,
           (SELECT COUNT(*) FROM etapa e WHERE e.coleta_id = c.id AND e.status = 'ok') AS etapasOk,
           (SELECT COUNT(*) FROM etapa e WHERE e.coleta_id = c.id AND e.status = 'falhou' AND COALESCE(e.erro, '') NOT LIKE 'Substituída%') AS etapasComFalha,
           (SELECT COUNT(*) FROM etapa e WHERE e.coleta_id = c.id AND e.status = 'falhou' AND e.erro LIKE 'Substituída%') AS etapasSubstituidas
    FROM coleta c ${filtro} ORDER BY c.iniciado_em DESC LIMIT 200`);
  const { results } = comp ? await stmt.bind(competencia(comp)).all() : await stmt.all();
  return { coletas: results };
}

// Registro de uma coleta (o passo a passo que a extensão mostra no painel: horários, tempo de cada parte, falhas)
// e os avisos dela. Só texto operacional; a extensão não põe dado de paciente no registro.
export async function registroDaColeta(env, coletaId) {
  const c = await buscarColeta(env, coletaId);
  const { results } = await env.DB.prepare(
    `SELECT etapa_chave AS etapa, mensagem FROM aviso
     WHERE coleta_id = ? AND (etapa_chave IN ('registro', 'avisos') OR etapa_chave LIKE 'registro:%')
     ORDER BY etapa_chave, rowid`,
  )
    .bind(coletaId)
    .all();
  // O registro vem em partes ("registro:0001", "registro:0002"…, só com as linhas novas) ou, nas versões 0.11.0 a 0.11.2, numa etapa só.
  return {
    id: coletaId, competencia: c.competencia, status: c.status,
    registro: results.filter((r) => r.etapa === 'registro' || r.etapa.startsWith('registro:')).map((r) => r.mensagem),
    avisos: results.filter((r) => r.etapa === 'avisos').map((r) => r.mensagem),
  };
}

export async function etapasDaColeta(env, coletaId) {
  await buscarColeta(env, coletaId);
  const { results } = await env.DB.prepare(
    `SELECT chave, bloco, unidade, equipe, ine, status, tentativas, erro,
           coletado_em AS coletadoEm FROM etapa WHERE coleta_id = ? ORDER BY unidade, equipe, chave`,
  )
    .bind(coletaId)
    .all();
  return { id: coletaId, etapas: results };
}
