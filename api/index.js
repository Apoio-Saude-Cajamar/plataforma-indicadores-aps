// Painel APS · Plataforma de Indicadores da APS de Cajamar: API e páginas (Cloudflare Pages Functions; ver functions/_middleware.js).
//
// Rotas (todas sob /api/v1):
//   GET  /saude                                  público   – verificação de funcionamento
//   POST /coletas                                coleta    – abre uma coleta
//   PUT  /coletas/:id/etapa                      coleta    – grava (ou regrava) uma etapa
//   POST /coletas/:id/concluir                   coleta    – encerra a coleta
//   GET  /coletas?competencia=AAAA-MM            leitura   – lista coletas
//   GET  /coletas/:id/etapas                     leitura   – etapas de uma coleta
//   GET  /situacao?competencia=AAAA-MM           leitura   – etapas vigentes e pendentes da competência
//   GET  /dados?competencia=AAAA-MM              leitura   – indicadores e totais vigentes
//   GET  /competencias                           leitura   – competências com coleta
//   GET  /backup/manifesto                       backup    – contagens e versão
//   GET  /backup/tabela/:nome?depois=&limite=    backup    – uma página de uma tabela
//   POST /restauracao/iniciar                    admin     – apaga tudo (exige confirmação)
//   POST /restauracao/tabela/:nome               admin     – insere uma parte
//   POST /restauracao/concluir                   admin     – confere contagens
//   POST /auth/entrar | /auth/sair               público   – login por usuário e senha (cookie)
//   GET  /auth/eu  ·  POST /auth/senha           sessão    – quem está logado; troca de senha
//   GET  /auth/config                            público   – se a entrada pelo Apoio está ligada
//   GET|POST /usuarios · PATCH /usuarios/:id     admin     – administração de usuários
// "leitura" aceita a chave da extensão ou a sessão de um usuário logado.
import { VERSAO_API } from './esquema.js';
import { ErroHttp, json, jsonTexto, lerJson, exigir, competencia } from './util.js';
import {
  entrar,
  sair,
  eu,
  trocarSenha,
  listarUsuarios,
  criarUsuario,
  alterarUsuario,
  exigirSessao,
  registrar,
  sessaoDoPedido,
  configApoio,
  retornoApoio,
} from './auth.js';
import { criarColeta, gravarEtapa, concluirColeta, listarColetas, etapasDaColeta } from './coletas.js';
import { situacao, dadosVigentes, competencias } from './consultas.js';
import { gravarComposicao, lerComposicao } from './composicao.js';
import { populacaoMunicipio } from './populacao.js';
import { monitoramento } from './monitoramento.js';
import { pendencias } from './pendencias.js';
import { gravarFilas, gravarFilasHorario, lerFilas, lerFilasEvolucao } from './filas.js';
import { gravarProducao, lerProducao } from './producao.js';
import { listarLancamentos, criarLancamento } from './lancamentos.js';
import { listarEstadual, criarEstadual, gravarVacinasPec, lerVacinasPec } from './estadual.js';
import { meusRegistros, registros, estadoBackup } from './registros.js';
import { listarChaves, criarChave, revogarChave, excluirChave, excluirChavesInativas, chaveGeradaValida } from './chaves.js';
import { catalogoAdmin, salvarPublicacao, historico as historicoPublicacao, dadosPublicos } from './publicacao.js';
import { comunicadosAtivos, marcarLido, listarComunicados, criarComunicado, alterarComunicado } from './comunicados.js';
import { manifesto, paginaTabela, iniciarRestauracao, restaurarParte, concluirRestauracao } from './backup.js';

const ROTAS = [
  ['GET', /^\/saude$/, null, async () => json({ ok: true, servico: 'painelaps', versao: VERSAO_API })],

  ['POST', /^\/auth\/entrar$/, null, async (req, env) => entrar(req, env)],
  ['POST', /^\/auth\/sair$/, null, async (req, env) => sair(req, env)],
  ['GET', /^\/auth\/eu$/, null, async (req, env) => eu(req, env)],
  ['POST', /^\/auth\/senha$/, null, async (req, env) => trocarSenha(req, env)],
  ['GET', /^\/auth\/config$/, null, async (req, env) => json({ apoio: configApoio(env) })],
  ['GET', /^\/usuarios$/, 'usuarios', async (req, env) => json(await listarUsuarios(env))],
  ['POST', /^\/usuarios$/, 'usuarios', async (req, env, m, url, quem) => json(await criarUsuario(req, env, quem), 201)],
  ['PATCH', /^\/usuarios\/(\d+)$/, 'usuarios', async (req, env, m, url, quem) => json(await alterarUsuario(req, env, Number(m[1]), quem))],

  ['POST', /^\/coletas$/, 'coleta', async (req, env) => json(await criarColeta(env, await lerJson(req)), 201)],
  ['PUT', /^\/coletas\/([\w.:-]+)\/etapa$/, 'coleta', async (req, env, m) => json(await gravarEtapa(env, m[1], await lerJson(req)))],
  ['POST', /^\/coletas\/([\w.:-]+)\/concluir$/, 'coleta', async (req, env, m) => json(await concluirColeta(env, m[1], await lerJson(req)))],
  ['GET', /^\/coletas$/, 'leitura', async (req, env, m, url) => json(await listarColetas(env, url.searchParams.get('competencia')))],
  ['GET', /^\/coletas\/([\w.:-]+)\/etapas$/, 'leitura', async (req, env, m) => json(await etapasDaColeta(env, m[1]))],

  ['GET', /^\/situacao$/, 'leitura', async (req, env, m, url) => json(await situacao(env, url.searchParams.get('competencia')))],
  ['GET', /^\/dados$/, 'leitura', async (req, env, m, url) => jsonTexto(await dadosVigentes(env, url.searchParams.get('competencia')))],
  ['GET', /^\/competencias$/, 'leitura', async (req, env) => json(await competencias(env))],

  ['PUT', /^\/composicao$/, 'coleta', async (req, env) => json(await gravarComposicao(env, await lerJson(req)))],
  ['GET', /^\/composicao$/, 'leitura', async (req, env, m, url) => json(await lerComposicao(env, url.searchParams.get('competencia')))],

  ['GET', /^\/chaves$/, 'usuarios', async (req, env) => json(await listarChaves(env))],
  ['POST', /^\/chaves$/, 'usuarios', async (req, env, m, url, quem) => json(await criarChave(req, env, quem), 201)],
  ['DELETE', /^\/chaves\/inativas$/, 'usuarios', async (req, env, m, url, quem) => json(await excluirChavesInativas(req, env, quem))],
  [
    'DELETE',
    /^\/chaves\/(\d+)\/excluir$/,
    'usuarios',
    async (req, env, m, url, quem) => json(await excluirChave(req, env, Number(m[1]), quem)),
  ],
  ['DELETE', /^\/chaves\/(\d+)$/, 'usuarios', async (req, env, m, url, quem) => json(await revogarChave(req, env, Number(m[1]), quem))],
  ['PUT', /^\/producao$/, 'coleta', async (req, env) => json(await gravarProducao(env, await lerJson(req)))],
  ['GET', /^\/producao$/, 'lancar', async (req, env, m, url) => json(await lerProducao(env, url))],
  ['PUT', /^\/filas$/, 'coleta', async (req, env) => json(await gravarFilas(env, await lerJson(req)))],
  ['PUT', /^\/filas\/horarios$/, 'coleta', async (req, env) => json(await gravarFilasHorario(env, await lerJson(req)))],
  // Traz nomes de profissionais: só administrador e gestor.
  ['GET', /^\/filas$/, 'lancar', async (req, env, m, url) => json(await lerFilas(env, url))],
  ['GET', /^\/filas\/evolucao$/, 'lancar', async (req, env, m, url) => json(await lerFilasEvolucao(env, url))],
  ['GET', /^\/lancamentos$/, 'leitura', async (req, env, m, url) => json(await listarLancamentos(env, url))],
  // Emissão de relatório (PDF/CSV) pelo navegador: fica no histórico de quem emitiu. Não guarda o conteúdo do relatório.
  [
    'POST',
    /^\/relatorios\/emissao$/,
    'leitura',
    async (req, env, m, url, quem) => {
      const c = await lerJson(req);
      const TIPOS = [
        'geral',
        'federal',
        'estadual',
        'municipal',
        'absenteismo',
        'completo',
        'regua',
        'equipes',
        'unidades',
        'agrupado',
        'lote',
        'producao',
      ];
      if (!TIPOS.includes(c.tipo)) throw new ErroHttp(400, 'Tipo de relatório inválido.');
      const comp = competencia(c.competencia);
      const formato = c.formato === 'csv' ? 'csv' : 'pdf';
      await registrar(
        env,
        quem && typeof quem === 'object' ? quem.id : quem,
        'relatorio.emitido',
        `${c.tipo} · ${comp} · ${formato}${c.unidade ? ' · ' + String(c.unidade).slice(0, 80) : ''}`,
        req,
      );
      return json({ ok: true });
    },
  ],
  ['GET', /^\/meus-registros$/, 'leitura', async (req, env, m, url, quem) => json(await meusRegistros(env, quem))],
  ['GET', /^\/registros$/, 'usuarios', async (req, env) => json(await registros(env))],
  ['GET', /^\/backups\/estado$/, 'usuarios', async (req, env) => json(await estadoBackup(env))],
  ['PUT', /^\/vacinas-pec$/, 'coleta', async (req, env) => json(await gravarVacinasPec(env, await lerJson(req)))],
  ['GET', /^\/vacinas-pec$/, 'leitura', async (req, env) => json(await lerVacinasPec(env))],
  ['GET', /^\/estadual\/lancamentos$/, 'leitura', async (req, env) => json(await listarEstadual(env))],
  ['POST', /^\/estadual\/lancamentos$/, 'lancar', async (req, env, m, url, quem) => json(await criarEstadual(req, env, quem), 201)],
  ['POST', /^\/lancamentos$/, 'lancar', async (req, env, m, url, quem) => json(await criarLancamento(req, env, quem), 201)],
  ['GET', /^\/publico\/dados$/, null, async (req, env, m, url) => dadosPublicos(env, url)],
  ['GET', /^\/publicacao$/, 'usuarios', async (req, env, m, url) => json(await catalogoAdmin(env, url))],
  ['PUT', /^\/publicacao$/, 'usuarios', async (req, env, m, url, quem) => json(await salvarPublicacao(req, env, url, quem))],
  ['GET', /^\/publicacao\/historico$/, 'usuarios', async (req, env) => json(await historicoPublicacao(env))],
  ['GET', /^\/comunicados\/ativos$/, null, async (req, env) => json(await comunicadosAtivos(req, env))],
  ['POST', /^\/comunicados\/(\d+)\/lido$/, null, async (req, env, m) => json(await marcarLido(req, env, Number(m[1])))],
  ['GET', /^\/comunicados$/, 'usuarios', async (req, env) => json(await listarComunicados(env))],
  ['POST', /^\/comunicados$/, 'usuarios', async (req, env, m, url, quem) => json(await criarComunicado(req, env, quem), 201)],
  [
    'PATCH',
    /^\/comunicados\/(\d+)$/,
    'usuarios',
    async (req, env, m, url, quem) => json(await alterarComunicado(req, env, Number(m[1]), quem)),
  ],
  ['GET', /^\/pendencias$/, 'leitura', async (req, env, m, url) => json(await pendencias(env, url.searchParams.get('competencia')))],
  ['GET', /^\/monitoramento$/, 'usuarios', async (req, env) => json(await monitoramento(env))],
  ['GET', /^\/populacao$/, 'leitura', async (req, env) => json(await populacaoMunicipio(env))],

  ['GET', /^\/backup\/manifesto$/, 'backup', async (req, env) => json(await manifesto(env))],
  [
    'GET',
    /^\/backup\/tabela\/(\w+)$/,
    'backup',
    async (req, env, m, url) => jsonTexto(await paginaTabela(env, m[1], url.searchParams.get('depois'), url.searchParams.get('limite'))),
  ],

  ['POST', /^\/restauracao\/iniciar$/, 'admin', async (req, env) => json(await iniciarRestauracao(env, await lerJson(req)))],
  ['POST', /^\/restauracao\/tabela\/(\w+)$/, 'admin', async (req, env, m) => json(await restaurarParte(env, m[1], await lerJson(req)))],
  ['POST', /^\/restauracao\/concluir$/, 'admin', async (req, env) => json(await concluirRestauracao(env, await lerJson(req)))],
];

// Chave (cabeçalho Authorization) para a extensão, o backup e a administração por linha de comando;
// sessão (cookie) para quem usa as páginas. Devolve o id do usuário logado, quando houver.
async function autorizar(request, env, papel) {
  const temChave = (request.headers.get('authorization') || '').startsWith('Bearer ');
  if (papel === 'usuarios') {
    if (temChave) {
      exigir(request, env, 'admin');
      return null;
    }
    return (await exigirSessao(request, env, ['admin'])).usuario.id;
  }
  if (papel === 'lancar') return (await exigirSessao(request, env, ['admin', 'gestor'])).usuario.id;
  if (papel === 'leitura' && !temChave) return (await exigirSessao(request, env)).usuario.id;
  try {
    exigir(request, env, papel);
  } catch (e) {
    if (papel === 'coleta' && e instanceof ErroHttp && e.status === 401 && (await chaveGeradaValida(request, env))) return null;
    throw e;
  }
  return null;
}

async function tratarApi(request, env, url) {
  const caminho = url.pathname.replace(/^\/api\/v1/, '') || '/';
  let metodoErrado = false;
  for (const [metodo, padrao, papel, acao] of ROTAS) {
    const m = caminho.match(padrao);
    if (!m) continue;
    if (metodo !== request.method) {
      metodoErrado = true;
      continue;
    }
    const quem = papel ? await autorizar(request, env, papel) : null;
    return acao(request, env, m, url, quem);
  }
  if (metodoErrado) throw new ErroHttp(405, 'Método não permitido nesta rota.');
  throw new ErroHttp(404, 'Rota não encontrada.');
}

// Páginas: só /entrar e os arquivos visuais são públicos; o resto exige login.
const PUBLICAS = [
  /^\/entrar(\.html)?$/,
  /^\/css\//,
  /^\/img\//,
  /^\/js\/publico\//,
  /^\/js\/(estadual-regras|catalogo-indicadores)\.js$/,
  /^\/publico(\.html)?$/,
  /^\/favicon\.(ico|svg)$/,
  /^\/robots\.txt$/,
  // App instalável: manifesto, service worker e aviso de sem conexão (nenhum dado).
  /^\/manifest\.webmanifest$/,
  /^\/sw\.js$/,
  /^\/offline(\.html)?$/,
];
const SO_ADMIN = [
  /^\/usuarios(\.html)?$/,
  /^\/monitoramento(\.html)?$/,
  /^\/comunicados(\.html)?$/,
  /^\/extensao(\.html)?$/,
  /^\/publicacao(\.html)?$/,
  /^\/chaves(\.html)?$/,
  /^\/historico(\.html)?$/,
  /^\/backups(\.html)?$/,
  /^\/downloads\//,
];
const SEGURANCA = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function comCabecalhos(resp, extra = {}) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries({ ...SEGURANCA, ...extra })) r.headers.set(k, v);
  return r;
}

async function paginas(request, env, url) {
  if (!env.ASSETS) return new Response('Não encontrado', { status: 404 });
  const caminho = url.pathname;
  if (PUBLICAS.some((r) => r.test(caminho))) {
    // Quem já está logado e abre /entrar vai direto para o painel.
    if (/^\/entrar/.test(caminho) && (await sessaoDoPedido(request, env))) return Response.redirect(new URL('/', url).toString(), 302);
    return comCabecalhos(await env.ASSETS.fetch(request));
  }
  const s = await sessaoDoPedido(request, env);
  if (!s) {
    const volta = caminho + url.search;
    return Response.redirect(
      new URL('/entrar' + (volta && volta !== '/' ? '?volta=' + encodeURIComponent(volta) : ''), url).toString(),
      302,
    );
  }
  if (s.usuario.trocarSenha && !/^\/trocar-senha(\.html)?$/.test(caminho) && !/^\/js\//.test(caminho)) {
    return Response.redirect(new URL('/trocar-senha', url).toString(), 302);
  }
  if (SO_ADMIN.some((r) => r.test(caminho)) && s.usuario.perfil !== 'admin') return Response.redirect(new URL('/', url).toString(), 302);
  // O dashboard (/notas) aparece dentro da aba "Dashboard" de /indicadores: só ele pode ser exibido em quadro, e só pelo próprio Painel.
  const emQuadro = /^\/notas(\.html)?$/.test(caminho) ? { 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'" } : {};
  return comCabecalhos(await env.ASSETS.fetch(request), { 'cache-control': 'private, no-store', ...emQuadro });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        if (!url.pathname.startsWith('/api/v1/')) throw new ErroHttp(404, 'Use /api/v1/.');
        return await tratarApi(request, env, url);
      } catch (e) {
        if (e instanceof ErroHttp) return json({ erro: e.message }, e.status);
        console.error('Erro inesperado', request.method, url.pathname, (e && e.stack) || e);
        return json({ erro: 'Erro interno. Tente novamente; se persistir, veja os registros do Worker.' }, 500);
      }
    }
    if (url.pathname === '/auth/apoio') {
      try {
        return await retornoApoio(request, env, url);
      } catch (e) {
        console.error('Apoio', (e && e.stack) || e);
        return Response.redirect(new URL('/entrar?erro=' + encodeURIComponent('Falha na entrada pelo Apoio.'), url).toString(), 302);
      }
    }
    return paginas(request, env, url);
  },
};
