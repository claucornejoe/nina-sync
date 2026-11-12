// Alta automática de las novedades de BTS en la colección «Recién llegados».
import { config } from './config.js';
import * as shopify from './shopify.js';
import * as db from './db.js';
import { splitName, description } from './naming.js';
import { expectedTags } from './tags.js';
import { computeStock } from './pricing.js';
import { eur, money } from './plan.js';

/**
 * @param {Array} items novedades de planNewProducts (con .pricing)
 * @returns {Promise<Array>} filas para el informe
 */
export async function createNewArrivals(items, locationId, { dryRun }) {
  const r = config.rules;
  const changes = [];
  const groups = new Map();
  for (const p of items) {
    const n = splitName(p.name);
    const key = n.single ? `${p.ean}` : `${p.manufacturer}|${n.title.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { title: n.title, option: n.option, items: [] });
    groups.get(key).items.push({ ...p, label: n.label });
  }

  const until = new Date(Date.now() + r.newArrivalDays * 86400_000);
  for (const g of groups.values()) {
    const brand = g.items[0].manufacturer;
    const tags = expectedTags(g.title, g.items) || [];
    const [gender, type] = tags;
    const variantInput = (p) => ({
      price: money(p.pricing.price),
      compareAtPrice: p.pricing.compareAt ? money(p.pricing.compareAt) : null,
      inventoryPolicy: 'DENY',
    });
    const row = (p, what) => ({
      ean: p.ean,
      productTitle: g.title,
      variantTitle: p.label,
      kind: 'nuevo',
      oldValue: '',
      newValue: eur(p.pricing.price) + (p.pricing.compareAt ? ` (PVP ${eur(p.pricing.compareAt)})` : ''),
      note: `${what} · ${brand} · stock BTS ${p.stock} · ganancia ${eur(p.pricing.profit)}`,
    });

    try {
      const existing = g.items[0].label === 'Único' || g.items[0].label === 'Estuche' ? null : await shopify.findProductByTitle(g.title);
      if (existing) {
        const opt = existing.options[0];
        const have = new Set(opt.optionValues.map((v) => v.name.toLowerCase()));
        const fresh = g.items.filter((p) => !have.has(p.label.toLowerCase()));
        if (!fresh.length) continue;
        if (!dryRun) {
          await shopify.addVariants(
            existing.id,
            fresh.map((p) => ({
              ...variantInput(p),
              optionValues: [{ optionName: opt.name, name: p.label }],
              inventoryItem: { sku: p.ean, tracked: true },
              inventoryQuantities: [{ locationId, availableQuantity: computeStock(p.stock, r) }],
            })),
          );
          await shopify.addTags(existing.id, [r.newArrivalTag]);
          await db.upsertNewArrival(existing.id, g.title, until);
        }
        for (const p of fresh) changes.push({ ...row(p, 'Tamaño nuevo en una ficha que ya tenías'), productId: existing.id });
      } else {
        let productId = null;
        if (!dryRun) {
          const product = await shopify.createProduct({
            title: g.title,
            vendor: brand ? tags[2] : undefined,
            productType: 'Perfume',
            status: 'ACTIVE',
            tags: [...tags, r.newArrivalTag],
            descriptionHtml: description(g.title, tags[2] || brand, gender, type),
            seo: {
              title: `${g.title} | Nina Beauty`.slice(0, 70),
              description: `Compra ${g.title} de ${tags[2] || brand} al mejor precio. Perfume 100 % original con envío gratis en España.`.slice(0, 320),
            },
            productOptions: [{ name: g.option, values: g.items.map((p) => ({ name: p.label })) }],
            files: g.items[0].image ? [{ originalSource: g.items[0].image, contentType: 'IMAGE', alt: g.title }] : [],
            variants: g.items.map((p) => ({
              ...variantInput(p),
              optionValues: [{ optionName: g.option, name: p.label }],
              sku: p.ean,
              inventoryItem: { tracked: true },
              inventoryQuantities: [{ locationId, name: 'available', quantity: computeStock(p.stock, r) }],
            })),
          });
          productId = product.id;
          await db.upsertNewArrival(productId, g.title, until);
        }
        for (const p of g.items) changes.push({ ...row(p, 'Ficha nueva'), productId });
      }
    } catch (e) {
      for (const p of g.items) changes.push({ ...row(p, 'No se pudo crear: ' + e.message.slice(0, 200)), kind: 'nuevo_error' });
    }
  }
  return changes;
}

/** Quita la etiqueta «recien-llegado» a los productos que llevan más de 30 días. */
export async function expireNewArrivals({ dryRun }) {
  const r = config.rules;
  const changes = [];
  for (const a of await db.expiredNewArrivals()) {
    if (!dryRun) {
      await shopify.removeTags(a.product_id, [r.newArrivalTag]);
      await db.deleteNewArrival(a.product_id);
    }
    changes.push({ productId: a.product_id, productTitle: a.product_title, kind: 'nuevo_fin', oldValue: r.newArrivalTag, newValue: '', note: 'Sale de «Recién llegados» (30 días)' });
  }
  return changes;
}
