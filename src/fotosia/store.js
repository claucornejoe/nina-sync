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
      status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | generando | lista | dudosa | error | subida | descartada
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE fotos_ia ADD COLUMN IF NOT EXISTS model TEXT;
    ALTER TABLE fotos_ia ADD COLUMN IF NOT EXISTS doubt TEXT;
    ALTER TABLE fotos_ia ADD COLUMN IF NOT EXISTS vendor TEXT;
  `);
}

export async function upsert(r) {
  await pool.query(
    `INSERT INTO fotos_ia(product_id, title, ean, handle, before_url, vendor, status) VALUES ($1,$2,$3,$4,$5,$6,'pendiente')
     ON CONFLICT (product_id) DO UPDATE SET title=EXCLUDED.title, ean=EXCLUDED.ean, handle=EXCLUDED.handle, before_url=EXCLUDED.before_url,
       vendor=EXCLUDED.vendor, status='pendiente', error=NULL, doubt=NULL, updated_at=now()`,
    [r.productId, r.title, r.ean, r.handle, r.beforeUrl, r.vendor || null],
  );
}

export async function set(productId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  await pool.query(`UPDATE fotos_ia SET ${sets}, updated_at=now() WHERE product_id=$1`, [productId, ...keys.map((k) => fields[k])]);
}

export const get = async (id) => (await pool.query('SELECT * FROM fotos_ia WHERE product_id=$1', [id])).rows[0] || null;
/** Para la página: lo que hay que revisar primero, y como mucho 300 filas. */
export const all = async (ver = '') => {
  const where = ver ? 'status = $1' : `status <> 'descartada'`;
  const order = `CASE status WHEN 'lista' THEN 0 WHEN 'dudosa' THEN 1 WHEN 'error' THEN 2 WHEN 'generando' THEN 3 ELSE 4 END, updated_at DESC`;
  return (await pool.query(`SELECT * FROM fotos_ia WHERE ${where} ORDER BY ${order} LIMIT 300`, ver ? [ver] : [])).rows;
};
export const byStatus = async (status) => (await pool.query('SELECT * FROM fotos_ia WHERE status=$1 ORDER BY vendor, title', [status])).rows;
/** Productos ya tratados (los que dieron error se pueden volver a intentar en la tanda de «todos»). */
export const known = async () => new Set((await pool.query(`SELECT product_id FROM fotos_ia WHERE status <> 'error'`)).rows.map((r) => r.product_id));
export const counts = async () =>
  Object.fromEntries((await pool.query('SELECT status, COUNT(*)::int AS n FROM fotos_ia GROUP BY status')).rows.map((r) => [r.status, r.n]));
export const byModel = async () =>
  Object.fromEntries((await pool.query(`SELECT model, COUNT(*)::int AS n FROM fotos_ia WHERE model IS NOT NULL GROUP BY model`)).rows.map((r) => [r.model, r.n]));
