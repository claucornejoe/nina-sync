import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorPrice, summarizeOffers, classify, suggest, applyOverride } from '../src/competition/engine.js';
import { pickCandidates, dailyShare } from '../src/competition/worker.js';
import { competitionPage, reviewPage, competitionCsv } from '../src/competition/views.js';
import { profit } from '../src/pricing.js';
import { planSync } from '../src/plan.js';

const r = { vat: 1.21, margin: 0.7, shipping: 6, shippingPrice: 4.95, freeShippingFrom: 49, paypalFixed: 0.35, paypalNet: 0.911, minProfitAfterRounding: 0.5, minStock: 3, rounding: 'charm', minProfit: 2, manualPriceTag: 'precio-manual' };

test('precio mínimo: nunca menos de 3 € ni del 10 % del precio', () => {
  for (const cost of [5, 12.4, 26.3, 43.28, 90, 150]) {
    const f = floorPrice(cost, r, 3, 10);
    const p = profit(f, cost, r);
    assert.ok(p >= 3 && p >= f * 0.1 - 1e-9, `coste ${cost}: ${f} deja ${p}`);
    assert.match(f.toFixed(2), f < 100 ? /\.99$/ : /9\.00$/);
  }
});

test('resumen de Google Shopping: quita Nina, muestras y precios absurdos', () => {
  const s = summarizeOffers([
    { source: 'Druni', extracted_price: 52.9, title: 'Perfume X 100 ml', product_link: 'https://a' },
    { source: 'Primor', extracted_price: 49.5, title: 'Perfume X 100 ml' },
    { source: 'Primor', extracted_price: 51, title: 'Perfume X 100 ml' },
    { source: 'Nina Beauty', extracted_price: 40, title: 'Perfume X 100 ml' },
    { source: 'Decants Shop', extracted_price: 9, title: 'Perfume X decant 10 ml' },
    { source: 'Rara', extracted_price: 12, title: 'Perfume X 100 ml' },
  ]);
  assert.equal(s.min, 49.5);
  assert.equal(s.cheapestShop, 'Primor');
  assert.equal(s.shops, 2);
  assert.equal(summarizeOffers([]), null);
});

test('posición frente a la más barata', () => {
  assert.equal(classify(45, 50).pos, 'mejor');
  assert.equal(classify(52, 50).pos, 'en-linea');
  assert.equal(classify(55, 50).pos, 'caro');
  assert.equal(classify(60, 50).pos, 'muy-caro');
  assert.equal(classify(60, null).pos, 'sin-datos');
});

test('sugerencia: justo por debajo de la competencia, con tope en el margen mínimo', () => {
  const s = suggest({ price: 69.99, cost: 26.3, compMin: 55 }, r, { minProfit: 3, minPct: 10 });
  assert.equal(s.newPrice, 54.99);
  assert.ok(s.beats && !s.limited);
  // Competencia imposible de igualar sin perder margen: se queda en el mínimo.
  const t = suggest({ price: 69.99, cost: 26.3, compMin: 30 }, r, { minProfit: 3, minPct: 10 });
  assert.ok(t.limited);
  assert.ok(t.newPrice >= floorPrice(26.3, r, 3, 10));
  assert.ok(profit(t.newPrice, 26.3, r) >= 3);
  // Ya somos más baratos: nada.
  assert.equal(suggest({ price: 40, cost: 26.3, compMin: 55 }, r), null);
});

test('el ajuste guardado solo baja la fórmula y respeta el coste actual', () => {
  assert.equal(applyOverride(69.99, 53.99, 26.3, r), 53.99);
  assert.equal(applyOverride(49.99, 53.99, 26.3, r), 49.99); // la fórmula ya es más baja
  const floor = floorPrice(40, r);
  assert.equal(applyOverride(89.99, 50, 40, r), Math.max(50, floor)); // BTS subió el coste
});

test('la sincronización mantiene el precio ajustado por competencia', () => {
  const bts = new Map([['1', { ean: '1', cost: 30, rrp: 143, stock: 50 }]]); // fórmula: 57,99 €
  const v = { id: 'V1', ean: '1', productId: 'P1', productTitle: 'X', variantTitle: '100ml', inventoryItemId: 'I1', tags: [], available: 50, price: 53.99, compareAt: 143 };
  const prev = new Map([['1', { cost: 30, rrp: 143 }]]);
  const p = planSync([v], bts, r, prev, new Map([['1', 53.99]]));
  assert.equal(p.priceUpdates.size, 0); // no lo devuelve a la fórmula
  const sinAjuste = planSync([v], bts, r, prev);
  assert.equal(sinAjuste.priceUpdates.get('P1')[0].price, '57.99');
});

test('elige primero los nunca comprobados y los más caros', () => {
  const vs = [
    { ean: '1111111111111', price: 20, available: 5, status: 'ACTIVE' },
    { ean: '2222222222222', price: 90, available: 5, status: 'ACTIVE' },
    { ean: '3333333333333', price: 150, available: 5, status: 'ACTIVE' },
    { ean: '4444444444444', price: 300, available: 0, status: 'ACTIVE' },
    { ean: '5555555555555', price: 300, available: 5, status: 'ACTIVE', tags: ['precio-manual'] },
  ];
  const now = Date.now();
  const checked = new Map([['3333333333333', new Date(now - 2 * 86400_000)]]);
  const pick = pickCandidates(vs, checked, { limit: 5, recheckDays: 30, manualTag: 'precio-manual', now });
  assert.deepEqual(pick.map((v) => v.price), [90, 20]);
});

test('reparto diario del presupuesto', () => {
  assert.equal(dailyShare(250, new Date(2026, 10, 1)), 9);
  assert.equal(dailyShare(10, new Date(2026, 10, 30)), 10);
});

test('la página, la confirmación y el CSV se generan', () => {
  const row = { ean: '1', product_title: 'Perfume <X>', variant_title: '100ml', our_price: 69.99, comp_min: 55, comp_median: 58, shops: 3, cheapest_shop: 'Primor', cheapest_url: 'https://x', checked_at: new Date(), cost: 26.3, pos: 'muy-caro', diffPct: 27.3, suggestion: suggest({ price: 69.99, cost: 26.3, compMin: 55 }, r) };
  const html = competitionPage({ rows: [row], ver: '', budget: { used: 3, left: 247, serp: null }, state: { running: false }, notice: null, hasKey: true });
  assert.match(html, /Muy por encima/);
  assert.match(html, /Perfume &lt;X&gt;/);
  assert.match(reviewPage([row], { dryRun: true }), /Modo prueba/);
  assert.match(competitionCsv([row]), /Primor/);
});
