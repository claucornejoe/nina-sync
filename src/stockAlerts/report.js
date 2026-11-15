// Informe «Avisos de stock»: qué esperan las clientas, por qué está agotado y si los avisos venden.
import { config } from '../config.js';
import { gql } from '../shopify.js';
import { fetchCatalog } from '../bts.js';
import { computePrice, computeStock } from '../pricing.js';
import { fetchVariants } from './notify.js';
import * as store from './store.js';

/** Categoría legible a partir de las etiquetas del producto. */
export function categoryOf(tags = [], productType = '') {
  const t = new Set(tags);
  if (t.has('skin-care') || tags.some((x) => x.startsWith('sc-'))) return 'Skin care';
  if (tags.some((x) => x.startsWith('mq-'))) return 'Maquillaje';
  if (t.has('Estuche')) return 'Estuches y sets';
  if (t.has('Árabe')) return 'Perfumes árabes';
  if (t.has('Mujer')) return 'Perfumes mujer';
  if (t.has('Hombre')) return 'Perfumes hombre';
  if (t.has('Unisex')) return 'Perfumes unisex';
  return productType || 'Otros';
}

export const detailsOf = (v) => ({
  vendor: v.product.vendor || null,
  category: categoryOf(v.product.tags || [], v.product.productType),
  ean: (v.sku || '').trim() || null,
  price: v.price != null ? Number(v.price) : null,
  productTitle: v.product.title,
});

/**
 * Por qué no hay stock, según lo que dice BTS ahora mismo.
 * @returns {{ code: string, text: string, btsStock: number|null }}
 */
export function btsReason(b, r = config.rules) {
  if (!b) return { code: 'sin-bts', text: 'BTS ya no lo vende', btsStock: null };
  if (b.stock <= 0) return { code: 'agotado', text: 'BTS tampoco tiene', btsStock: 0 };
  if (computeStock(b.stock, r) === 0) return { code: 'pocas', text: `BTS tiene ${b.stock} (menos de ${r.minStock})`, btsStock: b.stock };
  if (b.cost) {
    const p = computePrice(b.cost, b.rrp, r);
    if (p.status === 'pierde') return { code: 'pierde', text: 'Perderías dinero a PVP', btsStock: b.stock };
  }
  return { code: 'vuelve', text: `BTS tiene ${b.stock}: vuelve en la próxima sincronización`, btsStock: b.stock };
}

// Caché para no llamar a BTS en cada visita al panel.
let btsCache = { at: 0, map: new Map(), error: null };
async function btsStatus(eans) {
  const fresh = Date.now() - btsCache.at < 30 * 60_000;
  const missing = eans.filter((e) => !btsCache.map.has(e));
  if (fresh && !missing.length) return btsCache;
  try {
    const got = await fetchCatalog(fresh ? missing : eans);
    const map = fresh ? btsCache.map : new Map();
    for (const e of fresh ? missing : eans) map.set(e, got.get(e) || null);
    btsCache = { at: fresh ? btsCache.at : Date.now(), map, error: null };
  } catch (e) {
    btsCache = { ...btsCache, error: e.message };
  }
  return btsCache;
}

// ---------- ¿Compró después del aviso? ----------
const ORDERS_Q = `query($q: String!, $after: String) {
  orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes { createdAt email cancelledAt lineItems(first: 50) { nodes { variant { id } discountedTotalSet { shopMoney { amount } } } } }
  }
}`;
let lastMatch = { at: 0, note: '' };

/** Cruza los avisos enviados (últimos 15 días) con los pedidos de los 14 días siguientes a cada aviso. */
export async function matchPurchases({ force = false } = {}) {
  if (!force && Date.now() - lastMatch.at < 10 * 60_000) return lastMatch;
  lastMatch = { at: Date.now(), note: '' };
  const pend = await store.toMatch();
  if (!pend.length) return lastMatch;
  const since = new Date(Math.min(...pend.map((p) => new Date(p.sent_at).getTime())));
  try {
    const orders = [];
    let after = null;
    do {
      const d = await gql(ORDERS_Q, { q: `created_at:>=${since.toISOString()}`, after });
      orders.push(...d.orders.nodes);
      after = d.orders.pageInfo.hasNextPage ? d.orders.pageInfo.endCursor : null;
    } while (after && orders.length < 2000);
    let found = 0;
    for (const a of pend) {
      const sent = new Date(a.sent_at).getTime();
      for (const o of orders) {
        if (!o.email || o.cancelledAt) continue;
        const t = new Date(o.createdAt).getTime();
        if (t < sent || t > sent + 14 * 86400_000) continue;
        if (store.emailHash(o.email) !== a.email_hash) continue;
        const line = o.lineItems.nodes.find((l) => l.variant?.id === a.variant_id);
        if (!line) continue;
        await store.markPurchased(a.id, o.createdAt, Number(line.discountedTotalSet?.shopMoney?.amount || 0));
        found++;
        break;
      }
    }
    lastMatch.note = found ? `${found} compras nuevas tras un aviso` : '';
  } catch (e) {
    lastMatch.note = /access|scope|permission|denied/i.test(e.message)
      ? 'Para ver si compran hace falta el permiso de pedidos (read_orders) en la app de Shopify'
      : 'No se pudieron revisar los pedidos: ' + e.message.slice(0, 120);
  }
  return lastMatch;
}

/** Todo lo que muestra la página del informe. */
export async function buildReport() {
  // Completa marca, categoría, EAN y precio de solicitudes que no los tienen.
  const need = await store.needingDetails();
  if (need.length) {
    const vs = await fetchVariants(need);
    for (const [id, v] of vs) await store.fillDetails(id, detailsOf(v));
  }
  const purchases = await matchPurchases();
  const [variants, vendors, categories, weeks, out, stats] = await Promise.all([
    store.reportByVariant(),
    store.reportGroup('vendor'),
    store.reportGroup('category'),
    store.weekly(),
    store.outcomes(),
    store.stats(),
  ]);
  const eans = variants.map((v) => v.ean).filter(Boolean);
  const bts = eans.length ? await btsStatus(eans) : { map: new Map(), error: null };
  const now = Date.now();
  for (const v of variants) {
    v.days = Math.max(0, Math.floor((now - new Date(v.desde).getTime()) / 86400_000));
    v.reason = v.ean ? (bts.map.has(v.ean) ? btsReason(bts.map.get(v.ean)) : { code: 'sin-dato', text: 'Sin datos de BTS', btsStock: null }) : { code: 'sin-ean', text: 'Sin EAN', btsStock: null };
  }
  const reasons = {};
  for (const v of variants) reasons[v.reason.code] = (reasons[v.reason.code] || 0) + v.n;
  const potential = variants.reduce((s, v) => s + (Number(v.price) || 0) * v.n, 0);
  return { variants, vendors, categories, weeks, out, stats, reasons, potential, btsError: bts.error, purchases };
}

export function reportCsv(rows) {
  const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const head = ['Producto', 'Tamaño', 'Marca', 'Categoría', 'EAN', 'Precio', 'Clientas esperando', 'Desde'];
  const lines = rows.map((r) => [r.product_title, r.variant_title, r.vendor, r.category, r.ean, r.price != null ? Number(r.price).toFixed(2).replace('.', ',') : '', r.n, new Date(r.desde).toISOString().slice(0, 10)].map(q).join(';'));
  return '﻿' + [head.map(q).join(';'), ...lines].join('\n');
}
