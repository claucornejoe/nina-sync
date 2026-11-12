// Fórmula de precio acordada con Clau (2026-11-10).
// Precio = (coste BTS × 1,21 ÷ 0,70 + 6 envío + 0,35 PayPal) ÷ 0,911, redondeado hacia arriba a ,95.
// Si supera el PVP recomendado se baja al PVP (y a ,95 si sigue ganando más de 0,50 €).
// Si a ese precio pierde dinero, el tamaño no se vende (stock 0).

export const round2 = (n) => Math.round(n * 100) / 100;

/** Menor importe terminado en ,95 que sea >= x. */
export function ceil95(x) {
  const n = Math.ceil(round2(x - 0.95));
  return round2(n + 0.95);
}

/** Mayor importe terminado en ,95 que sea <= x. */
export function floor95(x) {
  const n = Math.floor(round2(x - 0.95));
  return round2(n + 0.95);
}

export function profit(price, cost, r) {
  return round2(price * r.paypalNet - r.paypalFixed - r.shipping - cost * r.vat);
}

/**
 * @param {number} cost coste BTS sin IVA
 * @param {number|null} rrp PVP recomendado por BTS (IVA incluido) o null
 * @returns {{price:number, compareAt:number|null, profit:number, status:'formula'|'pvp'|'pierde'}}
 */
export function computePrice(cost, rrp, r) {
  const formula = ceil95((cost * r.vat / r.margin + r.shipping + r.paypalFixed) / r.paypalNet);
  let price = formula;
  let status = 'formula';
  if (rrp && formula > rrp) {
    price = rrp;
    status = 'pvp';
    const rounded = floor95(rrp);
    if (rounded !== rrp && profit(rounded, cost, r) > r.minProfitAfterRounding) price = rounded;
  }
  const p = profit(price, cost, r);
  if (p <= 0) status = 'pierde';
  const compareAt = rrp && rrp > price ? round2(rrp) : null;
  return { price: round2(price), compareAt, profit: p, status };
}

/** Regla de stock: menos de minStock unidades en BTS => 0. */
export function computeStock(btsStock, r) {
  const s = Number(btsStock) || 0;
  return s < r.minStock ? 0 : s;
}

/** "1,023.66€" -> 1023.66 ; "" -> null */
export function parseMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[€\s]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
