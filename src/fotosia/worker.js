// «Fotos con IA»: buscar foto por EAN → Nano Banana (Magnific) → revisar → subir a Shopify con el nombre del producto.
import crypto from 'node:crypto';
import * as store from './store.js';
import * as sh from './shopify.js';
import { needsPhoto, isPlaceholder, buildPrompt, fileName, extFor, sizeOf, altOf } from './rules.js';
import { findImage, download } from './source.js';
import { generate } from './magnific.js';
import { publicBase } from '../seo/settings.js';
import { shopInfo } from '../shopify.js';

// Magnific necesita la foto en una URL pública: Nina Sync la sirve unos minutos en /fotos-ia/ref/<token>
// (así no dependemos de que la web de origen deje enlazar sus fotos).
export const refs = new Map();
function share(buf, type) {
  const token = crypto.randomBytes(16).toString('hex');
  refs.set(token, { buf, type });
  setTimeout(() => refs.delete(token), 15 * 60_000).unref?.();
  return `${publicBase()}/fotos-ia/ref/${token}`;
}

const CONCURRENCY = () => Math.max(1, Math.min(5, Number(process.env.FOTOS_IA_A_LA_VEZ) || 3));
export const state = { running: false, done: 0, total: 0, note: '', stopped: '', stop: false, auto: false, uploaded: 0, doubtful: 0, failed: 0, pending: null, counting: false };

const eanOf = (p) => p.variants.map((v) => v.sku).find((s) => /^\d{8,14}$/.test(s)) || '';

/** Productos activos que solo tienen el logo y aún no se han tratado (hasta `limit`). */
export async function pickCandidates(limit = Infinity) {
  const seen = await store.known();
  const out = [];
  for await (const p of sh.allProducts()) {
    if (seen.has(p.id) || !needsPhoto(p) || !eanOf(p)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Cuenta cuántos productos activos siguen solo con el logo (para el panel). */
export async function countPending() {
  if (state.counting) return;
  state.counting = true;
  try {
    let total = 0;
    let fresh = 0;
    const seen = await store.known();
    for await (const p of sh.allProducts()) {
      if (!needsPhoto(p)) continue;
      total++;
      if (!seen.has(p.id) && eanOf(p)) fresh++;
    }
    state.pending = { total, fresh, at: new Date() };
  } finally {
    state.counting = false;
  }
}

/**
 * Hace la foto de un producto.
 * - `sourceUrl`: foto de partida elegida a mano por Clau (se fía de ella).
 * - `force`: generar aunque la foto encontrada sea dudosa.
 * - `autoUpload`: si sale bien y la foto era segura, se sube sola a Shopify.
 */
export async function processOne(p, { sourceUrl, force = false, autoUpload = false } = {}) {
  const ean = eanOf(p);
  await store.upsert({ productId: p.id, title: p.title, ean, handle: p.handle, beforeUrl: p.media[0]?.url || '', vendor: p.vendor });
  await store.set(p.id, { status: 'generando' });
  try {
    const src = sourceUrl
      ? { original: sourceUrl, link: sourceUrl, query: 'elegida a mano', ok: true, why: '' }
      : await findImage(p, ean, sizeOf(p));
    if (src) await store.set(p.id, { source_url: src.original, source_page: src.link || '', source_query: src.query || '' });
    if (!src || (!src.ok && !force)) {
      // Dudosa: no se gastan créditos de Magnific. Va al listado para que Clau la busque a mano.
      await store.set(p.id, { status: 'dudosa', doubt: src?.why || 'No encontré ninguna foto' });
      return 'dudosa';
    }
    const { buf, type } = await download(src.original);
    const mime = /png|webp|jpe?g/.test(type) ? type.split(';')[0].replace('image/jpg', 'image/jpeg') : 'image/jpeg';
    if (!publicBase()) throw Object.assign(new Error('Falta PUBLIC_URL en Railway'), { fatal: true });
    const { url, model } = await generate(share(buf, mime), mime, buildPrompt(p));
    await store.set(p.id, { result_url: url, model, filename: fileName(p, 'png'), status: 'lista', error: null, doubt: src.ok ? null : src.why });
    if (autoUpload && src.ok) {
      await upload(p.id);
      return 'subida';
    }
    return 'lista';
  } catch (e) {
    await store.set(p.id, { status: 'error', error: e.message.slice(0, 400) });
    if (e.fatal) throw e;
    return 'error';
  }
}

/** Tanda: `limit` productos (o `ids` concretos). Con `autoUpload` sube solas las seguras. */
export async function runBatch({ limit = 10, ids = [], autoUpload = false } = {}) {
  if (state.running) return;
  Object.assign(state, { running: true, done: 0, total: 0, note: 'Buscando productos con logo…', stopped: '', stop: false, auto: autoUpload, uploaded: 0, doubtful: 0, failed: 0 });
  try {
    const shop = await shopInfo();
    if (!/ikwg4h-mk/.test(shop.myshopifyDomain)) throw new Error(`La tienda conectada es ${shop.myshopifyDomain}, no Nina Beauty. No se hace nada.`);
    const list = ids.length ? (await Promise.all(ids.map((id) => sh.getProduct(id)))).filter(Boolean) : await pickCandidates(limit);
    state.total = list.length;
    state.note = '';
    let i = 0;
    const worker = async () => {
      while (!state.stop && i < list.length) {
        const p = list[i++];
        const r = await processOne(p, { autoUpload });
        if (r === 'subida') state.uploaded++;
        else if (r === 'dudosa') state.doubtful++;
        else if (r === 'error') state.failed++;
        state.done++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY() }, worker));
    if (state.stop) state.stopped = 'Parada a mano';
  } catch (e) {
    state.stopped = e.message;
    state.stop = true;
    console.error('Fotos IA:', e.message);
  } finally {
    state.running = false;
    console.log(`Fotos IA: tanda terminada · ${state.done}/${state.total} · ${state.uploaded} subidas · ${state.doubtful} dudosas · ${state.failed} con error${state.stopped ? ' · ' + state.stopped : ''}`);
  }
}

export const stop = () => { state.stop = true; };

/** Repite un producto (opcionalmente con otra foto de partida que pega Clau, o forzando una dudosa). */
export async function redo(productId, sourceUrl, { force = false } = {}) {
  const p = await sh.getProduct(productId);
  if (!p) throw new Error('Producto no encontrado');
  await processOne(p, { sourceUrl: sourceUrl || undefined, force });
}

/** Sube la foto aprobada a Shopify con el nombre del producto. */
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
  await sh.attach(p.id, resourceUrl, altOf(p), p.media.filter((m) => isPlaceholder(m.url)).map((m) => m.id));
  await store.set(productId, { status: 'subida', filename: name, error: null });
}
