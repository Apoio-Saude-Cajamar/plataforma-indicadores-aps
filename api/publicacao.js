// Página pública: o administrador escolhe, por categoria, quais totais agregados ficam visíveis sem senha.
// Só itens do catálogo (campos permitidos, sem observações, responsáveis nem pendências) podem ser públicos.
import { ErroHttp, agora, lerJson, json } from './util.js';
import { registrar } from './auth.js';
import { competencias, dadosVigentes } from './consultas.js';
import { listarEstadual } from './estadual.js';

const FONTES = [
  { arq: '/js/dados-municipal.js', chave: 'MUNICIPAL' },
  // Federal (Siaps) fora por ora: a página pública e o Painel mostram só o que vem do PEC e-SUS.
];

async function carregar(env, url) {
  const dados = {};
  for (const f of FONTES) {
    const r = await env.ASSETS.fetch(new Request(new URL(f.arq, url).toString()));
    const t = r.ok ? await r.text() : '';
    const i = t.indexOf('=');
    try {
      dados[f.chave] = JSON.parse(
        t
          .slice(i + 1)
          .trim()
          .replace(/;$/, ''),
      );
    } catch {
      dados[f.chave] = null;
    }
  }
  return dados;
}

const pick = (o, campos) => Object.fromEntries(campos.map((c) => [c, o[c]]));
const META = ['id', 'dir', 'meta', 'ind', 'un', 'alvo', 'acum', 'pct', 'sit'];
const VAC = ['v', 'metaPAS', 'd25', 'ago', 'set', 'abaixo'];
const CONC = ['q', 'eq', 'sig', 'nome', 'peso', 'o', 'b', 's', 'r', 'n'];
const FINAL = ['q', 'eq', 'comp', 'o', 'b', 's', 'r', 'n'];

// Catálogo: categorias → itens, cada um com um id estável e as linhas públicas que ele libera.
export function montarCatalogo(d) {
  const cats = [];
  const M = d.MUNICIPAL,
    F = d.FEDERAL;
  if (M) {
    const porDir = new Map();
    for (const m of M.metas || []) {
      const k = m.dir.split(' – ')[0];
      if (!porDir.has(k)) porDir.set(k, { nome: m.dir, itens: [] });
      porDir.get(k).itens.push({ id: 'municipal:meta:' + m.id, rotulo: m.id + ' · ' + m.meta, linhas: pick(m, META) });
    }
    for (const [k, g] of porDir)
      cats.push({
        id: 'municipal-' + k.toLowerCase().replace(/\W+/g, '-'),
        grupo: 'Municipal · metas do PAS',
        nome: g.nome,
        tipo: 'meta',
        itens: g.itens,
      });
    if (M.vacinas?.length)
      cats.push({
        id: 'municipal-vacinas',
        grupo: 'Municipal · vacinas',
        nome: 'Cobertura vacinal',
        tipo: 'vacina',
        itens: M.vacinas.map((v) => ({ id: 'municipal:vacina:' + v.v, rotulo: v.v, linhas: pick(v, VAC) })),
      });
  }
  if (F) {
    const porSig = new Map();
    for (const c of F.conceitos || []) {
      if (!porSig.has(c.sig)) porSig.set(c.sig, { rotulo: c.sig + ' · ' + c.nome, linhas: [] });
      porSig.get(c.sig).linhas.push(pick(c, CONC));
    }
    cats.push({
      id: 'federal-indicadores',
      grupo: 'Federal · Siaps',
      nome: 'Indicadores de qualidade (todos os quadrimestres)',
      tipo: 'conceito',
      itens: [...porSig].map(([sig, g]) => ({ id: 'federal:conceito:' + sig, rotulo: g.rotulo, linhas: g.linhas })),
    });
    const porComp = new Map();
    for (const f of F.final || []) {
      if (!porComp.has(f.comp)) porComp.set(f.comp, []);
      porComp.get(f.comp).push(pick(f, FINAL));
    }
    cats.push({
      id: 'federal-final',
      grupo: 'Federal · Siaps',
      nome: 'Classificação final',
      tipo: 'final',
      itens: [...porComp].map(([comp, linhas]) => ({ id: 'federal:final:' + comp, rotulo: comp, linhas })),
    });
  }
  // Dados que vêm do PEC e dos lançamentos e se atualizam sozinhos. Cada item liga ou desliga uma parte; nada aqui traz nomes de pessoas.
  cats.push({
    id: 'vivo-pec',
    grupo: 'Ao vivo · atualiza sozinho',
    nome: 'Cofinanciamento federal (PEC e-SUS)',
    tipo: 'vivo',
    itens: [{ id: 'vivo:federal', rotulo: 'Indicadores por unidade e equipe, do mês mais recente', linhas: [] }],
  });
  cats.push({
    id: 'vivo-estadual',
    grupo: 'Ao vivo · atualiza sozinho',
    nome: 'Cofinanciamento estadual (IGM SUS Paulista)',
    tipo: 'vivo',
    itens: [{ id: 'vivo:estadual', rotulo: 'Nota e pontos por indicador, do município', linhas: [] }],
  });
  cats.push({
    id: 'vivo-filas',
    grupo: 'Ao vivo · atualiza sozinho',
    nome: 'Filas e faltas por unidade, equipe e especialidade',
    tipo: 'vivo',
    itens: [
      { id: 'vivo:filas:Médico', rotulo: 'Médicos (sem nomes; só totais por equipe e especialidade)', linhas: [] },
      { id: 'vivo:filas:Enfermeiro', rotulo: 'Enfermeiros (sem nomes; só totais por equipe e especialidade)', linhas: [] },
      {
        id: 'vivo:filas:min3',
        rotulo: 'Proteção: ocultar linhas com menos de 3 profissionais (evita identificar uma pessoa pelo total)',
        linhas: [],
      },
    ],
  });
  return cats;
}

async function marcados(env) {
  const { results } = await env.DB.prepare('SELECT item, publicado_em AS em FROM publicacao_item').all();
  return new Map(results.map((r) => [r.item, r.em]));
}

// Admin: catálogo com a marca de cada item (sem as linhas, só o que a tela precisa).
export async function catalogoAdmin(env, url) {
  const cats = montarCatalogo(await carregar(env, url));
  const m = await marcados(env);
  return {
    categorias: cats.map((c) => ({
      id: c.id,
      grupo: c.grupo,
      nome: c.nome,
      itens: c.itens.map((i) => ({ id: i.id, rotulo: i.rotulo, publico: m.has(i.id), desde: m.get(i.id) || null })),
    })),
    obsoletos: [...m.keys()].filter((k) => !cats.some((c) => c.itens.some((i) => i.id === k))),
  };
}

// Admin: troca o conjunto público. Exige a confirmação explícita e grava o que mudou.
export async function salvarPublicacao(req, env, url, quem) {
  const c = await lerJson(req);
  if (c.confirmo !== true) throw new ErroHttp(400, 'Confirme a autorização para publicar.');
  if (!Array.isArray(c.itens)) throw new ErroHttp(400, 'Informe a lista de itens.');
  const validos = new Set(montarCatalogo(await carregar(env, url)).flatMap((x) => x.itens.map((i) => i.id)));
  const novos = [...new Set(c.itens)];
  const ruins = novos.filter((i) => !validos.has(i));
  if (ruins.length) throw new ErroHttp(400, 'Item fora do catálogo: ' + String(ruins[0]).slice(0, 80));
  const antes = await marcados(env);
  const entram = novos.filter((i) => !antes.has(i));
  const saem = [...antes.keys()].filter((i) => !novos.includes(i));
  const t = agora();
  const lote = [env.DB.prepare('DELETE FROM publicacao_item')];
  for (const i of novos)
    lote.push(
      env.DB.prepare('INSERT INTO publicacao_item (item, publicado_em, publicado_por) VALUES (?, ?, ?)').bind(
        i,
        antes.get(i) || t,
        quem ?? null,
      ),
    );
  lote.push(
    env.DB.prepare('INSERT INTO publicacao_historico (quando, usuario_id, acao, detalhe) VALUES (?, ?, ?, ?)').bind(
      t,
      quem ?? null,
      'publicacao',
      JSON.stringify({ entram, saem }),
    ),
  );
  await env.DB.batch(lote);
  await registrar(env, quem, 'publicacao_alterada', `+${entram.length} −${saem.length}`, req);
  return { publicos: novos.length, entram: entram.length, saem: saem.length };
}

export async function historico(env) {
  const { results } = await env.DB.prepare(
    'SELECT h.quando, u.login, h.detalhe FROM publicacao_historico h LEFT JOIN usuario u ON u.id = h.usuario_id ORDER BY h.id DESC LIMIT 30',
  ).all();
  return { historico: results.map((r) => ({ quando: r.quando, login: r.login, ...JSON.parse(r.detalhe || '{}') })) };
}

// Público (sem senha): só o que está marcado, só com os campos permitidos.
async function vivoFederal(env) {
  const comp = (await competencias(env)).competencias[0]?.competencia;
  if (!comp) return null;
  const ind = JSON.parse(await dadosVigentes(env, comp)).indicadores || [];
  const agg = new Map();
  for (const l of ind) {
    if (!l.codigo || (l.recorte === 'desfecho' && l.codigo !== 'C2' && l.codigo !== 'C3')) continue;
    const k = [l.codigo, l.unidade || '', l.equipe || ''].join('|');
    const g = agg.get(k) || { c: l.codigo, u: l.unidade || '', e: l.equipe || '', n: 0, d: 0, p: 0 };
    g.n += l.numerador || 0;
    g.d += l.denominador || 0;
    g.p += l.somaPontos || 0;
    agg.set(k, g);
  }
  return { competencia: comp, linhas: [...agg.values()] };
}

async function vivoEstadual(env) {
  const { vigentes } = await listarEstadual(env);
  return { lancamentos: vigentes.map((l) => pick(l, ['item', 'periodo', 'valor', 'anterior', 'mediana', 'quartil', 'quartilAnt'])) };
}

async function vivoFilas(env, categorias, minimo) {
  if (!categorias.length) return null;
  try {
    const comp = (await env.DB.prepare('SELECT MAX(competencia) AS c FROM fila_profissional').first())?.c;
    if (!comp) return null;
    const marcas = categorias.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT unidade AS u, equipe AS e, categoria AS cat, cbo, COUNT(*) AS prof, SUM(faltas) AS f, SUM(atendimentos) AS a,
        SUM(CASE WHEN agenda_lida_em IS NOT NULL THEN 1 ELSE 0 END) AS lidas, AVG(CASE WHEN agenda_lida_em IS NOT NULL AND sem_vaga = 0 THEN dias_vaga END) AS dias,
        SUM(CASE WHEN sem_vaga = 1 THEN 1 ELSE 0 END) AS semVaga
      FROM fila_profissional WHERE competencia = ? AND categoria IN (${marcas}) GROUP BY unidade, equipe, categoria, cbo HAVING COUNT(*) >= ${minimo} ORDER BY unidade, equipe, categoria, cbo`,
    )
      .bind(comp, ...categorias)
      .all();
    return { competencia: comp, linhas: results };
  } catch {
    return null;
  }
}

export async function dadosPublicos(env, url) {
  const m = await marcados(env);
  const cats = montarCatalogo(await carregar(env, url));
  const vivos = {};
  if (m.has('vivo:federal')) vivos.federal = await vivoFederal(env);
  if (m.has('vivo:estadual')) vivos.estadual = await vivoEstadual(env);
  const catsFilas = ['Médico', 'Enfermeiro'].filter((c) => m.has('vivo:filas:' + c));
  if (catsFilas.length) vivos.filas = await vivoFilas(env, catsFilas, m.has('vivo:filas:min3') ? 3 : 1);
  const saida = cats
    .filter((c) => c.tipo !== 'vivo')
    .map((c) => ({
      id: c.id,
      grupo: c.grupo,
      nome: c.nome,
      tipo: c.tipo,
      itens: c.itens.filter((i) => m.has(i.id)).map((i) => ({ id: i.id, rotulo: i.rotulo, linhas: i.linhas })),
    }))
    .filter((c) => c.itens.length);
  const r = json({ geradoEm: agora(), fonte: 'Painel APS de Cajamar (totais agregados)', categorias: saida, vivos });
  r.headers.set('cache-control', 'public, max-age=300');
  return r;
}
