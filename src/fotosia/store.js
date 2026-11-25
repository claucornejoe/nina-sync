// Registro en Postgres de las fotos generadas con IA (una fila por producto).
import { pool } from '../db.js';

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fotos_ia (
      product_id TEXT PRIMARY KEY,
      title TEXT, ean TEXT, handle TEXT,
      before_url TEXT,
      source_url TEXT, source_page TEXT, source_query TEXT,
      result_url TEXT, filename TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | generando | lista | error | subida | descartada
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function upsert(r) {
  await pool.query(
    `INSERT INTO fotos_ia(product_id, title, ean, handle, before_url, status) VALUES ($1,$2,$3,$4,$5,'pendiente')
     ON CONFLICT (product_id) DO UPDATE SET title=EXCLUDED.title, ean=EXCLUDED.ean, handle=EXCLUDED.handle, before_url=EXCLUDED.before_url, status='pendiente', error=NULL, updated_at=now()`,
    [r.productId, r.title, r.ean, r.handle, r.beforeUrl],
  );
}

export async function set(productId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  await pool.query(`UPDATE fotos_ia SET ${sets}, updated_at=now() WHERE product_id=$1`, [productId, ...keys.map((k) => fields[k])]);
}

export const get = async (id) => (await pool.query('SELECT * FROM fotos_ia WHERE product_id=$1', [id])).rows[0] || null;
export const all = async () => (await pool.query(`SELECT * FROM fotos_ia WHERE status <> 'descartada' ORDER BY created_at DESC, title LIMIT 300`)).rows;
export const known = async () => new Set((await pool.query('SELECT product_id FROM fotos_ia')).rows.map((r) => r.product_id));
export const counts = async () =>
  Object.fromEntries((await pool.query('SELECT status, COUNT(*)::int AS n FROM fotos_ia GROUP BY status')).rows.map((r) => [r.status, r.n]));
