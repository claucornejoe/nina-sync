import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ruleCategory, PERFUME_CATEGORIES as P, googleGender, isGtin } from '../src/seo/categories.js';
import { renderDescription, isReplaceable, cleanText, buildPrompt } from '../src/seo/describe.js';
import { needs } from '../src/seo/worker.js';
import { verifyHmac, parseProductId } from '../src/seo/routes.js';
import { outputText } from '../src/seo/openai.js';

const good = {
  id: 'gid://shopify/Product/1',
  title: 'Carolina Herrera Good Girl Eau de Parfum',
  vendor: 'Carolina Herrera',
  productType: 'Perfume',
  tags: ['Carolina Herrera', 'Eau de Parfum', 'Mujer'],
  descriptionHtml: '<p><strong>Carolina Herrera Good Girl Eau de Parfum</strong> es un eau de parfum para mujer de Carolina Herrera, 100 % original.</p><ul><li>Producto original con su caja precintada.</li><li>Envío gratis a la península y Baleares.</li></ul>',
  category: null,
  google: {},
  variants: [
    { id: 'v1', title: '30ml', sku: '8411061041673', barcodes: ['8411061041673'] },
    { id: 'v2', title: '50ml', sku: '8411061026250', barcodes: [] },
  ],
};

test('categoría de perfumes por reglas', () => {
  assert.equal(ruleCategory(good).id, P.edp.id);
  assert.equal(ruleCategory({ ...good, title: 'Paco Rabanne Black XS Eau de Toilette', tags: ['Eau de Toilette', 'Hombre'] }).id, P.edt.id);
  assert.equal(ruleCategory({ ...good, title: 'Victoria Secret Bare Vanilla Body Mist', tags: ['Body Mist', 'Mujer'] }).id, P.bodyMist.id);
  assert.equal(ruleCategory({ ...good, title: 'Le Male Eau de Toilette Estuche', tags: ['Estuche', 'Hombre'] }).id, P.edt.id);
  assert.equal(ruleCategory({ ...good, title: 'Dior Sauvage Elixir', tags: ['Parfum'] }).id, P.extract.id);
  assert.equal(ruleCategory({ ...good, title: 'Máscara de pestañas', productType: 'Maquillaje', tags: ['Maybelline'] }), null);
});

test('género de Google y EAN', () => {
  assert.equal(googleGender(['Mujer']), 'female');
  assert.equal(googleGender(['Hombre']), 'male');
  assert.equal(googleGender(['Unisex', 'Mujer']), 'unisex');
  assert.equal(isGtin('8411061026250'), true);
  assert.equal(isGtin('8411061026251'), false);
});

test('la plantilla se sustituye y lo escrito a mano no', () => {
  assert.equal(isReplaceable(good.descriptionHtml), true);
  assert.equal(isReplaceable(''), true);
  assert.equal(isReplaceable('<p>Mi descripción propia</p>'), false);
});

test('qué le falta a un producto', () => {
  const n = needs(good);
  assert.equal(n.category, true);
  assert.equal(n.google, true);
  assert.deepEqual(n.barcodes.map((v) => v.id), ['v2']);
  assert.equal(needs({ ...good, tags: [...good.tags, 'seo-manual'] }).any, false);
});

test('la descripción no lleva precios, envíos ni la tienda', () => {
  const html = renderDescription(good, {
    intro: 'Un perfume floral oriental y seductor. ¡Envío gratis en 24 h! Compra ya al mejor precio en Nina Beauty.',
    familia_olfativa: 'Oriental floral',
    notas_salida: ['almendra', 'café'],
    notas_corazon: ['nardo', 'jazmín sambac'],
    notas_fondo: ['haba tonka', 'cacao'],
    detalles: ['Frasco con forma de tacón de aguja', 'Precio especial'],
    seguro: true,
  });
  assert.match(html, /Un perfume floral oriental y seductor\./);
  assert.doesNotMatch(html, /env[ií]o|gratis|compra|precio|Nina Beauty/i);
  assert.match(html, /<strong>Notas de corazón:<\/strong> nardo, jazmín sambac/);
  assert.match(html, /Tamaños:<\/strong> 30 ml, 50 ml/);
  assert.match(html, /tacón de aguja/);
});

test('si la IA no está segura, no pone notas', () => {
  const html = renderDescription(good, { intro: '', familia_olfativa: 'Floral', notas_salida: ['rosa'], notas_corazon: [], notas_fondo: [], detalles: [], seguro: false });
  assert.doesNotMatch(html, /Notas|Familia/);
  assert.match(html, /<p>Carolina Herrera Good Girl Eau de Parfum, eau de parfum para mujer de Carolina Herrera\.<\/p>/);
});

test('texto y prompt', () => {
  assert.equal(cleanText('Fresco y luminoso. Oferta limitada.'), 'Fresco y luminoso.');
  const { user, system } = buildPrompt(good, { webSearch: true });
  assert.match(user, /Tamaños: 30ml, 50ml/);
  assert.match(system, /búscalas en internet/);
});

test('firma del webhook y número de producto', () => {
  const raw = Buffer.from('{"id":1}');
  const sig = crypto.createHmac('sha256', 's3cr3t').update(raw).digest('base64');
  assert.equal(verifyHmac(raw, sig, 's3cr3t'), true);
  assert.equal(verifyHmac(raw, sig, 'otro'), false);
  assert.equal(parseProductId('https://admin.shopify.com/store/ikwg4h-mk/products/15454779539769'), 'gid://shopify/Product/15454779539769');
  assert.equal(parseProductId('hola'), null);
});

test('lee el texto de la respuesta de OpenAI', () => {
  assert.equal(outputText({ output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: '{"a":1}' }] }] }), '{"a":1}');
});

test('detecta la foto «No image available»', async () => {
  const { isPlaceholderUrl, placeholderMedia } = await import('../src/seo/images.js');
  assert.equal(isPlaceholderUrl('https://cdn.shopify.com/s/files/1/1019/1378/8729/files/no_image_5197e856-1e2b-47eb-b122-32c4cd31d17f.webp?v=1794460915'), true);
  assert.equal(isPlaceholderUrl('https://images.btswholesaler.com/imgs/productos_cosmetica/imagenes/no_image.webp'), true);
  assert.equal(isPlaceholderUrl('https://cdn.shopify.com/s/files/1/files/3349668576128.webp?v=1'), false);
  assert.deepEqual(placeholderMedia({ media: [{ id: 'm1', url: 'https://x/files/no_image_a.webp' }, { id: 'm2', url: 'https://x/files/123.webp' }] }).map((m) => m.id), ['m1']);
});
