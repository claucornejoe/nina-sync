import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync } from '../src/plan.js';
import { reportHtml, changesCsv } from '../src/views.js';

const r = { vat: 1.21, margin: 0.7, shipping: 6, shippingPrice: 4.95, freeShippingFrom: 39, paypalFixed: 0.35, paypalNet: 0.911, minProfitAfterRounding: 0.5, minStock: 3, manualPriceTag: 'precio-manual' };
const v = (o) => ({ id: 'V' + o.ean, productId: 'P1', productTitle: 'Perfume X', variantTitle: '100ml', inventoryItemId: 'I' + o.ean, tags: [], compareAt: null, ...o });

test('stock < 3 pasa a 0 y >= 3 se copia', () => {
  const bts = new Map([['1', { ean: '1', cost: null, stock: 2 }], ['2', { ean: '2', cost: null, stock: 3 }]]);
  const p = planSync([v({ ean: '1', available: 5, price: 10 }), v({ ean: '2', available: 0, price: 10 })], bts, r);
  assert.deepEqual(p.stockUpdates, [{ inventoryItemId: 'I1', quantity: 0 }, { inventoryItemId: 'I2', quantity: 3 }]);
});

test('EAN que ya no está en BTS queda a 0', () => {
  const p = planSync([v({ ean: '9', available: 4, price: 10 })], new Map(), r);
  assert.equal(p.stockUpdates[0].quantity, 0);
  assert.equal(p.changes[0].kind, 'sin_bts');
});

test('BTS baja el coste => oferta de la semana', () => {
  const bts = new Map([['1', { ean: '1', cost: 26.3, rrp: 143, stock: 100 }]]);
  const prev = new Map([['1', { cost: 29, rrp: 143 }]]);
  const p = planSync([v({ ean: '1', available: 100, price: 55.95, compareAt: 143 })], bts, r, prev);
  assert.equal(p.priceUpdates.get('P1')[0].price, '50.95');
  assert.ok(p.offerProducts.has('P1'));
  const c = p.changes.find((x) => x.kind === 'precio');
  assert.ok(c.priceDrop && c.onSale);
});

test('bajada solo por la fórmula (sin envío) no es oferta', () => {
  const bts = new Map([['1', { ean: '1', cost: 26.3, rrp: 143, stock: 100 }]]);
  const prev = new Map([['1', { cost: 26.3, rrp: 143 }]]);
  for (const pc of [prev, new Map()]) {
    const p = planSync([v({ ean: '1', available: 100, price: 56.95, compareAt: 143 })], bts, r, pc);
    assert.equal(p.priceUpdates.get('P1')[0].price, '50.95');
    assert.equal(p.offerProducts.size, 0);
    assert.match(p.changes.find((x) => x.kind === 'precio').note, /ajuste de fórmula/);
  }
});

test('subida de precio no es oferta', () => {
  const bts = new Map([['1', { ean: '1', cost: 26.3, rrp: null, stock: 100 }]]);
  const p = planSync([v({ ean: '1', available: 100, price: 50.95 })], bts, r);
  assert.equal(p.offerProducts.size, 0);
});

test('sin cambios => nada que hacer', () => {
  const bts = new Map([['1', { ean: '1', cost: 26.3, rrp: 143, stock: 100 }]]);
  const p = planSync([v({ ean: '1', available: 100, price: 50.95, compareAt: 143 })], bts, r);
  assert.equal(p.changes.length, 0);
  assert.equal(p.stockUpdates.length, 0);
});

test('precio manual no se toca', () => {
  const bts = new Map([['1', { ean: '1', cost: 26.3, rrp: 143, stock: 100 }]]);
  const p = planSync([v({ ean: '1', available: 100, price: 99, tags: ['precio-manual'] })], bts, r);
  assert.equal(p.priceUpdates.size, 0);
});

test('pierde dinero => stock 0', () => {
  const bts = new Map([['1', { ean: '1', cost: 40, rrp: 45, stock: 100 }]]);
  const p = planSync([v({ ean: '1', available: 100, price: 45 })], bts, r);
  assert.equal(p.stockUpdates[0].quantity, 0);
  assert.ok(p.changes.some((c) => c.kind === 'pierde'));
});

test('el informe se dibuja', () => {
  const run = { id: 3, started_at: new Date(), finished_at: new Date(), trigger: 'cron', status: 'ok', summary: { stockChanges: 1 } };
  const changes = [{ product_title: 'A <b>', variant_title: '50ml', ean: '1', kind: 'precio', old_value: '10', new_value: '9', on_sale: true, price_drop: true }];
  const html = reportHtml({ run, changes });
  assert.match(html, /Sincronización #3/);
  assert.match(html, /A &lt;b&gt;/);
  assert.match(changesCsv(changes), /Baja de precio/);
});
