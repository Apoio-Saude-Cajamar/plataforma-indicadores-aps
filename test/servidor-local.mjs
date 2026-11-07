// Servidor HTTP local com a API e um banco em memória. Uso: node test/servidor-local.mjs PORTA
import http from 'node:http';
import worker from '../api/index.js';
import { ambiente } from './d1-local.mjs';

const porta = Number(process.argv[2] || 8787);
const env = ambiente();

http.createServer(async (req, res) => {
  const partes = [];
  for await (const p of req) partes.push(p);
  const corpo = Buffer.concat(partes);
  const request = new Request(`http://127.0.0.1:${porta}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo
  });
  const resposta = await worker.fetch(request, env);
  res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}).listen(porta, '127.0.0.1', () => console.log('pronto'));
