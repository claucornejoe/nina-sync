import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWelcomeEmail } from '../src/welcome/email.js';
import { isSubscribed, pickNew } from '../src/welcome/index.js';

test('el correo de bienvenida lleva el cupón, el blog, el foro y la baja', () => {
  const m = renderWelcomeEmail({ firstName: 'Ana <b>', storeUrl: 'https://www.ninabeauty.es/', logoUrl: 'https://x/logo.png', unsubscribeUrl: 'https://www.ninabeauty.es/account/unsubscribe?token=abc' });
  assert.match(m.subject, /3 €/);
  assert.match(m.html, /BIENVENIDA3/);
  assert.match(m.html, /\/discount\/BIENVENIDA3\?redirect=%2Fcollections%2Fall|\/discount\/BIENVENIDA3\?redirect=\/collections\/all/);
  assert.match(m.html, /\/blogs\/nina-blog/);
  assert.match(m.html, /\/apps\/foro/);
  assert.match(m.html, /account\/unsubscribe\?token=abc/);
  assert.match(m.html, /DEVSECUP SPA/);
  assert.ok(!m.html.includes('Ana <b>'), 'el nombre va escapado');
  assert.match(m.text, /BIENVENIDA3/);
});

test('solo cuenta como suscrita si Shopify dice SUBSCRIBED', () => {
  assert.equal(isSubscribed({ defaultEmailAddress: { emailAddress: 'a@b.es', marketingState: 'SUBSCRIBED' } }), true);
  assert.equal(isSubscribed({ defaultEmailAddress: { emailAddress: 'a@b.es', marketingState: 'NOT_SUBSCRIBED' } }), false);
  assert.equal(isSubscribed({ defaultEmailAddress: null }), false);
});

test('no repite a quien ya se le escribió', () => {
  const r = pickNew([{ id: '1' }, { id: '2' }], ['1']);
  assert.deepEqual(r.map((c) => c.id), ['2']);
});
