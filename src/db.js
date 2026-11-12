import pg from 'pg';
import { config } from './config.js';

export const pool = config.databaseUrl
  ? new pg.Pool({
      connectionString: config.databaseUrl,
      // En Railway la URL interna no usa SSL. Pon DATABASE_SSL=true si usas la URL pública.
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    })
  : null;

export async function migrate() {
  if (!pool) throw new Error('Falta DATABASE_URL (añade Postgres en Railway)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      dry_run BOOLEAN NOT NULL DEFAULT false,
      summary JSONB,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_changes (
      id SERIAL PRIMARY KEY,
      run_id INT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
      ean TEXT, product_title TEXT, variant_title TEXT, product_id TEXT,
      kind TEXT NOT NULL,
      old_value TEXT, new_value TEXT,
      on_sale BOOLEAN NOT NULL DEFAULT false,
      price_drop BOOLEAN NOT NULL DEFAULT false,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS sync_changes_run ON sync_changes(run_id);
    CREATE TABLE IF NOT EXISTS offers (
      product_id TEXT PRIMARY KEY,
      product_title TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      until TIMESTAMPTZ NOT NULL
    );
  `);
}

export async function startRun(trigger, dryRun) {
  const r = await pool.query('INSERT INTO sync_runs(trigger, dry_run) VALUES ($1,$2) RETURNING id', [trigger, dryRun]);
  return r.rows[0].id;
}

export async function finishRun(id, status, summary, error = null) {
  await pool.query('UPDATE sync_runs SET finished_at=now(), status=$2, summary=$3, error=$4 WHERE id=$1', [
    id,
    status,
    summary,
    error,
  ]);
}

const COLS = ['run_id', 'ean', 'product_title', 'variant_title', 'product_id', 'kind', 'old_value', 'new_value', 'on_sale', 'price_drop', 'note'];

export async function saveChanges(runId, changes) {
  for (let i = 0; i < changes.length; i += 500) {
    const chunk = changes.slice(i, i + 500);
    const rows = [];
    const params = [];
    chunk.forEach((c, k) => {
      const base = k * COLS.length;
      rows.push('(' + COLS.map((_, j) => '$' + (base + j + 1)).join(',') + ')');
      params.push(runId, c.ean, c.productTitle, c.variantTitle, c.productId, c.kind, c.oldValue, c.newValue, !!c.onSale, !!c.priceDrop, c.note || null);
    });
    await pool.query(`INSERT INTO sync_changes(${COLS.join(',')}) VALUES ${rows.join(',')}`, params);
  }
}

export async function upsertOffer(productId, title, until) {
  await pool.query(
    `INSERT INTO offers(product_id, product_title, until) VALUES ($1,$2,$3)
     ON CONFLICT (product_id) DO UPDATE SET until=EXCLUDED.until, product_title=EXCLUDED.product_title`,
    [productId, title, until],
  );
}

export async function expiredOffers() {
  return (await pool.query('SELECT * FROM offers WHERE until < now()')).rows;
}

export async function deleteOffer(productId) {
  await pool.query('DELETE FROM offers WHERE product_id=$1', [productId]);
}

export async function listRuns(limit = 100) {
  return (await pool.query('SELECT * FROM sync_runs ORDER BY id DESC LIMIT $1', [limit])).rows;
}

export async function getRun(id) {
  const run = (await pool.query('SELECT * FROM sync_runs WHERE id=$1', [id])).rows[0];
  if (!run) return null;
  const changes = (
    await pool.query('SELECT * FROM sync_changes WHERE run_id=$1 ORDER BY on_sale DESC, price_drop DESC, kind, product_title, variant_title', [id])
  ).rows;
  return { run, changes };
}

export async function activeOffers() {
  return (await pool.query('SELECT * FROM offers WHERE until >= now() ORDER BY until')).rows;
}

/** Marca como fallidas las ejecuciones que quedaron a medias (por ejemplo, por un reinicio). */
export async function closeStaleRuns() {
  await pool.query(
    `UPDATE sync_runs SET status='error', finished_at=now(), error='Interrumpida (reinicio del servidor)' WHERE status='running'`,
  );
}
