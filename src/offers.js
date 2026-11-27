// «Ofertas de la semana»: solo productos con descuento de verdad y con stock (Clau, 2026-11-24).
// Un producto se queda en la colección si al menos un tamaño tiene stock y precio tachado
// (compareAt) con un descuento de OFFER_MIN_DISCOUNT o más (5 % por defecto).

/** Precio, precio tachado y stock de cada variante después de aplicar los cambios de esta sincronización. */
export function finalVariants(variants, plan) {
  const stock = new Map(plan.stockUpdates.map((u) => [u.inventoryItemId, u.quantity]));
  const prices = new Map();
  for (const vs of plan.priceUpdates.values()) for (const v of vs) prices.set(v.id, v);
  return variants.map((v) => {
    const p = prices.get(v.id);
    return {
      ...v,
      price: p ? Number(p.price) : v.price,
      compareAt: p ? (p.compareAtPrice ? Number(p.compareAtPrice) : null) : v.compareAt,
      available: stock.has(v.inventoryItemId) ? stock.get(v.inventoryItemId) : v.available,
    };
  });
}

export function hasRealDiscount(v, minDiscount) {
  return v.available > 0 && v.compareAt > 0 && v.price > 0 && 1 - v.price / v.compareAt >= minDiscount - 1e-9;
}

/** productId -> true si el producto puede estar en ofertas. */
export function offerEligibility(finals, minDiscount) {
  const out = new Map();
  for (const v of finals) out.set(v.productId, out.get(v.productId) || hasRealDiscount(v, minDiscount));
  return out;
}

/** Productos con la etiqueta de oferta que ya no cumplen (sin stock o sin descuento). */
export function offersToRemove(finals, offerTag, minDiscount) {
  const ok = offerEligibility(finals, minDiscount);
  const out = new Map();
  for (const v of finals) if (v.tags?.includes(offerTag) && !ok.get(v.productId)) out.set(v.productId, v.productTitle);
  return out;
}
