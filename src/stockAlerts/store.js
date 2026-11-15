// Solicitudes «Avísame cuando vuelva» guardadas en Postgres.
// Un solo aviso por solicitud: al enviarlo se borra el correo (queda la fila sin correo para las cifras).
import { pool } from '../db.js';

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id SERIAL PRIMARY KEY,
      email TEXT,                          -- NULL una vez enviado el aviso o caducado
      variant_id TEXT NOT NULL,            -- gid://shopify/ProductVariant/…
      product_id TEXT,
      product_title TEXT,
      variant_title TEXT,
      consent TEXT NOT NULL,               -- texto que aceptó la clienta
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | enviado | caducado | error
      sent_at TIMESTAMPTZ,
      error TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS stock_alerts_pending ON stock_alerts(email, variant_id) WHERE status = 'pendiente';
    CREATE INDEX IF NOT EXISTS stock_alerts_variant ON stock_alerts(variant_id) WHERE status = 'pendiente';
  `);
}

/** Guarda una solicitud. Si ya había una pendiente del mismo correo y tamaño, no duplica. */
export async function add({ email, variantId, productId, productTitle, variantTitle, consent }) {
  const r = await pool.query(
    `INSERT INTO stock_alerts (email, variant_id, product_id, product_title, variant_title, consent)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email, variant_id) WHERE status = 'pendiente' DO NOTHING RETURNING id`,
    [email, variantId, productId, productTitle, variantTitle, consent],
  );
  return r.rowCount > 0;
}

export async function pendingCount(email) {
  const r = await pool.query(`SELECT count(*)::int AS n FROM stock_alerts WHERE status='pendiente' AND email=$1`, [email]);
  return r.rows[0].n;
}

/** Solicitudes pendientes de estos tamaños. */
export async function pendingFor(variantIds) {
  if (!variantIds.length) return [];
  const r = await pool.query(`SELECT * FROM stock_alerts WHERE status='pendiente' AND variant_id = ANY($1) ORDER BY id`, [variantIds]);
  return r.rows;
}

export async function pendingVariantIds() {
  const r = await pool.query(`SELECT DISTINCT variant_id FROM stock_alerts WHERE status='pendiente'`);
  return r.rows.map((x) => x.variant_id);
}

export async function markSent(id) {
  await pool.query(`UPDATE stock_alerts SET status='enviado', sent_at=now(), email=NULL, error=NULL WHERE id=$1`, [id]);
}

/** Primer fallo: se reintenta en la próxima revisión. Segundo fallo: se da por perdido y se borra el correo. */
export async function markError(id, error) {
  await pool.query(
    `UPDATE stock_alerts SET
       status = CASE WHEN error IS NULL THEN status ELSE 'error' END,
       email  = CASE WHEN error IS NULL THEN email ELSE NULL END,
       error = $2
     WHERE id=$1`,
    [id, String(error).slice(0, 300)],
  );
}

/** Borra el correo de las solicitudes de un tamaño que ya no existe en la tienda. */
export async function expireVariant(variantId) {
  await pool.query(`UPDATE stock_alerts SET status='caducado', email=NULL WHERE status='pendiente' AND variant_id=$1`, [variantId]);
}

/** Solicitudes sin respuesta después de `days` días: se borra el correo (minimización de datos). */
export async function expireOld(days) {
  const r = await pool.query(`UPDATE stock_alerts SET status='caducado', email=NULL WHERE status='pendiente' AND created_at < now() - ($1 || ' days')::interval`, [String(days)]);
  return r.rowCount;
}

/** La clienta pide que se borre su correo (enlace de la política o petición por correo). */
export async function forgetEmail(email) {
  const r = await pool.query(`UPDATE stock_alerts SET status='caducado', email=NULL WHERE status='pendiente' AND email=$1`, [email]);
  return r.rowCount;
}

export async function stats() {
  const r = await pool.query(`SELECT
    count(*) FILTER (WHERE status='pendiente')::int AS pendientes,
    count(*) FILTER (WHERE status='enviado')::int AS enviados,
    count(*) FILTER (WHERE status='enviado' AND sent_at > now() - interval '30 days')::int AS enviados30,
    count(*) FILTER (WHERE status='caducado')::int AS caducados
    FROM stock_alerts`);
  return r.rows[0];
}

/** Pendientes agrupadas por tamaño, las más pedidas primero. */
export async function pendingByVariant(limit = 200) {
  const r = await pool.query(
    `SELECT variant_id, max(product_title) AS product_title, max(variant_title) AS variant_title, count(*)::int AS n, min(created_at) AS desde,
       max(error) AS error
     FROM stock_alerts WHERE status='pendiente' GROUP BY variant_id ORDER BY n DESC, desde LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function recentSent(limit = 50) {
  const r = await pool.query(`SELECT product_title, variant_title, created_at, sent_at FROM stock_alerts WHERE status='enviado' ORDER BY sent_at DESC LIMIT $1`, [limit]);
  return r.rows;
}
