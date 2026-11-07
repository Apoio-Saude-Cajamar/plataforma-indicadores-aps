// Plataforma de Indicadores APS – Cajamar: API (Cloudflare Worker).
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
import { VERSAO_API } from './esquema.js';
import { ErroHttp, json, jsonTexto, lerJson, exigir } from './util.js';
import { criarColeta, gravarEtapa, concluirColeta, listarColetas, etapasDaColeta } from './coletas.js';
import { situacao, dadosVigentes, competencias } from './consultas.js';
import { manifesto, paginaTabela, iniciarRestauracao, restaurarParte, concluirRestauracao } from './backup.js';

const ROTAS = [
  ['GET', /^\/saude$/, null, async () => json({ ok: true, servico: 'indicadores-aps', versao: VERSAO_API })],

  ['POST', /^\/coletas$/, 'coleta', async (req, env) => json(await criarColeta(env, await lerJson(req)), 201)],
  ['PUT', /^\/coletas\/([\w.:-]+)\/etapa$/, 'coleta', async (req, env, m) => json(await gravarEtapa(env, m[1], await lerJson(req)))],
  ['POST', /^\/coletas\/([\w.:-]+)\/concluir$/, 'coleta', async (req, env, m) => json(await concluirColeta(env, m[1], await lerJson(req)))],
  ['GET', /^\/coletas$/, 'leitura', async (req, env, m, url) => json(await listarColetas(env, url.searchParams.get('competencia')))],
  ['GET', /^\/coletas\/([\w.:-]+)\/etapas$/, 'leitura', async (req, env, m) => json(await etapasDaColeta(env, m[1]))],

  ['GET', /^\/situacao$/, 'leitura', async (req, env, m, url) => json(await situacao(env, url.searchParams.get('competencia')))],
  ['GET', /^\/dados$/, 'leitura', async (req, env, m, url) => jsonTexto(await dadosVigentes(env, url.searchParams.get('competencia')))],
  ['GET', /^\/competencias$/, 'leitura', async (req, env) => json(await competencias(env))],

  ['GET', /^\/backup\/manifesto$/, 'backup', async (req, env) => json(await manifesto(env))],
  ['GET', /^\/backup\/tabela\/(\w+)$/, 'backup', async (req, env, m, url) =>
    jsonTexto(await paginaTabela(env, m[1], url.searchParams.get('depois'), url.searchParams.get('limite')))],

  ['POST', /^\/restauracao\/iniciar$/, 'admin', async (req, env) => json(await iniciarRestauracao(env, await lerJson(req)))],
  ['POST', /^\/restauracao\/tabela\/(\w+)$/, 'admin', async (req, env, m) => json(await restaurarParte(env, m[1], await lerJson(req)))],
  ['POST', /^\/restauracao\/concluir$/, 'admin', async (req, env) => json(await concluirRestauracao(env, await lerJson(req)))]
];

async function tratarApi(request, env, url) {
  const caminho = url.pathname.replace(/^\/api\/v1/, '') || '/';
  let metodoErrado = false;
  for (const [metodo, padrao, papel, acao] of ROTAS) {
    const m = caminho.match(padrao);
    if (!m) continue;
    if (metodo !== request.method) { metodoErrado = true; continue; }
    if (papel) exigir(request, env, papel);
    return acao(request, env, m, url);
  }
  if (metodoErrado) throw new ErroHttp(405, 'Método não permitido nesta rota.');
  throw new ErroHttp(404, 'Rota não encontrada.');
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
        console.error('Erro inesperado', request.method, url.pathname, e && e.stack || e);
        return json({ erro: 'Erro interno. Tente novamente; se persistir, veja os registros do Worker.' }, 500);
      }
    }
    // Demais caminhos: páginas do painel.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Não encontrado', { status: 404 });
  }
};
