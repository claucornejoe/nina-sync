import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockMap, probadorEans } from '../src/probadorStock.js';

test('probador: aplica los cambios de stock recién escritos y pone 0 a lo que falta', () => {
  const variants = [
    { ean: '111', inventoryItemId: 'a', available: 0 },
    { ean: '222', inventoryItemId: 'b', available: 7 },
  ];
  const map = buildStockMap(['111', '222', '333'], variants, [{ inventoryItemId: 'a', quantity: 12 }]);
  assert.deepEqual(map, { 111: 12, 222: 7, 333: 0 });
});

test('probador: lee los 80 EAN del JSON del tema', () => {
  const eans = probadorEans();
  assert.equal(eans.length, 80);
  assert.ok(eans.every((e) => /^\d{8,14}$/.test(e)));
});
