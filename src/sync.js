import { config } from './config.js';
import * as shopify from './shopify.js';
import { fetchCatalog } from './bts.js';
import { planSync } from './plan.js';
import * as db from './db.js';
import { sendReport } from './mail.js';

let running = null;

export function isRunning() {
  return !!running;
}

/** Lanza una sincronización. Si ya hay una en marcha, devuelve esa. */
export function runSync(trigger = 'manual', { dryRun = config.dryRun } = {}) {
  if (running) return running;
  running = doSync(trigger, dryRun).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(trigger, dryRun) {
  const runId = await db.startRun(trigger, dryRun);
  const r = config.rules;
  try {
    // 1. Seguridad: la tienda conectada tiene que ser la de Nina Beauty.
    const shop = await shopify.shopInfo();
    if (shop.myshopifyDomain !== config.shopify.shop() || /lafarmacia/i.test(shop.primaryDomain?.host || '')) {
      throw new Error(`Tienda inesperada (${shop.myshopifyDomain}); se cancela`);
    }

    // 2. Datos de BTS y de Shopify.
    const locationId = await shopify.getLocationId();
    const variants = await shopify.getAllVariants(locationId);
    const bts = await fetchCatalog(variants.map((v) => v.ean));

    // 3. Planificar.
    const plan = planSync(variants, bts, r);
    const withEan = variants.filter((v) => v.ean).length;
    if (withEan > 20 && plan.missing > withEan * 0.5) {
      throw new Error(`BTS no trae ${plan.missing} de ${withEan} EAN: parece un fallo de BTS, no se toca nada`);
    }

    // 4. Aplicar.
    if (!dryRun) {
      await shopify.setQuantities(locationId, plan.stockUpdates);
      for (const [productId, vs] of plan.priceUpdates) await shopify.updatePrices(productId, vs);

      const until = new Date(Date.now() + r.offerDays * 86400_000);
      for (const [productId, title] of plan.offerProducts) {
        await shopify.addTags(productId, [r.offerTag]);
        await db.upsertOffer(productId, title, until);
      }
    }

    // 5. Ofertas caducadas (más de 7 días).
    const expired = await db.expiredOffers();
    for (const o of expired) {
      if (plan.offerProducts.has(o.product_id)) continue; // ha vuelto a bajar: se renueva
      if (!dryRun) {
        await shopify.removeTags(o.product_id, [r.offerTag]);
        await db.deleteOffer(o.product_id);
      }
      plan.changes.push({ productId: o.product_id, productTitle: o.product_title, kind: 'oferta_fin', oldValue: r.offerTag, newValue: '', note: 'Termina la oferta de la semana' });
    }

    await db.saveChanges(runId, plan.changes);
    const count = (k) => plan.changes.filter((c) => c.kind === k).length;
    const summary = {
      shop: shop.myshopifyDomain,
      btsProducts: bts.size,
      shopifyVariants: variants.length,
      stockChanges: count('stock'),
      priceChanges: count('precio'),
      priceDrops: plan.changes.filter((c) => c.priceDrop).length,
      onSale: plan.changes.filter((c) => c.onSale).length,
      newOffers: plan.offerProducts.size,
      offersEnded: count('oferta_fin'),
      missingInBts: plan.missing,
      losingMoney: count('pierde'),
    };
    await db.finishRun(runId, 'ok', summary);
    await sendReport(runId).catch((e) => console.error('No se pudo enviar el informe por correo:', e.message));
    return { runId, summary };
  } catch (e) {
    console.error('Sincronización fallida:', e);
    await db.finishRun(runId, 'error', null, String(e.message || e));
    await sendReport(runId).catch(() => {});
    return { runId, error: e.message };
  }
}
