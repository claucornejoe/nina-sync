// Registro en Postgres de NinaCash: pedidos, clientas, movimientos y cupones.
import { pool } from '../db.js';

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nc_orders (
      order_id TEXT PRIMARY KEY,
      name TEXT,
      customer_id TEXT NOT NULL,
      paid_at TIMESTAMPTZ NOT NULL,
      amount NUMERIC NOT NULL DEFAULT 0,     -- productos tras descuentos y devoluciones (sube el nivel)
      eligible NUMERIC NOT NULL DEFAULT 0,   -- amount menos lo pagado con NinaCash
      level_at INT NOT NULL,                 -- nivel de la clienta al comprar
      rate NUMERIC NOT NULL,                 -- % de NinaCash de ese nivel
      earned NUMERIC NOT NULL DEFAULT 0,     -- NinaCash que genera
      credited NUMERIC NOT NULL DEFAULT 0,   -- NinaCash ya sumado en Shopify
      status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | sumado | anulado
      release_at TIMESTAMPTZ,
      gift BOOLEAN NOT NULL DEFAULT false,   -- lleva el obsequio Butterfly del mes
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS nc_orders_customer ON nc_orders(customer_id);
    CREATE TABLE IF NOT EXISTS nc_customers (
      customer_id TEXT PRIMARY KEY,
      name TEXT,
      level INT NOT NULL DEFAULT 1,
      spent_12m NUMERIC NOT NULL DEFAULT 0,
      balance NUMERIC NOT NULL DEFAULT 0,
      pending NUMERIC NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS nc_log (
      id SERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      customer_id TEXT, order_name TEXT,
      kind TEXT NOT NULL,      -- pendiente | sumado | restado | nivel | envio-glam | obsequio | cupon | error
      amount NUMERIC,
      note TEXT,
      dry_run BOOLEAN NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS nc_log_at ON nc_log(at DESC);
    CREATE TABLE IF NOT EXISTS nc_monthly (
      customer_id TEXT NOT NULL,
      month TEXT NOT NULL,
      kind TEXT NOT NULL,      -- envio-glam | obsequio
      code TEXT, order_name TEXT,
      ends_at TIMESTAMPTZ,
      PRIMARY KEY (customer_id, month, kind)
    );
    CREATE TABLE IF NOT EXISTS nc_coupons (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      discount_id TEXT,
      text TEXT,
      levels INT[] NOT NULL,
      kind TEXT NOT NULL,      -- porcentaje | euros
      value NUMERIC NOT NULL,
      min_total NUMERIC,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS nc_settings (key TEXT PRIMARY KEY, value TEXT);
  `);
}

export async function getSetting(key) {
  const r = await pool.query('SELECT value FROM nc_settings WHERE key=$1', [key]);
  return r.rows[0]?.value ?? null;
}
export async function setSetting(key, value) {
  await pool.query('INSERT INTO nc_settings(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [key, value]);
}

export async function getOrder(orderId) {
  return (await pool.query('SELECT * FROM nc_orders WHERE order_id=$1', [orderId])).rows[0] || null;
}

export async function saveOrder(o) {
  await pool.query(
    `INSERT INTO nc_orders(order_id,name,customer_id,paid_at,amount,eligible,level_at,rate,earned,credited,status,release_at,gift,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
     ON CONFLICT (order_id) DO UPDATE SET name=$2, amount=$5, eligible=$6, earned=$9, credited=$10, status=$11, release_at=$12, gift=$13, updated_at=now()`,
    [o.order_id, o.name, o.customer_id, o.paid_at, o.amount, o.eligible, o.level_at, o.rate, o.earned, o.credited, o.status, o.release_at, !!o.gift],
  );
}

/** Lo comprado en los últimos 12 meses, sin contar un pedido (para saber el nivel con el que se hizo). */
export async function spent12m(customerId, exceptOrderId = null) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(amount),0)::float AS s FROM nc_orders
     WHERE customer_id=$1 AND status<>'anulado' AND paid_at > now() - interval '365 days' AND ($2::text IS NULL OR order_id<>$2)`,
    [customerId, exceptOrderId],
  );
  return r.rows[0].s;
}

export async function pendingFor(customerId) {
  const r = await pool.query(`SELECT COALESCE(SUM(earned),0)::float AS s FROM nc_orders WHERE customer_id=$1 AND status='pendiente'`, [customerId]);
  return r.rows[0].s;
}

export async function ordersToRevisit() {
  // Pendientes (para sumarlos cuando toque) y sumados de los últimos 60 días (por si hay devoluciones tardías).
  const r = await pool.query(
    `SELECT order_id FROM nc_orders WHERE status='pendiente' OR (status='sumado' AND updated_at > now() - interval '60 days') ORDER BY paid_at`,
  );
  return r.rows.map((x) => x.order_id);
}

export async function getCustomer(id) {
  return (await pool.query('SELECT * FROM nc_customers WHERE customer_id=$1', [id])).rows[0] || null;
}
export async function saveCustomer(c) {
  await pool.query(
    `INSERT INTO nc_customers(customer_id,name,level,spent_12m,balance,pending,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (customer_id) DO UPDATE SET name=COALESCE($2,nc_customers.name), level=$3, spent_12m=$4, balance=$5, pending=$6, updated_at=now()`,
    [c.customer_id, c.name || null, c.level, c.spent_12m, c.balance, c.pending],
  );
}
export async function allCustomers() {
  return (await pool.query('SELECT * FROM nc_customers ORDER BY spent_12m DESC')).rows;
}
export async function customersAtLevel(level) {
  return (await pool.query('SELECT * FROM nc_customers WHERE level=$1', [level])).rows;
}

export async function log(row) {
  await pool.query('INSERT INTO nc_log(customer_id,order_name,kind,amount,note,dry_run) VALUES ($1,$2,$3,$4,$5,$6)', [
    row.customerId || null,
    row.orderName || null,
    row.kind,
    row.amount ?? null,
    row.note || null,
    !!row.dryRun,
  ]);
}
export async function recentLog(limit = 100) {
  return (
    await pool.query(
      `SELECT l.*, c.name AS customer_name FROM nc_log l LEFT JOIN nc_customers c ON c.customer_id=l.customer_id ORDER BY l.at DESC LIMIT $1`,
      [limit],
    )
  ).rows;
}

export async function getMonthly(customerId, month, kind) {
  return (await pool.query('SELECT * FROM nc_monthly WHERE customer_id=$1 AND month=$2 AND kind=$3', [customerId, month, kind])).rows[0] || null;
}
export async function saveMonthly(m) {
  await pool.query(
    `INSERT INTO nc_monthly(customer_id,month,kind,code,order_name,ends_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [m.customer_id, m.month, m.kind, m.code || null, m.order_name || null, m.ends_at || null],
  );
}
export async function giftsOfMonth(month) {
  return (
    await pool.query(
      `SELECT m.*, c.name AS customer_name FROM nc_monthly m LEFT JOIN nc_customers c ON c.customer_id=m.customer_id WHERE m.month=$1 AND m.kind='obsequio' ORDER BY m.order_name`,
      [month],
    )
  ).rows;
}
export async function activeMonthlyCodes(customerId) {
  return (await pool.query(`SELECT * FROM nc_monthly WHERE customer_id=$1 AND kind='envio-glam' AND ends_at > now()`, [customerId])).rows;
}

export async function saveCoupon(c) {
  await pool.query(
    `INSERT INTO nc_coupons(code,discount_id,text,levels,kind,value,min_total,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [c.code, c.discount_id, c.text, c.levels, c.kind, c.value, c.min_total, c.starts_at, c.ends_at],
  );
}
export async function activeCoupons() {
  return (await pool.query('SELECT * FROM nc_coupons WHERE ends_at > now() ORDER BY starts_at')).rows;
}
export async function recentCoupons(limit = 30) {
  return (await pool.query('SELECT * FROM nc_coupons ORDER BY created_at DESC LIMIT $1', [limit])).rows;
}

export async function totals() {
  const r = await pool.query(`SELECT
    (SELECT COALESCE(SUM(earned),0)::float FROM nc_orders WHERE status='pendiente') AS pending,
    (SELECT COALESCE(SUM(credited),0)::float FROM nc_orders WHERE status='sumado') AS credited,
    (SELECT COUNT(*)::int FROM nc_orders) AS orders`);
  const lv = await pool.query('SELECT level, COUNT(*)::int AS n FROM nc_customers GROUP BY level');
  const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const x of lv.rows) byLevel[x.level] = x.n;
  return { ...r.rows[0], byLevel };
}
