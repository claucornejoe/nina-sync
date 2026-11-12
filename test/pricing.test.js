import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePrice, computeStock, parseMoney, ceil95, floor95 } from '../src/pricing.js';

const r = { vat: 1.21, margin: 0.7, shipping: 6, paypalFixed: 0.35, paypalNet: 0.911, minProfitAfterRounding: 0.5, minStock: 3 };

test('redondeos a ,95', () => {
  assert.equal(ceil95(55.1), 55.95);
  assert.equal(ceil95(55.95), 55.95);
  assert.equal(ceil95(56.0), 56.95);
  assert.equal(floor95(73.5), 72.95);
  assert.equal(floor95(73.95), 73.95);
});

test('fórmula coincide con el CSV de precios (4711 800 ml)', () => {
  const p = computePrice(26.3, 143, r);
  assert.equal(p.price, 56.95);
  assert.equal(p.profit, 13.71);
  assert.equal(p.compareAt, 143);
  assert.equal(p.status, 'formula');
});

test('se topa al PVP y baja a ,95', () => {
  const p = computePrice(36.0, 73.5, r); // Black XS 50 ml
  assert.equal(p.status, 'pvp');
  assert.equal(p.price, 72.95);
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
