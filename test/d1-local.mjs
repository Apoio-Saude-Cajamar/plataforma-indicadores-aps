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

// Com D1_PLANOS=arquivo, anota as consultas que varrem uma tabela inteira (SCAN sem índice): é o que mais gasta
// "linhas lidas" no D1. O arquivo é gravado ao sair.
const PLANOS = process.env.D1_PLANOS ? new Map() : null;

function anotarPlano(db, sql) {
  if (!PLANOS || PLANOS.has(sql) || !/^\s*(WITH|SELECT)/i.test(sql)) return;
  try {
    const plano = db.prepare('EXPLAIN QUERY PLAN ' + sql).all().map((r) => r.detail);
    const grande = /\b(indicador_equipe|etapa|cubo_\w+|aviso|registro_acesso|producao_profissional|fila_\w+)\b/;
    const varre = plano.filter((d) => (/^SCAN (?!\(|CONSTANT|.*USING (COVERING )?INDEX)/.test(d) && !/^SCAN (ordenadas|v|i|x|t|subquery)/.test(d)) || (/^SCAN .*USING (COVERING )?INDEX/.test(d) && grande.test(d + sql)));
    PLANOS.set(sql, { varre, plano });
  } catch (_) {}
}
if (PLANOS) for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => process.exit(0));
if (PLANOS) process.on('exit', () => {
  const fs = process.getBuiltinModule('node:fs');
  fs.writeFileSync(process.env.D1_PLANOS, JSON.stringify([...PLANOS.entries()].filter(([, v]) => v.varre.length).map(([sql, v]) => ({ sql: sql.replace(/\s+/g, ' ').slice(0, 400), varre: v.varre })), null, 1));
});
export function planosAnotados() { return PLANOS ? [...PLANOS.entries()].filter(([, v]) => v.varre.length) : []; }

class Instrucao {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; anotarPlano(db, sql); }
  bind(...params) { return new Instrucao(this.db, this.sql, params.map(converter)); }
  _executar() {
    const linhas = this.db.prepare(this.sql).all(...this.params).map(r => ({ ...r }));
    const changes = this.db.prepare('SELECT changes() AS c').get().c;
    const last_row_id = this.db.prepare('SELECT last_insert_rowid() AS i').get().i;
    return { results: linhas, success: true, meta: { changes, last_row_id } };
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
