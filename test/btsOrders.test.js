import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBtsOrder, createOrderParams, pickShipping, normalizePhone, trackingUrl } from '../src/btsOrders/build.js';
import { explain } from '../src/btsOrders/engine.js';

const order = (over = {}) => ({
  id: 'gid://shopify/Order/1',
  name: '#1001',
  shippingAddress: { name: 'Ana López', address1: 'Calle Mayor 15', address2: '2ºB', zip: '28001', city: 'Madrid', countryCodeV2: 'ES', phone: '600 123 456' },
  lineItems: {
    nodes: [
      { name: 'Good Girl 30 ml', quantity: 1, currentQuantity: 1, variant: { sku: '8411061041673' } },
      { name: 'Good Girl 30 ml', quantity: 1, currentQuantity: 1, variant: { sku: '8411061041673' } },
      { name: 'Camiseta Nina', quantity: 1, currentQuantity: 1, variant: { sku: 'CAM-NINA-M' } },
      { name: 'Quitado', quantity: 1, currentQuantity: 0, variant: { sku: '3349668576128' } },
    ],
  },
  ...over,
});

test('pedido BTS: junta cantidades, aparta lo que no es de BTS y arma la dirección', () => {
  const b = buildBtsOrder(order());
  assert.equal(b.ok, true);
  assert.deepEqual(b.lines.map((l) => [l.sku, l.quantity]), [['8411061041673', 2]]);
  assert.deepEqual(b.other.map((l) => l.name), ['Camiseta Nina']);
  assert.equal(b.address.address, 'Calle Mayor 15, 2ºB');
  assert.equal(b.address.telephone, '+34600123456');
  const p = new URLSearchParams(createOrderParams(b, 145)).toString();
  assert.match(p, /payment_method=wallet/);
  assert.match(p, /products%5B0%5D%5Bsku%5D=8411061041673/);
  assert.match(p, /products%5B0%5D%5Bquantity%5D=2/);
  assert.match(p, /shipping_cost_id=145/);
  assert.match(p, /dropshipping=1/);
});

test('pedido BTS: no se puede enviar sin teléfono, fuera de España o cancelado', () => {
  const sinTel = buildBtsOrder(order({ shippingAddress: { ...order().shippingAddress, phone: '' } }));
  assert.equal(sinTel.ok, false);
  assert.match(sinTel.problems.join(), /teléfono/);
  assert.equal(buildBtsOrder(order({ shippingAddress: { ...order().shippingAddress, countryCodeV2: 'FR' } })).ok, false);
  assert.equal(buildBtsOrder(order({ cancelledAt: '2026-11-27' })).ok, false);
  assert.equal(buildBtsOrder(order({ phone: '611222333', shippingAddress: { ...order().shippingAddress, phone: null } })).ok, true);
});

test('pedido BTS: elige el envío más barato y tiene en cuenta el envío gratis', () => {
  const rates = [
    { id: 145, delivery_time: 3, company_name: 'SEUR', shipping_cost: 7.5, free_shipping: 150 },
    { id: 148, delivery_time: 5, company_name: 'GLS', shipping_cost: 5.99, free_shipping: 200 },
  ];
  assert.equal(pickShipping(rates, 40).id, 148);
  assert.equal(pickShipping(rates, 160).id, 145);
  assert.equal(pickShipping([], 10), null);
});

test('pedido BTS: teléfonos, enlaces de seguimiento y mensajes de error claros', () => {
  assert.equal(normalizePhone('0034 611 22 33 44'), '+34611223344');
  assert.equal(normalizePhone('+351 912 345 678', 'PT'), '+351912345678');
  assert.match(trackingUrl('GLS', 'GLS-9876543210'), /gls-group.*9876543210/);
  assert.equal(trackingUrl('Otra', '1'), null);
  assert.match(explain('BTS setCreateOrder respondió 400: {"error":"no_enough_money"}'), /saldo/);
});
