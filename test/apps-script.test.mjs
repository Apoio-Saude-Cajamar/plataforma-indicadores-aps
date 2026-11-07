// Executa o script do Google Drive (backup/backup-drive.gs) contra a API real rodando localmente,
// com imitações dos serviços do Apps Script. Testa backup, conferência, aviso e restauração.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CHAVES } from './d1-local.mjs';
import { semear } from './exemplos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const processos = [];
after(() => processos.forEach(p => p.kill()));

async function subirServidor(porta) {
  const p = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', path.join(RAIZ, 'test/servidor-local.mjs'), String(porta)],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  processos.push(p);
  await new Promise((ok, falha) => {
    p.stdout.on('data', d => { if (String(d).includes('pronto')) ok(); });
    p.on('exit', c => falha(new Error('servidor saiu com código ' + c)));
  });
  const base = `http://127.0.0.1:${porta}/api/v1`;
  return async function chamar(metodo, caminho, corpo, chave = CHAVES.TOKEN_COLETA) {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const d = await r.json();
    if (r.status >= 400) throw new Error(`${caminho}: ${r.status} ${JSON.stringify(d)}`);
    return d;
  };
}

class BlobFalso {
  constructor(bytes, tipo, nome) { this.bytes = Buffer.from(bytes); this.tipo = tipo; this.nome = nome; }
  getName() { return this.nome; }
  getBytes() { return [...this.bytes]; }
  getDataAsString() { return this.bytes.toString('utf8'); }
  setContentType(t) { this.tipo = t; return this; }
}

function appsScript(props) {
  const arquivos = new Map();
  const emails = [];
  const contexto = {
    console: { log() {}, error() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      deleteProperty: k => { delete props[k]; }
    }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dono@exemplo.com' }) },
    MailApp: { sendEmail: (para, assunto, corpo) => emails.push({ para, assunto, corpo }) },
    UrlFetchApp: {
      fetch(url, op) {
        // O Apps Script é síncrono; aqui a chamada HTTP vai por curl, contra o servidor em outro processo.
        const args = ['-sS', '-X', op.method.toUpperCase(), '-w', '\n%{http_code}', '-H', `Authorization: ${op.headers.Authorization}`];
        if (op.payload !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
        const saida = execFileSync('curl', [...args, url], { input: op.payload ?? '', maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
        const corte = saida.lastIndexOf('\n');
        const codigo = Number(saida.slice(corte + 1));
        const texto = saida.slice(0, corte);
        return { getResponseCode: () => codigo, getContentText: () => texto };
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      sleep() {},
      newBlob: (texto, tipo, nome) => new BlobFalso(Buffer.from(texto, 'utf8'), tipo, nome),
      gzip: (blob, nome) => new BlobFalso(gzipSync(blob.bytes), 'application/x-gzip', nome),
      ungzip: blob => new BlobFalso(gunzipSync(blob.bytes), 'application/octet-stream', blob.nome.replace(/\.gz$/, '')),
      computeDigest: (alg, texto) => [...createHash(alg).update(texto, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      formatDate(data, fuso, formato) {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(data).map(x => [x.type, x.value]));
        return formato.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
      }
    },
    DriveApp: {
      getFolderById: id => ({
        createFile(blob) {
          const fid = 'arq' + (arquivos.size + 1);
          const arq = { id: fid, pasta: id, blob, descricao: '', getId: () => fid, getName: () => blob.nome,
            setDescription(d) { this.descricao = d; }, getBlob: () => new BlobFalso(blob.bytes, blob.tipo, blob.nome) };
          arquivos.set(fid, arq);
          return arq;
        }
      }),
      getFileById: id => { if (!arquivos.has(id)) throw new Error('arquivo inexistente'); return arquivos.get(id); }
    }
  };
  vm.createContext(contexto);
  vm.runInContext(readFileSync(path.join(RAIZ, 'backup/backup-drive.gs'), 'utf8'), contexto);
  return { contexto, arquivos, emails };
}

test('backup mensal no Drive e restauração completa em outro banco', async () => {
  const origem = await subirServidor(18787);
  const destino = await subirServidor(18788);
  await semear(origem);

  const props = { API_URL: 'http://127.0.0.1:18787/', TOKEN_BACKUP: CHAVES.TOKEN_BACKUP, PASTA_ID: 'pasta-backup' };
  const gs = appsScript(props);
  const r = gs.contexto.fazerBackup();
  assert.equal(gs.arquivos.size, 1);
  const arq = gs.arquivos.get(r.id);
  assert.match(arq.getName(), /^\d{4}-\d{2}-\d{2}_\d{4}_indicadores-aps\.json\.gz$/);
  const conteudo = JSON.parse(gunzipSync(arq.blob.bytes).toString('utf8'));
  assert.equal(conteudo.formato, 'indicadores-aps-backup');
  assert.equal(conteudo.tabelas.etapa.length, 5);
  assert.match(arq.descricao, new RegExp(`sha256=${r.sha256}`));
  // a coleta de exemplo é de 2026-10; o aviso depende do mês corrente
  const esperadoAviso = gs.contexto.competenciaAnterior_() !== '2026-10';
  assert.equal(r.coletaPendente, esperadoAviso);
  assert.equal(gs.emails.length, esperadoAviso ? 1 : 0);

  // Restauração no banco vazio (outro servidor), a partir do arquivo salvo.
  Object.assign(props, { API_URL: 'http://127.0.0.1:18788', TOKEN_ADMIN: CHAVES.TOKEN_ADMIN,
    RESTAURAR_ARQUIVO_ID: r.id, RESTAURAR_CONFIRMO: 'APAGAR E RESTAURAR' });
  const res = gs.contexto.restaurarBackup();
  assert.equal(res.ok, true);
  assert.equal(props.TOKEN_ADMIN, undefined, 'a chave de administração é apagada ao final');
  assert.equal(props.RESTAURAR_CONFIRMO, undefined);
  assert.deepEqual(await destino('GET', '/dados?competencia=2026-10'), await origem('GET', '/dados?competencia=2026-10'));
});

test('sem confirmação, a restauração não apaga nada', async () => {
  const destino = await subirServidor(18789);
  await semear(destino);
  const props = { API_URL: 'http://127.0.0.1:18789', TOKEN_BACKUP: CHAVES.TOKEN_BACKUP, PASTA_ID: 'p', TOKEN_ADMIN: CHAVES.TOKEN_ADMIN,
    RESTAURAR_ARQUIVO_ID: 'arq1' };
  const gs = appsScript(props);
  assert.throws(() => gs.contexto.restaurarBackup(), /RESTAURAR_CONFIRMO/);
  const s = await destino('GET', '/situacao?competencia=2026-10');
  assert.equal(s.total, 5);
});

test('falha de acesso gera e-mail de aviso', async () => {
  await subirServidor(18790);
  const gs = appsScript({ API_URL: 'http://127.0.0.1:18790', TOKEN_BACKUP: 'chave-errada-chave-errada', PASTA_ID: 'p' });
  assert.throws(() => gs.contexto.fazerBackup(), /HTTP 401/);
  assert.equal(gs.emails.length, 1);
  assert.match(gs.emails[0].assunto, /Falha no backup/);
  assert.equal(gs.arquivos.size, 0);
});
