import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholder, needsPhoto, fileName, sizeOf, pickImage, buildPrompt, extFor, confidence, keyWords } from '../src/fotosia/rules.js';
import { doubtfulCsv } from '../src/fotosia/views.js';

const p = { title: "Givenchy L'Interdit Élixir Eau de Parfum", vendor: 'Givenchy', variants: [{ title: '80ml', sku: '3274872511798' }] };

test('detecta las fotos provisionales', () => {
  assert.ok(isPlaceholder('https://cdn.shopify.com/s/files/1/x/files/NinaBeauty_rrss_rosa.png?v=1'));
  assert.ok(isPlaceholder('https://cdn.shopify.com/s/files/1/x/files/sin-foto_2a289bf3.png?v=1'));
  assert.ok(isPlaceholder('https://x/no_image_available.webp'));
  assert.ok(!isPlaceholder('https://cdn.shopify.com/s/files/1/x/files/3349668576128_1.webp?v=1'));
  assert.ok(needsPhoto({ media: [{ url: 'https://x/files/sin-foto.png' }] }));
  assert.ok(needsPhoto({ media: [] }));
  assert.ok(!needsPhoto({ media: [{ url: 'https://x/files/sin-foto.png' }, { url: 'https://x/files/123.webp' }] }));
});

test('nombre de archivo = nombre del producto (igual que el renombrado para Google)', () => {
  assert.equal(sizeOf(p), '80ml');
  assert.equal(fileName(p), 'givenchy-l-interdit-elixir-eau-de-parfum-80ml.png');
  assert.equal(fileName({ title: 'Eau de Rochas', vendor: 'Rochas', variants: [{ title: 'Único' }] }, 'webp'), 'eau-de-rochas.webp');
  assert.equal(extFor('image/jpeg'), 'jpg');
});

test('foto segura solo si sale por EAN y nombra marca y producto', () => {
  assert.deepEqual(keyWords(p), ['interdit', 'elixir']);
  const good = { original: 'https://tienda.es/a.jpg', title: "Givenchy L'Interdit Elixir 80 ml", link: 'https://tienda.es/p', viaEan: true };
  assert.equal(confidence(good, p).ok, true);
  assert.match(confidence({ ...good, viaEan: false }, p).why, /EAN/);
  assert.match(confidence({ ...good, title: 'Perfume Interdit', link: 'https://x.es' }, p).why, /marca/);
  assert.match(confidence({ ...good, title: 'Givenchy Gentleman', link: 'https://x.es' }, p).why, /producto/);
  assert.equal(confidence(null, p).ok, false);
});

test('elige la foto segura y grande, y descarta bancos de imágenes', () => {
  const r = pickImage([
    { original: 'https://www.shutterstock.com/a.jpg', title: 'Givenchy Interdit Elixir', width: 2000, height: 2000 },
    { original: 'https://tienda.es/otro.jpg', title: 'perfume mujer', width: 1200, height: 1200 },
    { original: 'https://tienda.es/big.jpg', title: 'Givenchy Interdit Elixir', width: 800, height: 800 },
  ], p, true);
  assert.equal(r.original, 'https://tienda.es/big.jpg');
  assert.equal(pickImage([], p, true), null);
});

test('prompt de Clau con nombre, 1:1, fondo blanco para Google Shopping y alejar 20 %', () => {
  const s = buildPrompt(p);
  assert.match(s, /^Commercial e-commerce product photography of "Givenchy L'Interdit Élixir Eau de Parfum 80ml" @img1\./);
  assert.match(s, /curved and rounded bottoms/);
  assert.match(s, /White studio background optimized for Google Shopping/);
  assert.match(s, /1:1/);
  assert.match(s, /zoom out by about 20%/);
});

test('petición a Magnific a 1K, cuadrada; prueba la 2.1 y luego la 2', async () => {
  const { requestBody, candidates } = await import('../src/fotosia/magnific.js');
  const b = requestBody('https://x/ref/1', 'image/jpeg', 'hola');
  assert.deepEqual(b.reference_images, [{ image: 'https://x/ref/1', mime_type: 'image/jpeg' }]);
  assert.equal(b.resolution, '1K');
  assert.equal(b.aspect_ratio, '1:1');
  assert.deepEqual(candidates().map((m) => m.label), ['Nano Banana 2.1', 'Nano Banana 2.1', 'Nano Banana 2']);
});

test('listado de dudosas en CSV para Excel', () => {
  const csv = doubtfulCsv([{ vendor: 'Givenchy', title: 'X "Y"', ean: '1', doubt: 'No nombra la marca', source_url: 'a', source_page: 'b', product_id: 'gid://shopify/Product/123' }]);
  assert.ok(csv.startsWith('﻿"Marca";'));
  assert.match(csv, /"X ""Y"""/);
  assert.match(csv, /products\/123"/);
});
