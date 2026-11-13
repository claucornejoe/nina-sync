// Fórmula de precio (Clau, 2026-11-12: el envío ya no va dentro del precio).
// Precio = (coste BTS × 1,21 ÷ 0,70 + 0,35 PayPal) ÷ 0,911, redondeado hacia arriba según r.rounding (ver roundUp).
// El envío lo paga el cliente (4,95 €) salvo en pedidos desde el mínimo de envío gratis,
// donde los 6 € de BTS salen de la ganancia: por eso la ganancia sí los descuenta.
// Si deja menos de minProfit (2 €), sube lo justo para dejarlo.
// Si supera el PVP recomendado se baja al PVP (y al redondeo inferior si sigue ganando más de 0,50 €).
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

const ceil99 = (x) => round2(Math.ceil(round2(x - 0.99)) + 0.99);
const floor99 = (x) => round2(Math.floor(round2(x - 0.99)) + 0.99);
/** Menor entero terminado en 9 que sea >= x. */
const ceil9 = (x) => { const n = Math.ceil(round2(x)); return n + ((9 - (n % 10)) + 10) % 10; };
/** Mayor entero terminado en 9 que sea <= x. */
const floor9 = (x) => { const n = Math.floor(round2(x)); return n - (((n % 10) - 9) + 10) % 10; };

/**
 * Redondeo psicológico (r.rounding):
 *  '95'    -> ,95 (el de antes)
 *  '99'    -> ,99 siempre
 *  'charm' -> ,99 por debajo de 100 € y entero terminado en 9 desde 100 € (6,99 · 41,99 · 129)
 */
export function roundUp(x, r = {}) {
  const mode = r.rounding || '95';
  if (mode === '95') return ceil95(x);
  const c = ceil99(x);
  if (mode === '99' || c < 100) return c;
  return ceil9(x);
}
export function roundDown(x, r = {}) {
  const mode = r.rounding || '95';
  if (mode === '95') return floor95(x);
  if (mode === '99') return floor99(x);
  if (x >= 109) return floor9(x);
  return Math.min(floor99(x), 99.99);
}

/** Lo que le cuesta a Nina el envío de un pedido con este precio. */
export function shippingCost(price, r) {
  if (r.freeShippingFrom == null || price >= r.freeShippingFrom) return r.shipping;
  return round2(r.shipping - (r.shippingPrice || 0) * r.paypalNet);
}

export function profit(price, cost, r) {
  return round2(price * r.paypalNet - r.paypalFixed - shippingCost(price, r) - cost * r.vat);
}

/**
 * @param {number} cost coste BTS sin IVA
 * @param {number|null} rrp PVP recomendado por BTS (IVA incluido) o null
 * @returns {{price:number, compareAt:number|null, profit:number, status:'formula'|'pvp'|'pierde'}}
 */
export function computePrice(cost, rrp, r) {
  let formula = roundUp((cost * r.vat / r.margin + r.paypalFixed) / r.paypalNet, r);
  // Ganancia mínima por producto (Clau, 2026-11-12): los baratos suben lo justo para dejar al menos minProfit.
  if (r.minProfit && profit(formula, cost, r) < r.minProfit) {
    let p = formula;
    for (let i = 0; i < 3 && profit(p, cost, r) < r.minProfit; i++) {
      p = roundUp((cost * r.vat + r.paypalFixed + shippingCost(p, r) + r.minProfit) / r.paypalNet, r);
      if (profit(p, cost, r) < r.minProfit) p = roundUp((cost * r.vat + r.paypalFixed + r.shipping + r.minProfit) / r.paypalNet, r);
    }
    formula = Math.max(formula, p);
  }
  let price = formula;
  let status = 'formula';
  if (rrp && formula > rrp) {
    price = rrp;
    status = 'pvp';
    const rounded = roundDown(rrp, r);
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
