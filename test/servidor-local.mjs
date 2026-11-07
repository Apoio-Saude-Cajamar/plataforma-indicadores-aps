// Servidor HTTP local com a API, as páginas e um banco em memória.
// Uso: node test/servidor-local.mjs PORTA [login senha]
//  - com login e senha, cria um administrador já com a senha definitiva (para testar as páginas).
// O cookie __Host- exige HTTPS; em http://localhost o Chrome aceita cookies "Secure".
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../api/index.js';
import { ambiente, CHAVES } from './d1-local.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'painel');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
const porta = Number(process.argv[2] || 8787);
const env = ambiente();

// Imitação do ASSETS: "/" → index.html, "/entrar" → entrar.html.
env.ASSETS = {
  async fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p.endsWith('/')) p += 'index.html';
    if (!path.extname(p)) p += '.html';
    const arq = path.join(RAIZ, path.normalize(p));
    if (!arq.startsWith(RAIZ)) return new Response('Não encontrado', { status: 404 });
    try { return new Response(await readFile(arq), { headers: { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' } }); }
    catch { return new Response('Não encontrado', { status: 404 }); }
  }
};

if (process.argv[3] && process.argv[4]) {
  await worker.fetch(new Request(`http://127.0.0.1:${porta}/api/v1/usuarios`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CHAVES.TOKEN_ADMIN },
    body: JSON.stringify({ login: process.argv[3], nome: 'Administrador local', perfil: 'admin', senha: process.argv[4] })
  }), env);
  await env.DB.prepare('UPDATE usuario SET trocar_senha = 0').run();
}

http.createServer(async (req, res) => {
  const partes = [];
  for await (const p of req) partes.push(p);
  const corpo = Buffer.concat(partes);
  const request = new Request(`http://localhost:${porta}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo,
    redirect: 'manual'
  });
  const resposta = await worker.fetch(request, env);
  const cab = {};
  resposta.headers.forEach((v, k) => { cab[k] = v; });
  res.writeHead(resposta.status, cab);
  res.end(Buffer.from(await resposta.arrayBuffer()));
}).listen(porta, '127.0.0.1', () => console.log('pronto'));
