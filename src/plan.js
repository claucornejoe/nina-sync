import { computePrice, computeStock, round2 } from './pricing.js';
import { expectedTags, tagDiff, isPerfumeCategory } from './tags.js';

const money = (n) => (n === null || n === undefined ? '' : Number(n).toFixed(2));
const eur = (n) => money(n).replace('.', ',') + ' €';

/**
 * Decide qué cambiar en Shopify a partir del catálogo de BTS. No toca nada: solo planifica.
 * @param {Array} variants variantes de Shopify (ver shopify.getAllVariants)
 * @param {Map} bts catálogo BTS por EAN (ver bts.fetchCatalog)
 * @param {object} r reglas (config.rules)
 * @param {Map} prevCosts coste y PVP de BTS de la sincronización anterior, por EAN.
 *   Solo es «oferta» si el precio baja porque BTS ha bajado el coste o el PVP; una bajada
 *   por cambiar la fórmula (por ejemplo, quitar el envío del precio) no lo es.
 */
export function planSync(variants, bts, r, prevCosts = new Map()) {
  const stockUpdates = [];
  const priceUpdates = new Map(); // productId -> [{id, price, compareAtPrice}]
  const offerProducts = new Map(); // productId -> title
  const changes = [];
  let missing = 0;
  const byProduct = new Map(); // productId -> { title, tags, bts: [] }

  for (const v of variants) {
    if (!v.ean) continue;
    const base = { ean: v.ean, productTitle: v.productTitle, variantTitle: v.variantTitle, productId: v.productId };
    const b = bts.get(v.ean);
    if (!byProduct.has(v.productId)) byProduct.set(v.productId, { title: v.productTitle, tags: v.tags || [], bts: [] });
    if (b) byProduct.get(v.productId).bts.push(b);
    let targetStock;

    if (!b) {
      missing++;
      targetStock = 0;
      if (v.available !== 0) changes.push({ ...base, kind: 'sin_bts', oldValue: String(v.available), newValue: '0', note: 'BTS ya no tiene este EAN' });
    } else {
      targetStock = computeStock(b.stock, r);
      const manual = v.tags?.includes(r.manualPriceTag);

      if (b.cost && !manual) {
        const p = computePrice(b.cost, b.rrp, r);
        if (p.status === 'pierde') {
          targetStock = 0;
          if (v.available !== 0)
            changes.push({ ...base, kind: 'pierde', oldValue: String(v.available), newValue: '0', note: `A PVP perdería ${eur(-p.profit)}: se retira (stock 0)` });
        } else {
          const priceChanged = Math.abs(round2(p.price) - round2(v.price)) >= 0.01;
          const cmpChanged = round2(p.compareAt ?? 0) !== round2(v.compareAt ?? 0);
          if (priceChanged || cmpChanged) {
            const prev = prevCosts.get(v.ean);
            const btsDropped = !!prev && (b.cost < Number(prev.cost) - 0.001 || (b.rrp && prev.rrp && b.rrp < Number(prev.rrp) - 0.001));
            const priceDrop = p.price < v.price - 0.001 && btsDropped;
            const formulaOnly = !prev || (Math.abs(b.cost - Number(prev.cost)) < 0.001 && Math.abs((b.rrp || 0) - Number(prev.rrp || 0)) < 0.001);
            const onSale = !!(p.compareAt && p.compareAt > p.price);
            if (!priceUpdates.has(v.productId)) priceUpdates.set(v.productId, []);
            priceUpdates.get(v.productId).push({ id: v.id, price: money(p.price), compareAtPrice: p.compareAt ? money(p.compareAt) : null });
            changes.push({
              ...base,
              kind: 'precio',
              oldValue: eur(v.price) + (v.compareAt ? ` (PVP ${eur(v.compareAt)})` : ''),
              newValue: eur(p.price) + (p.compareAt ? ` (PVP ${eur(p.compareAt)})` : ''),
              onSale,
              priceDrop,
              note:
                `Coste BTS ${eur(b.cost)}` +
                (prev && !formulaOnly ? ` (antes ${eur(Number(prev.cost))})` : '') +
                ` · ganancia ${eur(p.profit)}` +
                (p.status === 'pvp' ? ' · topado al PVP' : '') +
                (formulaOnly ? ' · ajuste de fórmula, BTS no ha cambiado el coste' : ''),
            });
            if (priceDrop) offerProducts.set(v.productId, v.productTitle);
          }
        }
      }

      if (targetStock !== v.available) {
        changes.push({
          ...base,
          kind: 'stock',
          oldValue: String(v.available),
          newValue: String(targetStock),
          note: b.stock < r.minStock && b.stock > 0 ? `BTS tiene ${b.stock} (menos de ${r.minStock}): se pone 0` : `BTS tiene ${b.stock}`,
        });
      }
    }

    if (targetStock !== v.available) stockUpdates.push({ inventoryItemId: v.inventoryItemId, quantity: targetStock });
  }

  // Etiquetas de colección (género, tipo, marca, Árabe) según los datos de BTS.
  const tagUpdates = [];
  for (const [productId, p] of byProduct) {
    if (!p.bts.length || !p.bts.some((b) => isPerfumeCategory(b.categories))) continue;
    const { add, remove } = tagDiff(p.tags, expectedTags(p.title, p.bts));
    if (!add.length && !remove.length) continue;
    tagUpdates.push({ productId, add, remove });
    changes.push({
      productId,
      productTitle: p.title,
      kind: 'etiquetas',
      oldValue: remove.length ? 'quita: ' + remove.join(', ') : '',
      newValue: add.length ? 'añade: ' + add.join(', ') : '',
      note: 'Para que caiga en la colección correcta',
    });
  }

  return { stockUpdates, priceUpdates, offerProducts, tagUpdates, changes, missing };
}

/** Novedades de BTS que son perfumes rentables y con stock suficiente. */
export function planNewProducts(newProducts, r) {
  return newProducts
    .filter((p) => isPerfumeCategory(p.categories) && computeStock(p.stock, r) > 0 && p.cost)
    .map((p) => ({ ...p, pricing: computePrice(p.cost, p.rrp, r) }))
    .filter((p) => p.pricing.status !== 'pierde');
}

export { eur, money };
