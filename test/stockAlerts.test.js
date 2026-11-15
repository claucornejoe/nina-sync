import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStockEmail, productLink } from '../src/stockAlerts/email.js';
import { parseAlertRequest } from '../src/stockAlerts/routes.js';

const base = {
  productTitle: 'Carolina Herrera Good Girl Eau de Parfum',
  vendor: 'Carolina Herrera',
  variantTitle: '80ml',
  price: 139,
  compareAt: 144,
  imageUrl: 'https://cdn.shopify.com/x.webp?width=400',
  url: 'https://www.ninabeauty.es/products/good-girl?variant=1',
  lowStock: true,
  logoUrl: 'https://nina-sync.example/static/logo-correo.png',
};

test('correo: asunto, marca sin repetir y aviso de pocas unidades', () => {
  const m = renderStockEmail(base);
  assert.equal(m.subject, '¡Ha vuelto! Carolina Herrera Good Girl Eau de Parfum ya está disponible');
  assert.match(m.html, /Good Girl Eau de Parfum · 80ml/);
  assert.doesNotMatch(m.html, /Carolina Herrera Good Girl Eau de Parfum · 80ml/);
  assert.match(m.html, /Han llegado pocas unidades/);
  assert.match(m.html, /Lo quiero/);
  assert.match(m.text, /139,00 €/);
});

test('correo: con mucho stock no dice «pocas unidades»; tachado solo si ahorra 5 % o más', () => {
  const m = renderStockEmail({ ...base, lowStock: false });
  assert.doesNotMatch(m.html, /pocas unidades/);
  assert.match(m.html, /La última vez se agotó/);
  assert.doesNotMatch(m.html, /line-through/); // 144 vs 139 es menos de un 5 %
  assert.match(renderStockEmail({ ...base, compareAt: 170 }).html, /line-through/);
});

test('correo: escapa el HTML del nombre', () => {
  const m = renderStockEmail({ ...base, vendor: '', productTitle: '<b>X</b>' });
  assert.doesNotMatch(m.html, /<b>X<\/b>/);
});

test('enlace a la ficha con la variante y la marca de campaña', () => {
  const u = new URL(productLink('https://www.ninabeauty.es/products/good-girl', 'gid://shopify/ProductVariant/68057779667257'));
  assert.equal(u.searchParams.get('variant'), '68057779667257');
  assert.equal(u.searchParams.get('utm_source'), 'aviso-stock');
});

test('formulario: correo, casilla y variante', () => {
  assert.deepEqual(parseAlertRequest({ email: ' Ana@Gmail.com ', consent: true, variant_id: '68057779667257' }), {
    email: 'ana@gmail.com',
    variantId: 'gid://shopify/ProductVariant/68057779667257',
  });
  assert.ok(parseAlertRequest({ email: 'ana@gmail', consent: true, variant_id: '1' }).error);
  assert.ok(parseAlertRequest({ email: 'ana@gmail.com', variant_id: '1' }).error, 'sin casilla no se guarda');
  assert.ok(parseAlertRequest({ email: 'ana@gmail.com', consent: 'on', variant_id: 'abc' }).error);
  assert.ok(parseAlertRequest({ email: 'ana@gmail.com', consent: 'on', variant_id: '1', website: 'x' }).silent, 'campo trampa');
});

test('correo de Nina Skin Care: azul, sin rosa', () => {
  const m = renderStockEmail({ ...base, skinCare: true });
  assert.doesNotMatch(m.html, /#F72E75|#C92F60|#FFCCD5/i);
  assert.match(m.html, /#4F8496/);
});

import { categoryOf, btsReason } from '../src/stockAlerts/report.js';
import { insights } from '../src/stockAlerts/views.js';

test('informe: categoría por etiquetas', () => {
  assert.equal(categoryOf(['skin-care', 'sc-serum']), 'Skin care');
  assert.equal(categoryOf(['mq-labios']), 'Maquillaje');
  assert.equal(categoryOf(['Mujer', 'Eau de Parfum']), 'Perfumes mujer');
  assert.equal(categoryOf(['Hombre', 'Árabe']), 'Perfumes árabes');
  assert.equal(categoryOf([], 'Perfume'), 'Perfume');
});

test('informe: por qué está agotado según BTS', () => {
  const r = { minStock: 3, vat: 1.21, margin: 0.7, paypalFixed: 0.35, paypalNet: 0.911, shipping: 6, shippingPrice: 4.95, freeShippingFrom: 39, rounding: 'charm', minProfit: 2, minProfitAfterRounding: 0.5 };
  assert.equal(btsReason(null, r).code, 'sin-bts');
  assert.equal(btsReason({ stock: 0, cost: 20, rrp: 60 }, r).code, 'agotado');
  assert.equal(btsReason({ stock: 2, cost: 20, rrp: 60 }, r).code, 'pocas');
  assert.equal(btsReason({ stock: 9, cost: 50, rrp: 40 }, r).code, 'pierde');
  assert.equal(btsReason({ stock: 9, cost: 20, rrp: 60 }, r).code, 'vuelve');
});

test('informe: frases útiles', () => {
  const v = (o) => ({ product_title: 'Good Girl', variant_title: '80ml', n: 4, n7: 3, days: 12, reason: { code: 'pierde' }, ...o });
  const tips = insights({ variants: [v(), v({ reason: { code: 'sin-bts' } })], vendors: [{ name: 'Carolina Herrera' }], reasons: { pierde: 4 }, out: { enviados: 10, compraron: 3 } });
  assert.ok(tips.some((t) => /Good Girl/.test(t)));
  assert.ok(tips.some((t) => /precio-manual/.test(t)));
  assert.ok(tips.some((t) => /ya no lo vende/.test(t)));
  assert.ok(tips.some((t) => /3 acaban en compra/.test(t)));
});
