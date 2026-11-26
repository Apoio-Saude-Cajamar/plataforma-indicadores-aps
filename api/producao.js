// Produção por profissional (relatório "Produção e notas"): atendimentos individuais e atividades coletivas
// de cada profissional das unidades de APS, por mês. Só totais; nenhum dado de paciente.
// A extensão envia o município inteiro de uma vez, então o envio troca a produção do mês.
import { ErroHttp, agora, texto, competencia, sqlCompetencias } from './util.js';

const SQL_TABELA = `CREATE TABLE IF NOT EXISTS producao_profissional (
  competencia TEXT NOT NULL, unidade TEXT NOT NULL, equipe TEXT NOT NULL DEFAULT '', ine TEXT NOT NULL DEFAULT '',
  cbo TEXT NOT NULL, cbo_nome TEXT, nome TEXT NOT NULL,
  individuais INTEGER NOT NULL DEFAULT 0, compartilhados INTEGER NOT NULL DEFAULT 0, por_tipo TEXT,
  coletivas_responsavel INTEGER NOT NULL DEFAULT 0, coletivas_envolvido INTEGER NOT NULL DEFAULT 0, participacoes INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (competencia, unidade, equipe, cbo, nome))`;
const prontas = new WeakSet();
export async function garantirProducao(env) {
  if (prontas.has(env.DB)) return;
  await env.DB.prepare(SQL_TABELA).run();
  prontas.add(env.DB);
}

const inteiro = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

export async function gravarProducao(env, corpo) {
  const comp = competencia(corpo.competencia);
  const lista = Array.isArray(corpo.profissionais) ? corpo.profissionais : null;
  if (!lista) throw new ErroHttp(400, 'Envie a lista de profissionais.');
  if (lista.length > 5000) throw new ErroHttp(400, 'Lista grande demais.');
  await garantirProducao(env);
  const quando = agora();
  // Junta repetições (mesma unidade, equipe, CBO e nome) antes de gravar.
  const porChave = new Map();
  for (const p of lista) {
    const unidade = texto(p.unidade, 120),
      nome = texto(p.nome, 160),
      cbo = texto(String(p.cbo || ''), 20);
    if (!unidade || !nome || !cbo) continue;
    const equipe = texto(p.equipe, 160) || '';
    const k = [unidade, equipe, cbo, nome].join('|');
    const o = porChave.get(k) || { u: unidade, e: equipe, i: '', c: cbo, cn: null, n: nome, ind: 0, com: 0, pt: {}, cr: 0, ce: 0, pa: 0 };
    o.i = o.i || texto(String(p.ine || ''), 20) || '';
    o.cn = o.cn || texto(p.cboNome, 160) || null;
    o.ind += inteiro(p.individuais);
    o.com += inteiro(p.compartilhados);
    o.cr += inteiro(p.coletivasResponsavel);
    o.ce += inteiro(p.coletivasEnvolvido);
    o.pa += inteiro(p.participacoes);
    if (p.porTipo && typeof p.porTipo === 'object' && !Array.isArray(p.porTipo))
      for (const [tk, tv] of Object.entries(p.porTipo).slice(0, 40)) {
        const t = texto(tk, 80);
        if (t && inteiro(tv)) o.pt[t] = (o.pt[t] || 0) + inteiro(tv);
      }
    porChave.set(k, o);
  }
  const linhas = [...porChave.values()].map((o) => Object.assign(o, { pt: Object.keys(o.pt).length ? JSON.stringify(o.pt) : null }));
  // Troca do mês num lote só (tudo ou nada): apaga e grava a partir de um JSON, numa única instrução.
  const v = (c) => `json_extract(j.value, '$.${c}')`;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM producao_profissional WHERE competencia = ?').bind(comp),
    env.DB.prepare(
      `INSERT INTO producao_profissional (competencia, unidade, equipe, ine, cbo, cbo_nome, nome, individuais, compartilhados, por_tipo,
         coletivas_responsavel, coletivas_envolvido, participacoes, atualizado_em)
       SELECT ?, ${['u', 'e', 'i', 'c', 'cn', 'n', 'ind', 'com', 'pt', 'cr', 'ce', 'pa'].map(v).join(', ')}, ? FROM json_each(?) j`,
    ).bind(comp, quando, JSON.stringify(linhas)),
  ]);
  return { competencia: comp, gravados: linhas.length };
}

// Leitura de um intervalo de competências (até 24 meses).
export async function lerProducao(env, url) {
  await garantirProducao(env);
  const lista = (await env.DB.prepare(sqlCompetencias('producao_profissional')).all()).results.map(
    (x) => x.competencia,
  );
  const de = url.searchParams.get('de') ? competencia(url.searchParams.get('de')) : lista[0];
  const ate = url.searchParams.get('ate') ? competencia(url.searchParams.get('ate')) : de;
  if (!de) return { competencias: [], de: null, ate: null, profissionais: [] };
  if (ate < de) throw new ErroHttp(400, 'O fim do período vem antes do início.');
  const meses = (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5)) - Number(de.slice(5)) + 1;
  if (meses > 24) throw new ErroHttp(400, 'Escolha no máximo 24 meses.');
  const { results } = await env.DB.prepare(
    `SELECT competencia, unidade, equipe, ine, cbo, cbo_nome AS cboNome, nome, individuais, compartilhados, por_tipo AS porTipo,
       coletivas_responsavel AS coletivasResponsavel, coletivas_envolvido AS coletivasEnvolvido, participacoes
     FROM producao_profissional WHERE competencia BETWEEN ? AND ? ORDER BY competencia, unidade, equipe, nome`,
  )
    .bind(de, ate)
    .all();
  for (const r of results) {
    try {
      r.porTipo = r.porTipo ? JSON.parse(r.porTipo) : {};
    } catch (_) {
      r.porTipo = {};
    }
  }
  return { competencias: lista, de, ate, profissionais: results };
}
