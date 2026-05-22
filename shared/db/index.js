export async function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.bind(...params).all();
}

export async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.bind(...params).first();
}

export async function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.bind(...params).run();
}

export async function runBatch(db, statements) {
  return db.batch(statements);
}
