// Registro en Postgres de lo que hace «Google y descripciones».
import { pool } from '../db.js';

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seo_log (
      id SERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      product_id TEXT NOT NULL,
      product_title TEXT,
      origin TEXT,             -- webhook | repaso | manual
      category TEXT,           -- categoría puesta (o null si ya tenía)
      description BOOLEAN NOT NULL DEFAULT false,
      google_fields BOOLEAN NOT NULL DEFAULT false,
      barcodes INT NOT NULL DEFAULT 0,
      ai_calls INT NOT NULL DEFAULT 0,
      note TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS seo_log_at ON seo_log(at DESC);
  `);
}

export async function log(row) {
  await pool.query(
    `INSERT INTO seo_log(product_id, product_title, origin, category, description, google_fields, barcodes, ai_calls, note, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [row.productId, row.title, row.origin, row.category || null, !!row.description, !!row.googleFields, row.barcodes || 0, row.aiCalls || 0, row.note || null, row.error || null],
  );
}

export async function recent(limit = 200) {
  return (await pool.query('SELECT * FROM seo_log ORDER BY id DESC LIMIT $1', [limit])).rows;
}

export async function aiCallsToday() {
  const r = await pool.query(`SELECT COALESCE(SUM(ai_calls),0)::int AS n FROM seo_log WHERE at > now() - interval '24 hours'`);
  return r.rows[0].n;
}

export async function totals() {
  const r = await pool.query(`SELECT COUNT(*) FILTER (WHERE category IS NOT NULL)::int AS categories,
    COUNT(*) FILTER (WHERE description)::int AS descriptions, COUNT(*) FILTER (WHERE error IS NOT NULL AND at > now() - interval '24 hours')::int AS errors24
    FROM seo_log`);
  return r.rows[0];
}
