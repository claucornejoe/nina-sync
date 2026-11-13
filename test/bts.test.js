import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BTS_TOKEN = 'x';
const { fetchCatalog } = await import('../src/bts.js');

test('un lote sin productos (404 «no products found») no rompe la sincronización', async () => {
  let call = 0;
  globalThis.fetch = async () => {
    call++;
    if (call === 1) return new Response('{"name":"Not Found","message":"no products found","code":0,"status":404}', { status: 404 });
    return new Response(JSON.stringify([{ ean: '1', price: '10.00€', recommended_price: '20.00€', stock: 5 }]), { status: 200 });
  };
  const eans = Array.from({ length: 26 }, (_, i) => String(i + 1));
  const m = await fetchCatalog(eans.reverse());
  assert.equal(m.size, 1);
});

test('otros 404 siguen siendo error', async () => {
  globalThis.fetch = async () => new Response('Not here', { status: 404 });
  await assert.rejects(() => fetchCatalog(['1']), /404/);
});
