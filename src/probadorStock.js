// Stock del probador virtual de labios.
// El probador del tema tacha los tonos agotados leyendo el metacampo de tienda nina.probador_stock
// ({"EAN": unidades}). Nina Sync lo reescribe en cada sincronización (cada 4 h y con el botón)
// con las unidades que acaban de quedar en Shopify, para que nunca salgan tachados tonos con stock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as shopify from './shopify.js';

const DEFAULT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tema-probador', 'assets', 'nina-probador-labios.json');

/** EAN de los tonos del probador (los del JSON del tema). */
export function probadorEans(file = process.env.PROBADOR_TONOS_FILE || DEFAULT_FILE) {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  return [...new Set(list.map((t) => String(t.ean || '').trim()).filter(Boolean))];
}

/**
 * Unidades finales por EAN: lo que había en Shopify más los cambios de stock que se acaban de aplicar.
 * Un EAN que no está en la tienda queda en 0 (el probador lo tacha).
 */
export function buildStockMap(eans, variants, stockUpdates = []) {
  const updated = new Map(stockUpdates.map((u) => [u.inventoryItemId, u.quantity]));
  const byEan = new Map();
  for (const v of variants) {
    if (!v.ean) continue;
    const q = updated.has(v.inventoryItemId) ? updated.get(v.inventoryItemId) : v.available;
    byEan.set(v.ean, Math.max(0, (byEan.get(v.ean) || 0) + Math.max(0, q || 0)));
  }
  const out = {};
  for (const e of eans) out[e] = byEan.get(e) || 0;
  return out;
}

/** Escribe el metacampo de tienda. Devuelve { total, conStock }. */
export async function writeProbadorStock(variants, stockUpdates) {
  const map = buildStockMap(probadorEans(), variants, stockUpdates);
  const d = await shopify.gql(`{ shop { id } }`);
  const res = await shopify.gql(
    `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`,
    { m: [{ ownerId: d.shop.id, namespace: 'nina', key: 'probador_stock', type: 'json', value: JSON.stringify(map) }] },
  );
  const errs = res.metafieldsSet.userErrors;
  if (errs.length) throw new Error('metafieldsSet: ' + JSON.stringify(errs));
  const vals = Object.values(map);
  return { total: vals.length, conStock: vals.filter((n) => n > 0).length };
}
