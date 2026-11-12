import { config } from './config.js';
import { parseMoney } from './pricing.js';

// Cliente de la API v2.0 de BTS Wholesaler.
// La URL base y el token JWT salen del panel de cliente de BTS.
// La forma exacta de la respuesta no es pública, así que se aceptan
// varias envolturas habituales ({data:[]}, {products:[]}, [] ...).

async function call(fn, body) {
  const url = `${config.bts.apiUrl()}/${fn}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.bts.token()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`BTS ${fn} respondió ${res.status}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`BTS ${fn} no devolvió JSON: ${text.slice(0, 300)}`);
    }
  }
}

function extractList(j) {
  if (Array.isArray(j)) return j;
  for (const k of ['data', 'products', 'items', 'result', 'results']) {
    if (Array.isArray(j?.[k])) return j[k];
    if (Array.isArray(j?.[k]?.products)) return j[k].products;
    if (Array.isArray(j?.[k]?.items)) return j[k].items;
  }
  throw new Error('No reconozco la respuesta de BTS: ' + JSON.stringify(j).slice(0, 300));
}

export function normalize(p) {
  return {
    ean: String(p.ean ?? p.EAN ?? p.barcode ?? '').trim(),
    name: p.name ?? p.title ?? '',
    cost: parseMoney(p.price ?? p.cost ?? p.wholesale_price),
    rrp: parseMoney(p.recommended_price ?? p.rrp ?? p.pvp),
    stock: Number(p.stock ?? p.quantity ?? 0) || 0,
  };
}

/** Catálogo completo de BTS indexado por EAN. */
export async function fetchCatalog() {
  const byEan = new Map();
  const limit = config.bts.pageSize;
  for (let page = 1; page < 1000; page++) {
    const j = await call(config.bts.listPath, { page, limit, lang: config.bts.lang });
    const list = extractList(j);
    for (const raw of list) {
      const p = normalize(raw);
      if (p.ean) byEan.set(p.ean, p);
    }
    if (list.length < limit) break;
  }
  if (byEan.size === 0) throw new Error('BTS devolvió 0 productos; no se toca nada en Shopify');
  return byEan;
}
