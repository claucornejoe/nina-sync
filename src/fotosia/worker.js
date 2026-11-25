// «Fotos con IA»: buscar foto en la web → Nano Banana (Magnific) → Clau revisa → subir a Shopify.
import * as store from './store.js';
import * as sh from './shopify.js';
import { needsPhoto, isPlaceholder, buildPrompt, fileName, extFor, sizeOf } from './rules.js';
import { findImage, download } from './source.js';
import { generate } from './magnific.js';
import { publicBase } from '../seo/settings.js';
import crypto from 'node:crypto';

// Magnific necesita la foto en una URL pública: Nina Sync la sirve unos minutos en /fotos-ia/ref/<token>
// (así no dependemos de que la web de origen deje enlazar sus fotos).
export const refs = new Map();
function share(buf, type) {
  const token = crypto.randomBytes(16).toString('hex');
  refs.set(token, { buf, type });
  setTimeout(() => refs.delete(token), 15 * 60_000).unref?.();
  return `${publicBase()}/fotos-ia/ref/${token}`;
}

export const state = { running: false, done: 0, total: 0, note: '', stopped: '' };

const eanOf = (p) => p.variants.map((v) => v.sku).find((s) => /^\d{8,14}$/.test(s)) || '';

/** Busca hasta `limit` productos activos que solo tengan el logo y que aún no se hayan probado. */
export async function pickCandidates(limit) {
  const seen = await store.known();
  const out = [];
  for await (const p of sh.allProducts()) {
    if (seen.has(p.id) || !needsPhoto(p) || !eanOf(p)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Hace la foto de un producto. `sourceUrl` permite a Clau elegir otra foto de partida. */
export async function processOne(p, { sourceUrl } = {}) {
  const ean = eanOf(p);
  await store.upsert({ productId: p.id, title: p.title, ean, handle: p.handle, beforeUrl: p.media[0]?.url || '' });
  await store.set(p.id, { status: 'generando' });
  try {
    let src = sourceUrl ? { original: sourceUrl, link: sourceUrl, query: 'elegida a mano' } : await findImage(p, ean, sizeOf(p));
    if (!src) throw new Error('No encontré ninguna foto del producto en Google Imágenes');
    await store.set(p.id, { source_url: src.original, source_page: src.link || '', source_query: src.query || '' });
    const { buf, type } = await download(src.original);
    const mime = /png|webp|jpe?g/.test(type) ? type.split(';')[0].replace('image/jpg', 'image/jpeg') : 'image/jpeg';
    if (!publicBase()) throw Object.assign(new Error('Falta PUBLIC_URL en Railway'), { fatal: true });
    const result = await generate(share(buf, mime), mime, buildPrompt(p));
    await store.set(p.id, { result_url: result, filename: fileName(p, 'png'), status: 'lista', error: null });
  } catch (e) {
    await store.set(p.id, { status: 'error', error: e.message.slice(0, 400) });
    if (e.fatal) throw e;
  }
}

export async function runBatch({ limit = 10, ids = [] } = {}) {
  if (state.running) return;
  Object.assign(state, { running: true, done: 0, total: 0, note: 'Buscando productos sin foto…', stopped: '' });
  try {
    const list = ids.length ? (await Promise.all(ids.map((id) => sh.getProduct(id)))).filter(Boolean) : await pickCandidates(limit);
    state.total = list.length;
    for (const p of list) {
      state.note = p.title;
      await processOne(p);
      state.done++;
    }
    state.note = '';
  } catch (e) {
    state.stopped = e.message;
    console.error('Fotos IA:', e.message);
  } finally {
    state.running = false;
  }
}

/** Repite un producto (opcionalmente con otra foto de partida que pega Clau). */
export async function redo(productId, sourceUrl) {
  const p = await sh.getProduct(productId);
  if (!p) throw new Error('Producto no encontrado');
  await processOne(p, { sourceUrl: sourceUrl || undefined });
}

/** Sube la foto aprobada a Shopify con el nombre para Google. */
export async function upload(productId) {
  const row = await store.get(productId);
  if (!row?.result_url) throw new Error('Esta foto aún no está lista');
  const p = await sh.getProduct(productId);
  if (!p) throw new Error('Producto no encontrado');
  const res = await fetch(row.result_url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`No pude descargar la foto de Magnific (HTTP ${res.status}); pulsa «Repetir»`);
  const type = (res.headers.get('content-type') || 'image/png').split(';')[0];
  const buf = Buffer.from(await res.arrayBuffer());
  const name = fileName(p, extFor(type));
  const resourceUrl = await sh.stage(buf, name, type);
  const alt = [p.title, sizeOf(p)].filter(Boolean).join(' ');
  await sh.attach(p.id, resourceUrl, alt, p.media.filter((m) => isPlaceholder(m.url)).map((m) => m.id));
  await store.set(productId, { status: 'subida', filename: name, error: null });
}
