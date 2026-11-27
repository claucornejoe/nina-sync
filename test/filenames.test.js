import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, currentName, planProduct } from '../src/seo/filenames.js';

const cdn = (n) => `https://cdn.shopify.com/s/files/1/1019/1378/8729/files/${n}?v=1794453299`;

test('slug en minúsculas, sin tildes y con guiones', () => {
  assert.equal(slugify("Hermès L'Interdit Eau de Parfum 35ml"), 'hermes-l-interdit-eau-de-parfum-35ml');
  assert.equal(slugify('Ardell Magnetic Liner & Lash Pestañas Postizas Wispies '), 'ardell-magnetic-liner-y-lash-pestanas-postizas-wispies');
  assert.ok(slugify('a '.repeat(80)).length <= 90);
});

test('nombre actual y extensión desde la URL', () => {
  assert.deepEqual(currentName(cdn('3349668576128_1.webp')), { name: '3349668576128_1.webp', stem: '3349668576128_1', ext: '.webp' });
});

test('renombra con el texto alternativo, numera repetidas y no toca el logo', () => {
  const used = new Set();
  const p = {
    title: 'Ardell Magnetic Lashes',
    media: [
      { id: 'gid://shopify/MediaImage/1', alt: 'Ardell Magnetic Lashes 110', url: cdn('0074764622167_1.webp') },
      { id: 'gid://shopify/MediaImage/2', alt: 'Ardell Magnetic Lashes 110', url: cdn('0074764622181_1.webp') },
      { id: 'gid://shopify/MediaImage/3', alt: '', url: cdn('foto.JPG') },
      { id: 'gid://shopify/MediaImage/4', alt: 'x', url: cdn('NinaBeauty_rrss_rosa.png') },
      { id: 'gid://shopify/MediaImage/5', alt: 'x', url: cdn('sin-foto_2a289bf3.png') },
      { id: 'gid://shopify/MediaImage/6', alt: 'x', url: cdn('no_image.webp') },
    ],
  };
  assert.deepEqual(
    planProduct(p, used).map((x) => x.filename),
    ['ardell-magnetic-lashes-110.webp', 'ardell-magnetic-lashes-110-2.webp', 'ardell-magnetic-lashes.jpg'],
  );
});

test('las que ya tienen el nombre se dejan como están', () => {
  const used = new Set();
  const p = { title: 'Tous Eau de Parfum', media: [{ id: 'm1', alt: 'Tous Eau de Parfum 30ml', url: cdn('tous-eau-de-parfum-30ml.webp') }] };
  assert.deepEqual(planProduct(p, used), []);
  // Otro producto con el mismo texto alternativo recibe -2.
  const q = { title: 'Tous Eau de Parfum', media: [{ id: 'm2', alt: 'Tous Eau de Parfum 30ml', url: cdn('8436038830128.webp') }] };
  assert.equal(planProduct(q, used)[0].filename, 'tous-eau-de-parfum-30ml-2.webp');
});
