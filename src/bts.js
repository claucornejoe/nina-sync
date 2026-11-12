import { config } from './config.js';
import { parseMoney } from './pricing.js';

// Cliente de la API de BTS Wholesaler (documentación v2.1, 27-10-2026).
// Base: https://api.btswholesaler.com/v1/api · Auth: Bearer JWT · Límite: 120 peticiones/min.
// Se usa getProducts (máx. 25 SKU por llamada), que trae coste, PVP recomendado y stock
// solo de lo que la cuenta puede vender. Un EAN que no vuelve = no se puede vender.

const BATCH = 25;
const MIN_GAP_MS = 550; // ~110 peticiones/min, por debajo del límite de 120
let lastCall = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(fn, params) {
  const url = new URL(`${config.bts.apiUrl()}/${fn}`);
  for (const [k, v] of params) url.searchParams.append(k, v);

  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();

    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.bts.token()}`, Accept: 'application/json' } });
    if (res.status === 429 && attempt < 6) {
      const retry = Number(res.headers.get('retry-after')) || 10;
      await sleep(retry * 1000 + 500);
      continue;
    }
    if (res.status >= 500 && attempt < 3) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (res.status === 401) throw new Error('BTS rechaza el token (401): revisa BTS_TOKEN');
    if (!res.ok) throw new Error(`BTS ${fn} respondió ${res.status}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`BTS ${fn} no devolvió JSON: ${text.slice(0, 300)}`);
    }
  }
}

export function normalize(p) {
  return {
    ean: String(p.ean ?? p.product_sku ?? '').trim(),
    name: p.name ?? p.product_name ?? '',
    cost: parseMoney(p.price ?? p.product_price),
    rrp: parseMoney(p.recommended_price),
    stock: Number(p.stock ?? p.product_stock ?? 0) || 0,
    manufacturer: p.manufacturer ?? p.manufacturer_name ?? '',
    categories: p.categories ?? '',
    gender: p.gender ?? '',
    image: p.image ?? '',
  };
}

function asList(j) {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.products)) return j.products;
  if (j && typeof j === 'object' && j.ean) return [j];
  if (j?.error || j?.message) return []; // p. ej. ningún SKU encontrado en ese lote
  throw new Error('Respuesta de BTS getProducts no reconocida: ' + JSON.stringify(j).slice(0, 300));
}

/**
 * Datos de BTS (coste, PVP recomendado y stock) para los EAN de la tienda, indexados por EAN.
 * @param {string[]} eans
 */
export async function fetchCatalog(eans, onProgress = () => {}) {
  const unique = [...new Set(eans.filter(Boolean))];
  const byEan = new Map();
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const params = chunk.map((e, k) => [`product_sku[${k}]`, e]);
    params.push(['language_code', config.bts.lang]);
    const list = asList(await get('getProducts', params));
    for (const raw of list) {
      const p = normalize(raw);
      if (p.ean) byEan.set(p.ean, p);
    }
    onProgress(Math.min(i + BATCH, unique.length), unique.length);
  }
  if (unique.length > 0 && byEan.size === 0) throw new Error('BTS devolvió 0 productos; no se toca nada en Shopify');
  return byEan;
}

/**
 * Productos que BTS añadió en los últimos `days` días y que no están en la tienda.
 * getNewProducts no trae categorías, así que se completan con getProducts.
 * @param {Set<string>} knownEans EAN que ya están en Shopify
 */
export async function fetchNewProducts(days, knownEans) {
  const fresh = [];
  for (let page = 1; page < 200; page++) {
    const j = await get('getNewProducts', [
      ['days', String(days)],
      ['page', String(page)],
      ['page_size', '500'],
      ['language_code', config.bts.lang],
    ]);
    for (const raw of j?.products || []) {
      const p = normalize(raw);
      if (p.ean && !knownEans.has(p.ean)) fresh.push(p);
    }
    if (!j?.pagination?.has_next_page) break;
  }
  if (!fresh.length) return [];
  const full = await fetchCatalog(fresh.map((p) => p.ean)).catch(() => new Map());
  return fresh.map((p) => full.get(p.ean)).filter(Boolean);
}
