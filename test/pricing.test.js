import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shippingCost, computePrice, computeStock, parseMoney, ceil95, floor95 } from '../src/pricing.js';

const r = { vat: 1.21, margin: 0.7, shipping: 6, shippingPrice: 4.95, freeShippingFrom: 39, paypalFixed: 0.35, paypalNet: 0.911, minProfitAfterRounding: 0.5, minStock: 3 };

test('redondeos a ,95', () => {
  assert.equal(ceil95(55.1), 55.95);
  assert.equal(ceil95(55.95), 55.95);
  assert.equal(ceil95(56.0), 56.95);
  assert.equal(floor95(73.5), 72.95);
  assert.equal(floor95(73.95), 73.95);
});

test('fórmula sin envío (4711 800 ml); la ganancia descuenta los 6 € porque supera el mínimo', () => {
  const p = computePrice(26.3, 143, r);
  assert.equal(p.price, 50.95);
  assert.equal(p.profit, 8.24);
  assert.equal(p.compareAt, 143);
  assert.equal(p.status, 'formula');
});

test('se topa al PVP y baja a ,95', () => {
  const p = computePrice(42.0, 80.5, r);
  assert.equal(p.status, 'pvp');
  assert.equal(p.price, 79.95);
});

test('por debajo del mínimo el cliente paga el envío: solo cuesta la diferencia', () => {
  const p = computePrice(10, 30, r);
  assert.equal(p.price, 19.95);
  assert.equal(p.profit, 4.23);
});

test('pierde dinero a PVP', () => {
  const p = computePrice(40, 45, r);
  assert.equal(p.status, 'pierde');
});

test('regla de stock', () => {
  assert.equal(computeStock(2, r), 0);
  assert.equal(computeStock(3, r), 3);
  assert.equal(computeStock('600', r), 600);
  assert.equal(computeStock(undefined, r), 0);
});

test('parseMoney', () => {
  assert.equal(parseMoney('26.30€'), 26.3);
  assert.equal(parseMoney('1,023.66€'), 1023.66);
  assert.equal(parseMoney(''), null);
});

test('coste de envío para Nina', () => {
  assert.equal(shippingCost(39, r), 6);
  assert.equal(shippingCost(38.95, r), 1.49);
});

test('ganancia mínima de 2 € (esmalte Nurana)', () => {
  const p = computePrice(3.2, 9.99, { ...r, minProfit: 2 });
  assert.equal(p.price, 8.95);
  assert.ok(p.profit >= 2);
  const sin = computePrice(3.2, 9.99, r);
  assert.equal(sin.price, 6.95);
});

test('ganancia mínima no pasa del PVP', () => {
  const p = computePrice(3.2, 7.5, { ...r, minProfit: 2 });
  assert.equal(p.status, 'pvp');
  assert.ok(p.price <= 7.5);
});
