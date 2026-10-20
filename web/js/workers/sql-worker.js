/* Kodeskolen: runs SQL in SQLite (sql.js, compiled to WebAssembly) – a fresh database for every run. */
/* global initSqlJs */
let SQL = null;
async function boot() {
  if (SQL) return SQL;
  importScripts('/vendor/sqljs/sql-wasm.js');
  SQL = await initSqlJs({ locateFile: (f) => '/vendor/sqljs/' + f });
  return SQL;
}
const LIMIT = 200;
const pack = (res) => res.map(r => ({ columns: r.columns, values: r.values.slice(0, LIMIT), total: r.values.length }));
const totalChanges = (db) => db.exec('SELECT total_changes()')[0].values[0][0];
function exec(db, sql) {
  const before = totalChanges(db);
  const res = db.exec(sql);
  return { tables: pack(res), changed: totalChanges(db) - before };
}
self.onmessage = async (e) => {
  const { id, code, setup, test, reference } = e.data || {};
  try {
    const S = await boot();
    if (e.data?.warm) { self.postMessage({ id, ready: true }); return; }
    const db = new S.Database();
    if (setup) db.exec(setup);
    let out;
    try { out = exec(db, code || ''); }
    catch (err) { db.close(); self.postMessage({ id, ok: false, error: String(err.message || err), tables: [] }); return; }
    let after = null, ref = null;
    try { if (test) after = pack(db.exec(test)); } catch (err) { after = { error: String(err.message || err) }; }
    db.close();
    if (reference) {           // the solution, run on its own fresh copy, for comparison
      const rdb = new S.Database();
      if (setup) rdb.exec(setup);
      try { ref = pack(rdb.exec(reference)); if (test) ref = pack(rdb.exec(test)); } catch (err) { ref = { error: String(err.message || err) }; }
      rdb.close();
    }
    self.postMessage({ id, ok: true, tables: out.tables, changed: out.changed, after, ref });
  } catch (err) {
    self.postMessage({ id, ok: false, error: 'SQLite kunne ikke starte: ' + (err.message || err), tables: [] });
  }
};
