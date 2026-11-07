// Painel APS no Cloudflare Pages: todo pedido (páginas e /api) passa por aqui.
// A lógica fica em api/index.js; as páginas estáticas vêm de env.ASSETS (pasta painel/).
import app from '../api/index.js';

export const onRequest = context => app.fetch(context.request, context.env);
