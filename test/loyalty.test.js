import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../src/loyalty/rules.js';
import { parseCouponForm } from '../src/loyalty/routes.js';

const money = (a) => ({ shopMoney: { amount: String(a) } });
const order = (o = {}) => ({ displayFinancialStatus: 'PAID', cancelledAt: null, currentSubtotalPriceSet: money(100), transactions: [], fulfillments: [], ...o });

test('niveles por compras de 12 meses', () => {
  assert.equal(r.levelFor(0).name, 'Sparkle');
  assert.equal(r.levelFor(99.99).name, 'Sparkle');
  assert.equal(r.levelFor(100).name, 'Glow');
  assert.equal(r.levelFor(250).name, 'Glam');
  assert.equal(r.levelFor(1200).name, 'Butterfly');
  assert.deepEqual(r.LEVELS.map((l) => l.rate), [1, 1.5, 2, 2]);
});

test('NinaCash: % del importe de productos, redondeado al céntimo', () => {
  assert.equal(r.earnedFor(71.95, 1), 0.72);
  assert.equal(r.earnedFor(71.95, 1.5), 1.08);
  assert.equal(r.earnedFor(0, 2), 0);
});

test('lo pagado con NinaCash no genera NinaCash pero sí cuenta para el nivel', () => {
  const o = order({
    transactions: [
      { kind: 'SALE', status: 'SUCCESS', gateway: 'shopify_store_credit', amountSet: money(20) },
      { kind: 'SALE', status: 'SUCCESS', gateway: 'paypal', amountSet: money(84.95) },
    ],
  });
  assert.deepEqual(r.orderAmounts(o), { amount: 100, eligible: 80, counts: true });
});

test('cancelados, sin pagar o devueltos del todo no cuentan', () => {
  assert.equal(r.orderAmounts(order({ cancelledAt: '2026-11-14T10:00:00Z' })).counts, false);
  assert.equal(r.orderAmounts(order({ displayFinancialStatus: 'PENDING' })).counts, false);
  assert.equal(r.orderAmounts(order({ displayFinancialStatus: 'REFUNDED' })).counts, false);
  assert.equal(r.orderAmounts(order({ displayFinancialStatus: 'PARTIALLY_REFUNDED', currentSubtotalPriceSet: money(40) })).amount, 40);
});

test('se suma 14 días después de la entrega (o del envío + 3 días)', () => {
  assert.equal(r.releaseDate(order()), null);
  const d = r.releaseDate(order({ fulfillments: [{ status: 'SUCCESS', createdAt: '2026-11-01T10:00:00Z', deliveredAt: '2026-11-03T10:00:00Z' }] }));
  assert.equal(d.toISOString(), '2026-11-17T10:00:00.000Z');
  const e = r.releaseDate(order({ fulfillments: [{ status: 'SUCCESS', createdAt: '2026-11-01T10:00:00Z', deliveredAt: null }] }));
  assert.equal(e.toISOString(), '2026-11-18T10:00:00.000Z');
});

test('códigos y mes', () => {
  assert.equal(r.monthKey(new Date('2026-11-30T23:30:00Z')), '2026-12');
  assert.match(r.makeCode('GLAM', new Date('2026-11-14T12:00:00Z')), /^GLAM-NOV-[A-Z2-9]{5}$/);
  assert.equal(r.cleanCode(' glam 15! '), 'GLAM15');
});

test('formulario de cupón por nivel', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const ok = parseCouponForm({ codigo: 'glam15', valor: '15', tipo: 'porcentaje', niveles: ['4', '3'], desde: '2026-11-16', hasta: '2026-11-22' }, now);
  assert.equal(ok.code, 'GLAM15');
  assert.deepEqual(ok.levels, [3, 4]);
  assert.equal(ok.endsAt.toISOString(), '2026-11-22T22:59:59.000Z');
  assert.equal(parseCouponForm({ codigo: 'glam15', valor: '15', niveles: '2' }, now).endsAt.toISOString(), '2026-11-21T12:00:00.000Z');
  assert.ok(parseCouponForm({ codigo: 'X', valor: '15', niveles: '1' }).error);
  assert.ok(parseCouponForm({ codigo: 'GLAM15', valor: '15' }).error);
  assert.ok(parseCouponForm({ codigo: 'GLAM15', valor: '95', niveles: '1' }).error);
});

test('por defecto se suma al pagar', () => {
  assert.equal(r.IMMEDIATE, true);
  assert.equal(r.creditDate(order({ processedAt: '2026-11-14T10:00:00Z' })).toISOString(), '2026-11-14T10:00:00.000Z');
  assert.equal(r.creditDate(order(), false), null);
});

import { groupExpiring, stageFor, reminderEmail } from '../src/loyalty/expiry.js';
test('avisos de caducidad: agrupa por día lo que queda y elige el aviso', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const tx = [
    { expiresAt: '2026-11-20T10:00:00Z', remainingAmount: { amount: '1.20' } },
    { expiresAt: '2026-11-20T18:00:00Z', remainingAmount: { amount: '0.80' } },
    { expiresAt: '2026-12-10T10:00:00Z', remainingAmount: { amount: '3.00' } },
    { expiresAt: '2026-11-18T10:00:00Z', remainingAmount: { amount: '0' } },
    { expiresAt: '2027-03-01T10:00:00Z', remainingAmount: { amount: '5' } },
    {},
  ];
  const g = groupExpiring(tx, now);
  assert.deepEqual(g.map((x) => [x.day, x.amount]), [['2026-11-20', 2], ['2026-12-10', 3]]);
  assert.equal(stageFor(g[0].days), 7);
  assert.equal(stageFor(g[1].days), 30);
  assert.equal(stageFor(40), null);
  const m = reminderEmail({ name: 'Ana', amount: 2, day: '2026-11-20', stage: 7 });
  assert.match(m.subject, /2,00 €/);
  assert.match(m.html, /20 de noviembre/);
});
