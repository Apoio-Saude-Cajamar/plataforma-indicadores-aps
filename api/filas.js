// Filas e faltas: absenteísmo e dias até a próxima vaga, por profissional (médicos e enfermeiros da APS).
// A extensão envia totais por profissional; o painel junta com o que já havia do mês (recoleta parcial não apaga).
import { ErroHttp, agora, lerJson, texto, competencia } from './util.js';

const CATEGORIAS = ['Médico', 'Enfermeiro'];
const inteiro = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

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
    const unidade = texto(p.unidade, 120), nome = texto(p.nome, 160), cbo = texto(p.cbo, 160);
    if (!unidade || !nome || !cbo || !CATEGORIAS.includes(p.categoria)) continue;
    const lida = p.agendaLidaEm ? texto(p.agendaLidaEm, 40) : null;
    ops.push(env.DB.prepare(sql).bind(comp, unidade, texto(p.equipe, 160) || '', cbo, p.categoria, nome, inteiro(p.faltas), inteiro(p.atendimentos),
      lida ? inteiro(p.diasVaga) : null, lida && p.proximaVaga ? texto(p.proximaVaga, 10) : null, lida ? (p.semVaga ? 1 : 0) : null, lida, quando));
  }
  for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
  return { competencia: comp, gravados: ops.length };
}

export async function lerFilas(env, url) {
  const pedido = url.searchParams.get('competencia');
  const lista = (await env.DB.prepare('SELECT DISTINCT competencia FROM fila_profissional ORDER BY competencia DESC').all()).results.map(x => x.competencia);
  const comp = pedido ? competencia(pedido) : lista[0];
  if (!comp) return { competencias: [], competencia: null, profissionais: [] };
  const { results } = await env.DB.prepare(`SELECT unidade, equipe, cbo, categoria, nome, faltas, atendimentos, dias_vaga AS diasVaga, proxima_vaga AS proximaVaga,
      sem_vaga AS semVaga, agenda_lida_em AS agendaLidaEm FROM fila_profissional WHERE competencia = ? ORDER BY unidade, equipe, nome`).bind(comp).all();
  return { competencias: lista, competencia: comp, profissionais: results };
}
