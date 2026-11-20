// Cálculos de la pestaña «Competencia» (sin red ni base de datos: se prueban solos).
import { profit, roundUp, roundDown, round2 } from '../pricing.js';

const num = (name, def) => (process.env[name] ? Number(process.env[name]) : def);

export const comp = {
  // Clave de SerpApi (Google Shopping). Solo en Railway, nunca en GitHub ni en el chat.
  serpKey: () => process.env.SERPAPI_KEY || '',
  // Búsquedas al mes que puede gastar la app (plan gratis de SerpApi: 250).
  monthlySearches: () => num('COMPETENCIA_BUSQUEDAS_MES', 250),
  // Cada día a las 05:15 (hora de Madrid) comprueba un trozo del presupuesto del mes.
  cron: process.env.COMPETENCIA_CRON || '15 5 * * *',
  auto: () => process.env.COMPETENCIA_AUTO !== 'false',
  // Un producto no se vuelve a buscar hasta pasados estos días.
  recheckDays: () => num('COMPETENCIA_REVISAR_DIAS', 30),
  // «Muy por encima» de la competencia a partir de este % más caro.
  highPct: () => num('COMPETENCIA_MUY_CARO_PCT', 15),
  // «En línea» hasta este % más caro.
  closePct: () => num('COMPETENCIA_EN_LINEA_PCT', 5),
  // Margen mínimo al ajustar: la ganancia nunca baja de X € NI del Y % del precio de venta.
  minProfit: () => num('COMPETENCIA_GANANCIA_MIN', 3),
  minMarginPct: () => num('COMPETENCIA_MARGEN_MIN_PCT', 10),
  // Un ajuste por competencia dura estos días; después el precio vuelve a la fórmula.
  overrideDays: () => num('COMPETENCIA_AJUSTE_DIAS', 30),
  ownShop: /nina\s*beauty|ninabeauty/i,
};

/** Precio mínimo permitido (redondeado como la tienda) que deja el margen mínimo. */
export function floorPrice(cost, r, minProfit = comp.minProfit(), minPct = comp.minMarginPct()) {
  const ok = (p) => profit(p, cost, r) >= Math.max(minProfit, (p * minPct) / 100) - 1e-9;
  let p = roundUp(Math.max(0.01, (cost * r.vat + r.paypalFixed + minProfit) / r.paypalNet), r);
  for (let i = 0; i < 3000 && !ok(p); i++) p = roundUp(p + 0.01, r);
  return round2(p);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const NOT_SAME = /muestra|decant|sample|tester|miniatura|\bmini\b|vial|recarga|refill|usado|reacondicionad/i;

/**
 * Resume las ofertas de Google Shopping de un EAN.
 * Quita nuestra propia tienda, muestras/decants/testers y precios absurdamente bajos (< 50 % de la mediana).
 */
export function summarizeOffers(results = []) {
  const offers = results
    .map((o) => ({
      shop: String(o.source || o.seller || '').trim(),
      price: Number(o.extracted_price ?? o.price_value ?? NaN),
      title: String(o.title || ''),
      url: o.product_link || o.link || '',
    }))
    .filter((o) => Number.isFinite(o.price) && o.price > 0 && o.shop && !comp.ownShop.test(o.shop) && !NOT_SAME.test(o.title));
  if (!offers.length) return null;
  const med = median(offers.map((o) => o.price));
  const clean = offers.filter((o) => o.price >= med * 0.5);
  const byShop = new Map();
  for (const o of clean) if (!byShop.has(o.shop) || byShop.get(o.shop).price > o.price) byShop.set(o.shop, o);
  const list = [...byShop.values()].sort((a, b) => a.price - b.price);
  return {
    min: round2(list[0].price),
    median: round2(median(list.map((o) => o.price))),
    shops: list.length,
    cheapestShop: list[0].shop,
    cheapestUrl: list[0].url,
    offers: list.slice(0, 8),
  };
}

/** Posición frente a la tienda más barata. */
export function classify(ourPrice, compMin, { high = comp.highPct(), close = comp.closePct() } = {}) {
  if (!compMin) return { pos: 'sin-datos', diffPct: null };
  const diffPct = round2(((ourPrice - compMin) / compMin) * 100);
  let pos = 'mejor';
  if (diffPct > high) pos = 'muy-caro';
  else if (diffPct > close) pos = 'caro';
  else if (diffPct > 0) pos = 'en-linea';
  return { pos, diffPct };
}

/**
 * Precio sugerido para quedar justo por debajo de la tienda más barata, sin bajar del margen mínimo.
 * Solo baja precios (nunca sube). Devuelve null si no hay nada que ajustar.
 */
export function suggest({ price, cost, compMin }, r, opts = {}) {
  if (!compMin || !cost || !(price > compMin)) return null;
  const floor = floorPrice(cost, r, opts.minProfit, opts.minPct);
  let target = roundDown(compMin - 0.01, r);
  if (target >= compMin) target = round2(compMin - 0.01);
  const newPrice = round2(Math.max(target, floor));
  if (newPrice >= price - 0.009) return { newPrice: null, floor, limited: true, profitNow: profit(price, cost, r) };
  return {
    newPrice,
    floor,
    limited: newPrice > target, // no llega a ser el más barato por el margen mínimo
    beats: newPrice < compMin,
    profitNow: profit(price, cost, r),
    profitNew: profit(newPrice, cost, r),
  };
}

/**
 * Aplica un ajuste por competencia guardado al precio que da la fórmula en la sincronización.
 * El ajuste solo puede bajar el precio de la fórmula y nunca por debajo del margen mínimo con el coste ACTUAL.
 */
export function applyOverride(formulaPrice, override, cost, r) {
  if (!override || !cost) return formulaPrice;
  const floor = floorPrice(cost, r);
  return round2(Math.min(formulaPrice, Math.max(Number(override), floor)));
}
