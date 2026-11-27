import test from 'node:test';
import assert from 'node:assert/strict';
import { finalVariants, offerEligibility, offersToRemove } from '../src/offers.js';

const v = (o) => ({ id: o.id, productId: o.pid, productTitle: o.pid, inventoryItemId: 'i' + o.id, price: o.price, compareAt: o.cmp ?? null, available: o.stock, tags: o.tags || ['oferta-semana'] });

test('ofertas: fuera si está agotado, si no tiene precio tachado o si el descuento es mínimo', () => {
  const variants = [
    v({ id: 1, pid: 'agotado', price: 30, cmp: 60, stock: 0 }),
    v({ id: 2, pid: 'sinTachado', price: 30, stock: 5 }),
    v({ id: 3, pid: 'centimo', price: 63.99, cmp: 64, stock: 5 }),
    v({ id: 4, pid: 'buena', price: 30, cmp: 60, stock: 5 }),
    v({ id: 5, pid: 'mixta', price: 30, cmp: 60, stock: 0 }),
    v({ id: 6, pid: 'mixta', price: 50, cmp: 70, stock: 4 }),
  ];
  const plan = { stockUpdates: [], priceUpdates: new Map() };
  const out = offersToRemove(finalVariants(variants, plan), 'oferta-semana', 0.05);
  assert.deepEqual([...out.keys()].sort(), ['agotado', 'centimo', 'sinTachado']);
});

test('ofertas: usa el stock y el precio que deja esta sincronización', () => {
  const variants = [v({ id: 1, pid: 'p', price: 30, cmp: 60, stock: 10 })];
  const plan = { stockUpdates: [{ inventoryItemId: 'i1', quantity: 0 }], priceUpdates: new Map() };
  assert.equal(offerEligibility(finalVariants(variants, plan), 0.05).get('p'), false);
  const plan2 = { stockUpdates: [], priceUpdates: new Map([['p', [{ id: 1, price: '59.00', compareAtPrice: '60.00' }]]]) };
  assert.equal(offerEligibility(finalVariants(variants, plan2), 0.05).get('p'), false);
});
