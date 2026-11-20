// Tablas de la pestaña «Competencia».
import { pool } from '../db.js';

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competitor_prices (
      ean TEXT PRIMARY KEY,
      variant_id TEXT, product_id TEXT, product_title TEXT, variant_title TEXT,
      our_price NUMERIC, compare_at NUMERIC,
      comp_min NUMERIC, comp_median NUMERIC, shops INT NOT NULL DEFAULT 0,
      cheapest_shop TEXT, cheapest_url TEXT, offers JSONB,
      source TEXT NOT NULL DEFAULT 'google-shopping',
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS competitor_searches (
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      n INT NOT NULL DEFAULT 0,
      PRIMARY KEY (day)
    );
    CREATE TABLE IF NOT EXISTS price_overrides (
      ean TEXT PRIMARY KEY,
      price NUMERIC NOT NULL,
      comp_min NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      until TIMESTAMPTZ NOT NULL
    );
  `);
}

export async function saveCheck(c) {
  await pool.query(
    `INSERT INTO competitor_prices(ean, variant_id, product_id, product_title, variant_title, our_price, compare_at, comp_min, comp_median, shops, cheapest_shop, cheapest_url, offers, checked_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
     ON CONFLICT (ean) DO UPDATE SET variant_id=EXCLUDED.variant_id, product_id=EXCLUDED.product_id, product_title=EXCLUDED.product_title,
       variant_title=EXCLUDED.variant_title, our_price=EXCLUDED.our_price, compare_at=EXCLUDED.compare_at, comp_min=EXCLUDED.comp_min,
       comp_median=EXCLUDED.comp_median, shops=EXCLUDED.shops, cheapest_shop=EXCLUDED.cheapest_shop, cheapest_url=EXCLUDED.cheapest_url,
       offers=EXCLUDED.offers, checked_at=now()`,
    [c.ean, c.variantId, c.productId, c.productTitle, c.variantTitle, c.ourPrice, c.compareAt, c.min ?? null, c.median ?? null, c.shops || 0, c.cheapestShop || null, c.cheapestUrl || null, JSON.stringify(c.offers || [])],
  );
}

/** Fecha de la última comprobación de cada EAN. */
export async function lastChecked() {
  const rows = (await pool.query('SELECT ean, checked_at FROM competitor_prices')).rows;
  return new Map(rows.map((r) => [r.ean, new Date(r.checked_at)]));
}

/** Filas comprobadas, con el coste y PVP de BTS de la última sincronización. */
export async function rows() {
  return (
    await pool.query(
      `SELECT c.*, b.cost, b.rrp, o.price AS override_price, o.until AS override_until
       FROM competitor_prices c
       LEFT JOIN bts_costs b ON b.ean = c.ean
       LEFT JOIN price_overrides o ON o.ean = c.ean AND o.until >= now()
       ORDER BY c.product_title, c.variant_title`,
    )
  ).rows.map((r) => ({
    ...r,
    our_price: r.our_price === null ? null : Number(r.our_price),
    compare_at: r.compare_at === null ? null : Number(r.compare_at),
    comp_min: r.comp_min === null ? null : Number(r.comp_min),
    comp_median: r.comp_median === null ? null : Number(r.comp_median),
    cost: r.cost === null ? null : Number(r.cost),
    rrp: r.rrp === null ? null : Number(r.rrp),
    override_price: r.override_price === null ? null : Number(r.override_price),
  }));
}

/** La sincronización cambia precios: se apunta el precio actual para que la comparación no quede vieja. */
export async function refreshOurPrices(items) {
  const list = items.filter((v) => v.ean);
  for (let i = 0; i < list.length; i += 1000) {
    const chunk = list.slice(i, i + 1000);
    await pool.query(
      `UPDATE competitor_prices c SET our_price = u.price, compare_at = u.cmp
       FROM unnest($1::text[], $2::numeric[], $3::numeric[]) AS u(ean, price, cmp) WHERE c.ean = u.ean`,
      [chunk.map((v) => v.ean), chunk.map((v) => v.price), chunk.map((v) => v.compareAt ?? null)],
    );
  }
}

export async function countSearch(n = 1) {
  await pool.query(`INSERT INTO competitor_searches(day, n) VALUES (CURRENT_DATE, $1) ON CONFLICT (day) DO UPDATE SET n = competitor_searches.n + $1`, [n]);
}
export async function searchesThisMonth() {
  const r = await pool.query(`SELECT COALESCE(SUM(n),0)::int AS n FROM competitor_searches WHERE day >= date_trunc('month', CURRENT_DATE)`);
  return r.rows[0].n;
}
export async function searchesToday() {
  const r = await pool.query(`SELECT COALESCE(SUM(n),0)::int AS n FROM competitor_searches WHERE day = CURRENT_DATE`);
  return r.rows[0].n;
}

/** Ajustes por competencia vigentes, por EAN (los usa la sincronización). */
export async function activeOverrides() {
  if (!pool) return new Map();
  const rows = (await pool.query('SELECT ean, price FROM price_overrides WHERE until >= now()')).rows;
  return new Map(rows.map((r) => [r.ean, Number(r.price)]));
}
export async function saveOverride(ean, price, compMin, until) {
  await pool.query(
    `INSERT INTO price_overrides(ean, price, comp_min, until) VALUES ($1,$2,$3,$4)
     ON CONFLICT (ean) DO UPDATE SET price=EXCLUDED.price, comp_min=EXCLUDED.comp_min, created_at=now(), until=EXCLUDED.until`,
    [ean, price, compMin, until],
  );
}
export async function deleteOverride(ean) {
  await pool.query('DELETE FROM price_overrides WHERE ean=$1', [ean]);
}
export async function setOurPrice(ean, price) {
  await pool.query('UPDATE competitor_prices SET our_price=$2 WHERE ean=$1', [ean, price]);
}
