// Adaptateur D1 -> node:sqlite (SQLite en mémoire), pour les tests et le serveur de démo local.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (query, args = []) => ({
    bind: (...a) => stmt(query, a),
    all: async () => ({ results: sql.prepare(query).all(...args).map(r => ({ ...r })) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
  });
  return { prepare: q => stmt(q), batch: async list => { for (const s of list) await s.run(); return []; }, raw: sql };
}
