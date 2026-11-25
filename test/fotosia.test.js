import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholder, needsPhoto, slug, fileName, sizeOf, pickImage, buildPrompt, extFor } from '../src/fotosia/rules.js';

const p = { title: 'Givenchy L\'Interdit Élixir Eau de Parfum', vendor: 'Givenchy', variants: [{ title: '80ml', sku: '3274872511798' }] };

test('detecta las fotos provisionales', () => {
  assert.ok(isPlaceholder('https://cdn.shopify.com/s/files/1/x/files/NinaBeauty_rrss_rosa.png?v=1'));
  assert.ok(isPlaceholder('https://cdn.shopify.com/s/files/1/x/files/sin-foto_2a289bf3.png?v=1'));
  assert.ok(isPlaceholder('https://x/no_image_available.webp'));
  assert.ok(!isPlaceholder('https://cdn.shopify.com/s/files/1/x/files/3349668576128_1.webp?v=1'));
  assert.ok(needsPhoto({ media: [{ url: 'https://x/files/sin-foto.png' }] }));
  assert.ok(needsPhoto({ media: [] }));
  assert.ok(!needsPhoto({ media: [{ url: 'https://x/files/sin-foto.png' }, { url: 'https://x/files/123.webp' }] }));
});

test('nombre de archivo para Google', () => {
  assert.equal(slug('Hermès Terre D´Hermes & Co'), 'hermes-terre-d-hermes-y-co');
  assert.equal(sizeOf(p), '80ml');
  assert.equal(fileName(p), 'givenchy-l-interdit-elixir-eau-de-parfum-80ml.png');
  assert.equal(fileName({ title: 'Eau de Rochas', vendor: 'Rochas', variants: [{ title: 'Único' }] }, 'webp'), 'rochas-eau-de-rochas.webp');
  assert.equal(extFor('image/jpeg'), 'jpg');
});

test('elige una foto grande y descarta bancos de imágenes', () => {
  const r = pickImage([
    { original: 'https://www.shutterstock.com/a.jpg', title: 'Givenchy', original_width: 2000, original_height: 2000 },
    { original: 'https://tienda.es/small.jpg', title: 'perfume', original_width: 300, original_height: 300 },
    { original: 'https://tienda.es/big.jpg', title: 'Givenchy Interdit', original_width: 1000, original_height: 1000 },
  ], p);
  assert.equal(r.original, 'https://tienda.es/big.jpg');
  assert.equal(pickImage([], p), null);
});

test('el prompt pide no tocar el producto ni la etiqueta', () => {
  const s = buildPrompt(p);
  assert.match(s, /80ml/);
  assert.match(s, /every word printed on the label/);
  assert.match(s, /pure white/);
});

test('petición a Nano Banana 2 a 1K, cuadrada', async () => {
  const { requestBody } = await import('../src/fotosia/magnific.js');
  const b = requestBody('https://x/ref/1', 'image/jpeg', 'hola');
  assert.deepEqual(b.reference_images, [{ image: 'https://x/ref/1', mime_type: 'image/jpeg' }]);
  assert.equal(b.resolution, '1K');
  assert.equal(b.aspect_ratio, '1:1');
});
