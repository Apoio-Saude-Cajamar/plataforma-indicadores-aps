// Utilidades comuns da API.

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

export function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: CABECALHOS });
}

// Para respostas já montadas como texto JSON pelo próprio banco (evita trabalho de CPU no Worker).
export function jsonTexto(texto, status = 200) {
  return new Response(texto, { status, headers: CABECALHOS });
}

export function agora() {
  return new Date().toISOString();
}

const LIMITE_CORPO = 8 * 1024 * 1024;

export async function lerJson(request) {
  const tamanho = Number(request.headers.get('content-length') || 0);
  if (tamanho > LIMITE_CORPO) throw new ErroHttp(413, 'Envio grande demais. Divida em partes menores.');
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    throw new ErroHttp(400, 'O corpo da requisição não é um JSON válido.');
  }
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroHttp(400, 'Esperava um objeto JSON.');
  return corpo;
}

// Comparação em tempo constante, para não vazar a chave pelo tempo de resposta.
function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

// Papéis e as chaves que os atendem. Uma chave vazia ou não configurada nunca autentica.
const PAPEIS = {
  coleta: ['TOKEN_COLETA', 'TOKEN_ADMIN'],
  leitura: ['TOKEN_COLETA', 'TOKEN_ADMIN'],
  backup: ['TOKEN_BACKUP', 'TOKEN_ADMIN'],
  admin: ['TOKEN_ADMIN']
};

export function exigir(request, env, papel) {
  const cab = request.headers.get('authorization') || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
  if (!token) throw new ErroHttp(401, 'Chave de acesso ausente.');
  const ok = PAPEIS[papel].some(nome => env[nome] && env[nome].length >= 16 && iguais(token, env[nome]));
  if (!ok) throw new ErroHttp(401, 'Chave de acesso inválida para esta operação.');
}

export function texto(v, max = 500) {
  if (v === undefined || v === null || v === '') return null;
  return String(v).slice(0, max);
}

export function inteiro(v, padrao = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : padrao;
}

export const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export function competencia(v) {
  if (typeof v !== 'string' || !RE_COMPETENCIA.test(v)) throw new ErroHttp(400, 'Competência inválida (use AAAA-MM).');
  return v;
}

export function dataIso(v, campo) {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new ErroHttp(400, `Data inválida em "${campo}".`);
  return new Date(v).toISOString();
}
