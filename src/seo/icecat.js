// Fotos extra desde Icecat (catálogo de contenido oficial de las marcas para tiendas), por EAN.
// Primero se COMPRUEBA cuántas fotos hay (sin tocar nada). Añadirlas es un paso aparte, a mano desde el panel.
// Regla de Clau: las fotos van a nivel de producto, nunca repetidas por cada tamaño.
import { pool } from '../db.js';
import * as sh from './shopify.js';
import { gql } from '../shopify.js';
import { isPlaceholderUrl } from './images.js';

const USER = () => process.env.ICECAT_USER || 'openIcecat-live';
const MAX_EXTRA = () => Number(process.env.ICECAT_MAX_EXTRA || 3);

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS icecat_check (
    product_id TEXT PRIMARY KEY, product_title TEXT, ean TEXT, pics INT NOT NULL DEFAULT 0,
    urls JSONB, added INT NOT NULL DEFAULT 0, error TEXT, checked_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

/** Fotos de Icecat para un EAN: [{ url, main }] (la principal primero). */
export async function icecatPhotos(ean) {
  const url = `https://live.icecat.biz/api?UserName=${encodeURIComponent(USER())}&Language=es&GTIN=${encodeURIComponent(ean)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return [];
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (/not found|no product|does not exist/i.test(JSON.stringify(j))) return [];
    throw new Error(`Icecat ${res.status}: ${(j.Message || j.message || '').slice(0, 150)}`);
  }
  return parseGallery(j);
}

export function parseGallery(j) {
  const g = j?.data?.Gallery || [];
  const out = g
    .map((p) => ({ url: p.Pic || p.Pic500x500 || p.LowPic || '', main: p.IsMain === 'Y' || p.IsMain === true, w: Number(p.PicWidth || 0) }))
    .filter((p) => /^https?:/.test(p.url) && (!p.w || p.w >= 400));
  const seen = new Set();
  return out.filter((p) => !seen.has(p.url) && seen.add(p.url)).sort((a, b) => b.main - a.main);
}

let running = null;
export const icecatStatus = () => running;

/** Recorre la tienda y apunta cuántas fotos tiene cada producto en Icecat (prueba con todos los EAN de sus tamaños). */
export async function checkAll() {
  if (running) return;
  running = { done: 0, total: 0, withPhotos: 0 };
  try {
    const products = [];
    for await (const p of sh.allProducts()) products.push(p);
    running.total = products.length;
    for (const p of products) {
      let photos = [];
      let ean = null;
      let error = null;
      try {
        for (const v of p.variants) {
          if (!v.sku) continue;
          photos = await icecatPhotos(v.sku);
          if (photos.length) { ean = v.sku; break; }
        }
      } catch (e) {
        error = e.message;
      }
      if (photos.length) running.withPhotos++;
      await pool.query(
        `INSERT INTO icecat_check(product_id, product_title, ean, pics, urls, error, checked_at) VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (product_id) DO UPDATE SET product_title=EXCLUDED.product_title, ean=EXCLUDED.ean, pics=EXCLUDED.pics, urls=EXCLUDED.urls, error=EXCLUDED.error, checked_at=now()`,
        [p.id, p.title, ean, photos.length, JSON.stringify(photos), error],
      );
      running.done++;
    }
  } finally {
    running = { ...running, finished: new Date() };
    setTimeout(() => (running = null), 60_000);
  }
}

export async function summary() {
  const r = await pool.query(`SELECT COUNT(*)::int AS checked,
    COUNT(*) FILTER (WHERE pics >= 1)::int AS any, COUNT(*) FILTER (WHERE pics >= 2)::int AS two,
    COUNT(*) FILTER (WHERE pics >= 4)::int AS four, COUNT(*) FILTER (WHERE added > 0)::int AS added,
    COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS errors, MAX(error) AS last_error FROM icecat_check`);
  return r.rows[0];
}

export async function samples(limit = 12) {
  return (await pool.query(`SELECT product_id, product_title, pics, urls FROM icecat_check WHERE pics > 0 ORDER BY pics DESC, product_title LIMIT $1`, [limit])).rows;
}

/** Fotos que se añadirían a un producto: si tiene el logo o la no_image, la principal de Icecat la sustituye; si no, solo las extra. */
export function plan(p, photos, max = MAX_EXTRA()) {
  const hasProvisional = (p.media || []).some((m) => isPlaceholderUrl(m.url) || /sin-foto|NinaBeauty_rrss/i.test(m.url));
  const extras = photos.filter((x) => !x.main);
  const main = photos.find((x) => x.main) || photos[0];
  if (hasProvisional && main) return { replaceProvisional: true, add: [main, ...extras.filter((x) => x !== main)].slice(0, max + 1) };
  return { replaceProvisional: false, add: (extras.length ? extras : photos.slice(1)).slice(0, max) };
}

/** Añade las fotos de Icecat a los productos comprobados que aún no las tienen. */
export async function addAll() {
  if (running) return;
  const rows = (await pool.query(`SELECT * FROM icecat_check WHERE pics > 0 AND added = 0`)).rows;
  running = { done: 0, total: rows.length, adding: true };
  try {
    for (const r of rows) {
      try {
        const p = await sh.getProduct(r.product_id);
        if (!p) continue;
        const { replaceProvisional, add } = plan(p, r.urls || []);
        if (!add.length) continue;
        if (replaceProvisional) {
          const old = p.media.filter((m) => isPlaceholderUrl(m.url) || /sin-foto|NinaBeauty_rrss/i.test(m.url)).map((m) => m.id);
          if (old.length) await gql(`mutation($ids: [ID!]!) { fileDelete(fileIds: $ids) { userErrors { message } } }`, { ids: old });
        }
        const d = await gql(
          `mutation($product: ProductUpdateInput!, $media: [CreateMediaInput!]) { productUpdate(product: $product, media: $media) { userErrors { field message } } }`,
          {
            product: { id: p.id, metafields: [{ namespace: 'nina_seo', key: 'foto', type: 'single_line_text_field', value: 'icecat' }] },
            media: add.map((x) => ({ originalSource: x.url, mediaContentType: 'IMAGE', alt: p.title })),
          },
        );
        if (d.productUpdate.userErrors.length) throw new Error(JSON.stringify(d.productUpdate.userErrors));
        await pool.query(`UPDATE icecat_check SET added=$2, error=NULL WHERE product_id=$1`, [p.id, add.length]);
      } catch (e) {
        await pool.query(`UPDATE icecat_check SET error=$2 WHERE product_id=$1`, [r.product_id, String(e.message).slice(0, 300)]);
      }
      running.done++;
    }
  } finally {
    running = { ...running, finished: new Date() };
    setTimeout(() => (running = null), 60_000);
  }
}
