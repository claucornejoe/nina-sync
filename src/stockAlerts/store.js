// Solicitudes «Avísame cuando vuelva» guardadas en Postgres.
// Un solo aviso por solicitud: al enviarlo se borra el correo (queda la fila sin correo para las cifras).
import crypto from 'node:crypto';
import { pool } from '../db.js';

/** Huella del correo (no reversible) para saber si la avisada compró, sin guardar su dirección. */
export const emailHash = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

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
    -- Datos para el informe (se guardan al pedir el aviso)
    ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS vendor TEXT;
    ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS ean TEXT;
    ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS price NUMERIC;
    -- Huella del correo durante 30 días tras el aviso, solo para ver si compró
    ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS email_hash TEXT;
    ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ;
    ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS purchase_amount NUMERIC;
  `);
}

/** Guarda una solicitud. Si ya había una pendiente del mismo correo y tamaño, no duplica. */
export async function add({ email, variantId, productId, productTitle, variantTitle, consent, vendor = null, category = null, ean = null, price = null }) {
  const r = await pool.query(
    `INSERT INTO stock_alerts (email, variant_id, product_id, product_title, variant_title, consent, vendor, category, ean, price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (email, variant_id) WHERE status = 'pendiente' DO NOTHING RETURNING id`,
    [email, variantId, productId, productTitle, variantTitle, consent, vendor, category, ean, price],
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
  // Se borra el correo; queda solo su huella 30 días para medir si la avisada compró.
  await pool.query(`UPDATE stock_alerts SET status='enviado', sent_at=now(), email_hash=encode(sha256(convert_to(lower(trim(email)),'UTF8')),'hex'), email=NULL, error=NULL WHERE id=$1`, [id]);
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
  await pool.query(`UPDATE stock_alerts SET email_hash=NULL WHERE email_hash IS NOT NULL AND sent_at < now() - interval '30 days'`);
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
  const r = await pool.query(`SELECT product_title, variant_title, created_at, sent_at, purchased_at, purchase_amount FROM stock_alerts WHERE status='enviado' ORDER BY sent_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

// ---------- Informe ----------

/** Rellena marca, categoría, EAN y precio de solicitudes antiguas que no los tienen. */
export async function fillDetails(variantId, d) {
  await pool.query(
    `UPDATE stock_alerts SET vendor=COALESCE(vendor,$2), category=COALESCE(category,$3), ean=COALESCE(ean,$4), price=COALESCE(price,$5),
       product_title=COALESCE(product_title,$6) WHERE variant_id=$1 AND (vendor IS NULL OR category IS NULL OR ean IS NULL OR price IS NULL)`,
    [variantId, d.vendor, d.category, d.ean, d.price, d.productTitle],
  );
}

export async function needingDetails(limit = 300) {
  const r = await pool.query(`SELECT DISTINCT variant_id FROM stock_alerts WHERE vendor IS NULL OR category IS NULL OR ean IS NULL OR price IS NULL LIMIT $1`, [limit]);
  return r.rows.map((x) => x.variant_id);
}

/** Pendientes por tamaño, con lo que hace falta para decidir. */
export async function reportByVariant(limit = 300) {
  const r = await pool.query(
    `SELECT variant_id, max(product_id) AS product_id, max(product_title) AS product_title, max(variant_title) AS variant_title,
       max(vendor) AS vendor, max(category) AS category, max(ean) AS ean, max(price) AS price,
       count(*)::int AS n, min(created_at) AS desde, max(created_at) AS ultima,
       count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS n7, max(error) AS error
     FROM stock_alerts WHERE status='pendiente' GROUP BY variant_id ORDER BY n DESC, desde LIMIT $1`,
    [limit],
  );
  return r.rows;
}

/** Totales pendientes agrupados por una columna (vendor o category). */
export async function reportGroup(col) {
  if (!['vendor', 'category'].includes(col)) throw new Error('columna no válida');
  const r = await pool.query(
    `SELECT COALESCE(${col}, 'Sin dato') AS name, count(*)::int AS n, count(DISTINCT variant_id)::int AS sizes,
       COALESCE(sum(price),0)::float AS value
     FROM stock_alerts WHERE status='pendiente' GROUP BY 1 ORDER BY n DESC LIMIT 15`,
  );
  return r.rows;
}

/** Solicitudes nuevas por semana (últimas 8). */
export async function weekly() {
  const r = await pool.query(
    `SELECT to_char(w, 'YYYY-MM-DD') AS week, COALESCE(n,0)::int AS n FROM
       generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w
       LEFT JOIN (SELECT date_trunc('week', created_at) AS wk, count(*) AS n FROM stock_alerts GROUP BY 1) x ON x.wk = w
     ORDER BY w`,
  );
  return r.rows;
}

/** Resultado de los avisos enviados: cuántos compraron, cuánto, y tiempo de espera. */
export async function outcomes() {
  const r = await pool.query(`SELECT
      count(*) FILTER (WHERE status='enviado')::int AS enviados,
      count(*) FILTER (WHERE status='enviado' AND purchased_at IS NOT NULL)::int AS compraron,
      COALESCE(sum(purchase_amount) FILTER (WHERE purchased_at IS NOT NULL),0)::float AS ventas,
      COALESCE(avg(EXTRACT(EPOCH FROM (sent_at - created_at))/86400) FILTER (WHERE status='enviado'),0)::float AS espera_media,
      count(*) FILTER (WHERE status='enviado' AND sent_at > now() - interval '14 days' AND purchased_at IS NULL)::int AS recientes
    FROM stock_alerts`);
  return r.rows[0];
}

/** Avisos enviados en los últimos 15 días con huella y sin compra: los que hay que cruzar con pedidos. */
export async function toMatch() {
  const r = await pool.query(
    `SELECT id, variant_id, email_hash, sent_at FROM stock_alerts
     WHERE status='enviado' AND email_hash IS NOT NULL AND purchased_at IS NULL AND sent_at > now() - interval '15 days'`,
  );
  return r.rows;
}

export async function markPurchased(id, at, amount) {
  await pool.query(`UPDATE stock_alerts SET purchased_at=$2, purchase_amount=$3 WHERE id=$1 AND purchased_at IS NULL`, [id, at, amount]);
}

/** Todas las pendientes para el CSV (sin correos). */
export async function csvRows() {
  const r = await pool.query(
    `SELECT product_title, variant_title, vendor, category, ean, price, count(*)::int AS n, min(created_at) AS desde
     FROM stock_alerts WHERE status='pendiente' GROUP BY product_title, variant_title, vendor, category, ean, price ORDER BY n DESC`,
  );
  return r.rows;
}
