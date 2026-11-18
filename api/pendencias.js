// Pendências de uma competência: o que ficou faltando ou parece inconsistente nos dados já gravados.
// Só lê (nada é alterado) e só devolve contagens e nomes de unidade; nenhum nome de profissional ou de paciente.
import { competencia } from './util.js';

// Indicadores que dependem do tipo de equipe da unidade: a ausência pode ser normal.
const OPCIONAIS = /^(CR\d|M1$|M2$|B[1-6]$)/;
// "Piso": o PEC só informa a data do último atendimento, então passar de 100% é esperado.
const PISO = new Set(['CVAT-ACO', 'CVAT-CAD']);
const NOTAS = {
  B2: 'O indicador conta registros sem vincular à primeira consulta; sem faixa oficial.',
  B4: 'O denominador vem de VINC6A12 (crianças de 6 a 12 anos vinculadas), lido na coleta por unidade.',
};

const vigentes = `
  SELECT i.unidade, i.codigo, i.numerador, i.denominador, i.soma_pontos, ROW_NUMBER() OVER (
    PARTITION BY i.codigo, i.recorte, i.unidade, i.equipe ORDER BY e.coletado_em DESC, i.coleta_id DESC) AS ordem
  FROM indicador_equipe i JOIN etapa e ON e.coleta_id = i.coleta_id AND e.chave = i.etapa_chave
  WHERE i.competencia = ? AND e.status = 'ok' AND i.recorte = 'situacao' AND i.unidade IS NOT NULL AND i.unidade <> ''`;

const mesAnterior = (d) => {
  const a = d.getUTCFullYear(),
    m = d.getUTCMonth(); // m: 0 a 11 do mês atual
  return m === 0 ? `${a - 1}-12` : `${a}-${String(m).padStart(2, '0')}`;
};
// Primeiro dia útil do mês (segunda a sexta; feriados não entram na conta).
const primeiroUtil = (d) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  while ([0, 6].includes(x.getUTCDay())) x.setUTCDate(x.getUTCDate() + 1);
  return x.getUTCDate();
};

// Regras puras (testáveis sem banco). Entrada já agregada por unidade.
export function analisar({ linhas, filas, agenda, horario, composicaoUnidades, temComposicao, comps, comp, agora }) {
  const achados = [];
  const add = (nivel, unidade, tema, texto) => achados.push({ nivel, unidade: unidade || 'Geral', tema, texto });
  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();

  const porUn = new Map();
  for (const l of linhas) {
    const k = norm(l.unidade);
    if (!porUn.has(k)) porUn.set(k, { nome: l.unidade, cods: new Map() });
    porUn.get(k).cods.set(l.codigo, l);
  }
  const todas = new Map();
  const reg = (n) => {
    if (n && !todas.has(norm(n))) todas.set(norm(n), n);
  };
  linhas.forEach((l) => reg(l.unidade));
  Object.keys(filas).forEach(reg);
  (composicaoUnidades || []).forEach(reg);
  const unidades = [...todas.values()].sort((a, b) => a.localeCompare(b, 'pt'));
  const pegar = (m, u) =>
    Object.entries(m)
      .filter(([k]) => norm(k) === norm(u))
      .reduce((t, [, n]) => t + n, 0);

  // 1) A competência chegou?
  const hoje = new Date(agora);
  const esperada = mesAnterior(hoje);
  if (comp === esperada || !comps.includes(esperada)) {
    const diasDesde = hoje.getUTCDate();
    if (!comps.includes(esperada) && diasDesde >= primeiroUtil(hoje))
      add(
        diasDesde > 10 ? 'erro' : 'atencao',
        null,
        'Competência',
        `A coleta de ${esperada.slice(5)}/${esperada.slice(0, 4)} ainda não foi recebida. O ideal é coletar no primeiro dia útil do mês.`,
      );
  }

  // 2) Indicadores por unidade
  const comDados = [...porUn.values()];
  const freq = {};
  comDados.forEach((u) =>
    u.cods.forEach((_, c) => {
      freq[c] = (freq[c] || 0) + 1;
    }),
  );
  const limite = Math.max(2, Math.ceil(comDados.length * 0.6));
  const esperados = Object.keys(freq).filter((c) => freq[c] >= limite && !OPCIONAIS.test(c));
  const opcionais = Object.keys(freq).filter((c) => OPCIONAIS.test(c));
  for (const u of unidades) {
    const d = porUn.get(norm(u));
    if (!d) {
      add('erro', u, 'Indicadores', 'Nenhum indicador por unidade foi recebido.');
      continue;
    }
    const faltam = esperados.filter((c) => !d.cods.has(c)).sort();
    if (faltam.length)
      add('atencao', u, 'Indicadores ausentes', `Não recebidos (presentes na maioria das unidades): ${faltam.join(', ')}.`);
    const fo = opcionais.filter((c) => !d.cods.has(c)).sort();
    if (fo.length)
      add(
        'info',
        u,
        'Indicadores opcionais',
        `Sem dados de: ${fo.join(', ')}. Pode ser normal se a unidade não tem esse tipo de equipe (odontologia, eMulti, eCR).`,
      );
  }

  // 3) Valores suspeitos
  for (const d of comDados) {
    for (const l of d.cods.values()) {
      if (l.soma_pontos) continue;
      const n = l.numerador || 0,
        dn = l.denominador || 0;
      const nota = NOTAS[l.codigo] ? ' ' + NOTAS[l.codigo] : '';
      if (dn === 0 && n > 0)
        add('atencao', d.nome, 'Valores suspeitos', `${l.codigo}: numerador ${n} com denominador 0 (resultado indisponível).${nota}`);
      else if (dn > 0 && n > dn)
        add(
          PISO.has(l.codigo) ? 'info' : 'atencao',
          d.nome,
          'Valores suspeitos',
          `${l.codigo}: numerador ${n} maior que o denominador ${dn} (${((100 * n) / dn).toFixed(1).replace('.', ',')}%).${PISO.has(l.codigo) ? ' Esperado: é um índice por piso.' : nota}`,
        );
    }
  }

  // 4) Filas, horários e composição
  const temFilas = Object.keys(filas).length > 0,
    temHorario = Object.keys(horario).length > 0;
  for (const u of unidades) {
    if (temFilas) {
      if (!pegar(filas, u)) add('atencao', u, 'Filas e faltas', 'Nenhum médico ou enfermeiro com produção ou agenda recebido.');
      else if (!pegar(agenda, u))
        add('atencao', u, 'Filas e faltas', 'Profissionais recebidos, mas nenhuma agenda (dias até a próxima vaga).');
      if (temHorario && !pegar(horario, u)) add('atencao', u, 'Faltas por horário', 'Nenhuma grade de horários recebida.');
    }
    if (temComposicao && !(composicaoUnidades || []).some((n) => norm(n) === norm(u)))
      add('atencao', u, 'Composição', 'Unidade fora do quadro de composição desta competência.');
  }
  if (!temComposicao && comDados.length)
    add('atencao', null, 'Composição', 'A composição das equipes desta competência ainda não foi enviada.');
  if (!temFilas && comDados.length) add('atencao', null, 'Filas e faltas', 'Nenhum dado de filas e faltas recebido nesta competência.');
  else if (temFilas && !temHorario) add('info', null, 'Faltas por horário', 'Nenhuma grade de horários recebida nesta competência.');

  const ordem = { erro: 0, atencao: 1, info: 2 };
  achados.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || a.unidade.localeCompare(b.unidade, 'pt') || a.tema.localeCompare(b.tema, 'pt'));
  return { unidades: unidades.length, achados };
}

export async function pendencias(env, pedido, agora = Date.now()) {
  let comps = [];
  try {
    comps = (await env.DB.prepare('SELECT DISTINCT competencia FROM indicador_equipe ORDER BY competencia DESC').all()).results.map(
      (r) => r.competencia,
    );
  } catch (_) {
    /* nada coletado ainda */
  }
  const comp = pedido ? competencia(pedido) : comps[0] || mesAnterior(new Date(agora));
  const ler = async (sql, ...p) =>
    (
      await env.DB.prepare(sql)
        .bind(...p)
        .all()
    ).results;

  const linhas = await ler(
    `SELECT unidade, codigo, SUM(numerador) AS numerador, SUM(denominador) AS denominador, SUM(soma_pontos) AS soma_pontos
     FROM (${vigentes}) WHERE ordem = 1 GROUP BY unidade, codigo`,
    comp,
  );
  const contar = (rs) => Object.fromEntries(rs.map((r) => [r.unidade, r.n]));
  let filas = {},
    agenda = {},
    horario = {};
  try {
    filas = contar(await ler('SELECT unidade, COUNT(*) AS n FROM fila_profissional WHERE competencia = ? GROUP BY unidade', comp));
    agenda = contar(
      await ler(
        'SELECT unidade, COUNT(*) AS n FROM fila_profissional WHERE competencia = ? AND agenda_lida_em IS NOT NULL GROUP BY unidade',
        comp,
      ),
    );
    horario = contar(await ler('SELECT unidade, COUNT(*) AS n FROM fila_horario WHERE competencia = ? GROUP BY unidade', comp));
  } catch (_) {
    /* tabelas de filas ainda não existem */
  }
  let c = null;
  try {
    c = await env.DB.prepare('SELECT dados FROM composicao WHERE competencia = ?').bind(comp).first();
  } catch (_) {
    /* tabela ainda não existe */
  }
  let composicaoUnidades = [];
  if (c) {
    try {
      composicaoUnidades = (JSON.parse(c.dados).unidades || []).map((u) => u.nome);
    } catch (_) {
      /* dados ilegíveis */
    }
  }

  const r = analisar({ linhas, filas, agenda, horario, composicaoUnidades, temComposicao: !!c, comps, comp, agora });
  const totais = { erro: 0, atencao: 0, info: 0 };
  r.achados.forEach((a) => {
    totais[a.nivel]++;
  });
  return {
    competencia: comp,
    competencias: comps,
    geradoEm: new Date(agora).toISOString(),
    unidades: r.unidades,
    totais,
    achados: r.achados,
  };
}
