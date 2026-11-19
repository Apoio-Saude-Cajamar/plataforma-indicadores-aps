// Filas e faltas: absenteísmo e dias até a próxima vaga, por profissional (médicos e enfermeiros da APS).
// A extensão envia totais por profissional; o painel junta com o que já havia do mês (recoleta parcial não apaga).
import { ErroHttp, agora, lerJson, texto, competencia } from './util.js';

const CATEGORIAS = ['Médico', 'Enfermeiro'];
const inteiro = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

export async function gravarFilas(env, corpo) {
  const comp = competencia(corpo.competencia);
  const lista = Array.isArray(corpo.profissionais) ? corpo.profissionais : null;
  if (!lista) throw new ErroHttp(400, 'Envie a lista de profissionais.');
  if (lista.length > 2000) throw new ErroHttp(400, 'Lista grande demais.');
  const quando = agora();
  const sql = `INSERT INTO fila_profissional (competencia, unidade, equipe, cbo, categoria, nome, faltas, atendimentos, dias_vaga, proxima_vaga, sem_vaga, agenda_lida_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (competencia, unidade, equipe, cbo, nome) DO UPDATE SET
      faltas = COALESCE(excluded.faltas, faltas), atendimentos = COALESCE(excluded.atendimentos, atendimentos),
      dias_vaga = CASE WHEN excluded.agenda_lida_em IS NOT NULL THEN excluded.dias_vaga ELSE dias_vaga END,
      proxima_vaga = CASE WHEN excluded.agenda_lida_em IS NOT NULL THEN excluded.proxima_vaga ELSE proxima_vaga END,
      sem_vaga = CASE WHEN excluded.agenda_lida_em IS NOT NULL THEN excluded.sem_vaga ELSE sem_vaga END,
      agenda_lida_em = COALESCE(excluded.agenda_lida_em, agenda_lida_em), atualizado_em = excluded.atualizado_em`;
  const ops = [];
  for (const p of lista) {
    const unidade = texto(p.unidade, 120),
      nome = texto(p.nome, 160),
      cbo = texto(p.cbo, 160);
    if (!unidade || !nome || !cbo || !CATEGORIAS.includes(p.categoria)) continue;
    const lida = p.agendaLidaEm ? texto(p.agendaLidaEm, 40) : null;
    ops.push(
      env.DB.prepare(sql).bind(
        comp,
        unidade,
        texto(p.equipe, 160) || '',
        cbo,
        p.categoria,
        nome,
        inteiro(p.faltas),
        inteiro(p.atendimentos),
        lida ? inteiro(p.diasVaga) : null,
        lida && p.proximaVaga ? texto(p.proximaVaga, 10) : null,
        lida ? (p.semVaga ? 1 : 0) : null,
        lida,
        quando,
      ),
    );
  }
  for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
  return { competencia: comp, gravados: ops.length };
}

// Faltas por horário: grade "dia da semana × hora" de cada profissional, lida da agenda do mês.
// A tabela é criada no primeiro uso, para a novidade funcionar sem passo manual no banco (o mesmo texto está em migrations/0009).
const SQL_HORARIO = `CREATE TABLE IF NOT EXISTS fila_horario (
  competencia TEXT NOT NULL, unidade TEXT NOT NULL, equipe TEXT NOT NULL DEFAULT '', cbo TEXT NOT NULL, categoria TEXT NOT NULL, nome TEXT NOT NULL,
  grade TEXT NOT NULL, atualizado_em TEXT NOT NULL, PRIMARY KEY (competencia, unidade, equipe, cbo, nome))`;
const prontas = new WeakSet();
export async function garantirHorario(env) {
  if (prontas.has(env.DB)) return;
  await env.DB.prepare(SQL_HORARIO).run();
  prontas.add(env.DB);
}

// Aceita só { dia 1 a 7: { hora 0 a 23: [agendados, atendidos, faltas] } }, com atendidos + faltas ≤ agendados.
function limparGrade(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  const out = {};
  let n = 0;
  for (const [d, horas] of Object.entries(g)) {
    const dia = Number(d);
    if (!Number.isInteger(dia) || dia < 1 || dia > 7 || !horas || typeof horas !== 'object' || Array.isArray(horas)) continue;
    for (const [h, v] of Object.entries(horas)) {
      const hora = Number(h);
      if (!Number.isInteger(hora) || hora < 0 || hora > 23 || !Array.isArray(v) || v.length !== 3) continue;
      const [ag, at, fa] = v.map(inteiro);
      if (ag === null || at === null || fa === null || at + fa > ag) continue;
      (out[dia] = out[dia] || {})[hora] = [ag, at, fa];
      n++;
    }
  }
  return n ? out : null;
}

export async function gravarFilasHorario(env, corpo) {
  const comp = competencia(corpo.competencia);
  const lista = Array.isArray(corpo.profissionais) ? corpo.profissionais : null;
  if (!lista) throw new ErroHttp(400, 'Envie a lista de profissionais.');
  if (lista.length > 2000) throw new ErroHttp(400, 'Lista grande demais.');
  await garantirHorario(env);
  const quando = agora();
  const sql = `INSERT INTO fila_horario (competencia, unidade, equipe, cbo, categoria, nome, grade, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (competencia, unidade, equipe, cbo, nome) DO UPDATE SET categoria = excluded.categoria, grade = excluded.grade, atualizado_em = excluded.atualizado_em`;
  const ops = [];
  for (const p of lista) {
    const unidade = texto(p.unidade, 120),
      nome = texto(p.nome, 160),
      cbo = texto(p.cbo, 160),
      grade = limparGrade(p.grade);
    if (!unidade || !nome || !cbo || !grade || !CATEGORIAS.includes(p.categoria)) continue;
    ops.push(env.DB.prepare(sql).bind(comp, unidade, texto(p.equipe, 160) || '', cbo, p.categoria, nome, JSON.stringify(grade), quando));
  }
  for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
  return { competencia: comp, gravados: ops.length };
}

export async function lerFilas(env, url) {
  const pedido = url.searchParams.get('competencia');
  await garantirHorario(env);
  const lista = (
    await env.DB.prepare(
      'SELECT competencia FROM fila_profissional UNION SELECT competencia FROM fila_horario ORDER BY competencia DESC',
    ).all()
  ).results.map((x) => x.competencia);
  const comp = pedido ? competencia(pedido) : lista[0];
  if (!comp) return { competencias: [], competencia: null, profissionais: [], horarios: [] };
  const { results } = await env.DB.prepare(
    `SELECT unidade, equipe, cbo, categoria, nome, faltas, atendimentos, dias_vaga AS diasVaga, proxima_vaga AS proximaVaga,
      sem_vaga AS semVaga, agenda_lida_em AS agendaLidaEm FROM fila_profissional WHERE competencia = ? ORDER BY unidade, equipe, nome`,
  )
    .bind(comp)
    .all();
  const hs = (
    await env.DB.prepare(
      'SELECT unidade, equipe, cbo, categoria, nome, grade FROM fila_horario WHERE competencia = ? ORDER BY unidade, equipe, nome',
    )
      .bind(comp)
      .all()
  ).results;
  const horarios = hs.map((h) => {
    let grade = {};
    try {
      grade = JSON.parse(h.grade) || {};
    } catch (_) {
      /* grade ilegível: fica vazia */
    }
    return { unidade: h.unidade, equipe: h.equipe, cbo: h.cbo, categoria: h.categoria, nome: h.nome, grade };
  });
  return { competencias: lista, competencia: comp, profissionais: results, horarios };
}

// Evolução: as competências mais recentes (até 24) de uma vez, para comparar mês a mês e desenhar trajetórias.
// Só leitura; mesmos campos de lerFilas, com a competência em cada linha.
export async function lerFilasEvolucao(env, url) {
  const ate = url.searchParams.get('ate');
  const meses = Math.min(24, Math.max(2, Number(url.searchParams.get('meses')) || 12));
  const fim = ate ? competencia(ate) : null;
  const lista = (
    await env.DB.prepare(
      `SELECT DISTINCT competencia FROM fila_profissional ${fim ? 'WHERE competencia <= ?' : ''} ORDER BY competencia DESC LIMIT ?`,
    )
      .bind(...(fim ? [fim, meses] : [meses]))
      .all()
  ).results
    .map((x) => x.competencia)
    .reverse();
  if (!lista.length) return { competencias: [], profissionais: [] };
  const { results } = await env.DB.prepare(
    `SELECT competencia, unidade, equipe, cbo, categoria, nome, faltas, atendimentos, dias_vaga AS diasVaga,
      sem_vaga AS semVaga, agenda_lida_em AS agendaLidaEm FROM fila_profissional
      WHERE competencia >= ? AND competencia <= ? ORDER BY competencia, unidade, equipe, nome`,
  )
    .bind(lista[0], lista[lista.length - 1])
    .all();
  return { competencias: lista, profissionais: results };
}
