// Pedidos de Shopify que van a BTS (Postgres).
import { pool } from '../db.js';

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bts_orders (
      order_id TEXT PRIMARY KEY,           -- gid://shopify/Order/…
      name TEXT,                           -- #1001
      created_at TIMESTAMPTZ,              -- fecha del pedido en Shopify
      seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      customer TEXT,
      total NUMERIC,
      status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | enviando | enviado | revisar | error | ignorado | en-camino
      bts_order_number TEXT,
      bts_total NUMERIC,
      bts_status TEXT,
      shipping_company TEXT,
      shipping_cost NUMERIC,
      tracking TEXT,
      fulfilled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      error TEXT,
      detail JSONB                          -- líneas y dirección que se enviaron / se van a enviar
    );
    ALTER TABLE bts_orders ADD COLUMN IF NOT EXISTS payment TEXT; -- wallet | banktransfer
    CREATE INDEX IF NOT EXISTS bts_orders_status ON bts_orders(status);
    CREATE TABLE IF NOT EXISTS bts_orders_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
}

/** Desde cuándo se miran pedidos: la primera vez que arranca esta función (no se envían pedidos viejos). */
export async function since(defaultIso) {
  await pool.query(`INSERT INTO bts_orders_meta(key, value) VALUES ('since', $1) ON CONFLICT DO NOTHING`, [defaultIso]);
  return (await pool.query(`SELECT value FROM bts_orders_meta WHERE key='since'`)).rows[0].value;
}

export async function upsertSeen(o) {
  await pool.query(
    `INSERT INTO bts_orders(order_id, name, created_at, customer, total, detail, status, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (order_id) DO UPDATE SET name=EXCLUDED.name, customer=EXCLUDED.customer, total=EXCLUDED.total,
       detail = CASE WHEN bts_orders.status IN ('pendiente','error') THEN EXCLUDED.detail ELSE bts_orders.detail END,
       error  = CASE WHEN bts_orders.status IN ('pendiente','error') THEN EXCLUDED.error ELSE bts_orders.error END,
       status = CASE WHEN bts_orders.status IN ('pendiente','error') THEN EXCLUDED.status ELSE bts_orders.status END`,
    [o.orderId, o.name, o.createdAt, o.customer, o.total, JSON.stringify(o.detail), o.status, o.error || null],
  );
}

export const get = async (id) => (await pool.query('SELECT * FROM bts_orders WHERE order_id=$1', [id])).rows[0];

export async function list(limit = 200) {
  return (await pool.query(`SELECT * FROM bts_orders ORDER BY created_at DESC NULLS LAST LIMIT $1`, [limit])).rows;
}

/** Pasa a «enviando» solo si estaba pendiente o con error: evita que dos clics envíen el pedido dos veces. */
export async function lockForSend(id) {
  const r = await pool.query(`UPDATE bts_orders SET status='enviando', error=NULL WHERE order_id=$1 AND status IN ('pendiente','error') RETURNING *`, [id]);
  return r.rows[0] || null;
}

export async function markSent(id, { number, total, status, company, shippingCost, detail, payment = null }) {
  await pool.query(
    `UPDATE bts_orders SET status='enviado', bts_order_number=$2, bts_total=$3, bts_status=$4, shipping_company=$5, shipping_cost=$6, sent_at=now(), error=NULL, detail=$7, payment=$8 WHERE order_id=$1`,
    [id, number, total, status, company, shippingCost, JSON.stringify(detail), payment],
  );
}

export const markError = (id, error, status = 'error') => pool.query(`UPDATE bts_orders SET status=$3, error=$2 WHERE order_id=$1`, [id, String(error).slice(0, 1000), status]);
export const setStatus = (id, status) => pool.query(`UPDATE bts_orders SET status=$2 WHERE order_id=$1`, [id, status]);

export async function awaitingTracking() {
  return (await pool.query(`SELECT * FROM bts_orders WHERE status='enviado' AND bts_order_number IS NOT NULL AND fulfilled_at IS NULL`)).rows;
}

export const markFulfilled = (id, tracking, company) =>
  pool.query(`UPDATE bts_orders SET tracking=$2, shipping_company=COALESCE($3, shipping_company), fulfilled_at=now(), status='en-camino' WHERE order_id=$1`, [id, tracking, company]);

export async function counts() {
  const r = await pool.query(`SELECT status, count(*)::int n FROM bts_orders GROUP BY status`);
  return Object.fromEntries(r.rows.map((x) => [x.status, x.n]));
}
