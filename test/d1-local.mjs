// Imitação mínima do D1 sobre o SQLite embutido no Node (node:sqlite), só para testes.
// Cobre prepare/bind/first/all/run/batch, com batch atômico como no D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function converter(v) {
  if (v === undefined) throw new Error('D1_TYPE_ERROR: Type \'undefined\' not supported');
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

class Instrucao {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Instrucao(this.db, this.sql, params.map(converter)); }
  _executar() {
    const linhas = this.db.prepare(this.sql).all(...this.params).map(r => ({ ...r }));
    const changes = this.db.prepare('SELECT changes() AS c').get().c;
    return { results: linhas, success: true, meta: { changes } };
  }
  async all() { return this._executar(); }
  async run() { return this._executar(); }
  async first(coluna) {
    const r = this.db.prepare(this.sql).get(...this.params);
    if (!r) return null;
    const o = { ...r };
    return coluna ? o[coluna] : o;
  }
}

export class D1Local {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    const dir = path.join(RAIZ, 'migrations');
    for (const f of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) this.db.exec(readFileSync(path.join(dir, f), 'utf8'));
  }
  prepare(sql) { return new Instrucao(this.db, sql); }
  async batch(instrucoes) {
    this.db.exec('BEGIN');
    try {
      const saida = instrucoes.map(i => i._executar());
      this.db.exec('COMMIT');
      return saida;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql) { this.db.exec(sql); return { count: 1 }; }
}

export const CHAVES = {
  TOKEN_COLETA: 'coleta-' + 'c'.repeat(40),
  TOKEN_BACKUP: 'backup-' + 'b'.repeat(40),
  TOKEN_ADMIN: 'admin-' + 'a'.repeat(40)
};

export function ambiente() {
  return { DB: new D1Local(), ...CHAVES };
}
