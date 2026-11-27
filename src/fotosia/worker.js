// «Fotos con IA»: buscar foto por EAN → Nano Banana (Magnific) → revisar → subir a Shopify con el nombre del producto.
import crypto from 'node:crypto';
import * as store from './store.js';
import * as sh from './shopify.js';
import { needsPhoto, isPlaceholder, buildPrompt, fileName, extFor, sizeOf, altOf } from './rules.js';
import { findImage, download } from './source.js';
import { generate, magnificKey } from './magnific.js';
import { slugify, currentName } from '../seo/filenames.js';
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
  const prev = await store.get(p.id);
  // La copia anterior que no llegó a la tienda ya no sirve (se repite la foto).
  if (prev?.file_id && prev.status !== 'subida') await sh.deleteFile(prev.file_id).catch((e) => console.error('Fotos IA: no pude borrar la copia anterior:', e.message));
  await store.upsert({ productId: p.id, title: p.title, ean, handle: p.handle, beforeUrl: p.media[0]?.url || '', vendor: p.vendor });
  await store.set(p.id, { status: 'generando' });
  try {
    const src = sourceUrl
      ? { original: sourceUrl, link: sourceUrl, query: 'elegida a mano', ok: true, why: '' }
      : await findImage(p, ean, sizeOf(p));
    if (src) await store.set(p.id, { source_url: src.original, source_page: src.link || '', source_query: src.query || '', source_title: src.title || '' });
    if (!src || (!src.ok && !force)) {
      // Dudosa: no se gastan créditos de Magnific. Va al listado para que Clau la busque a mano.
      await store.set(p.id, { status: 'dudosa', doubt: src?.why || 'No encontré ninguna foto' });
      return 'dudosa';
    }
    const { buf, type } = await download(src.original);
    const mime = /png|webp|jpe?g/.test(type) ? type.split(';')[0].replace('image/jpg', 'image/jpeg') : 'image/jpeg';
    if (!publicBase()) throw Object.assign(new Error('Falta PUBLIC_URL en Railway'), { fatal: true });
    const { url, model } = await generate(share(buf, mime), mime, buildPrompt(p));
    await store.set(p.id, { result_url: url, model, filename: fileName(p, 'png'), doubt: src.ok ? null : src.why });
    // Copia en Shopify al momento: el enlace de Magnific caduca y la foto dejaba de verse en el panel.
    try {
      const kept = await keep(p, url);
      await store.set(p.id, { ...kept, status: 'lista', error: null });
    } catch (e) {
      await store.set(p.id, { status: 'lista', error: `Magnific la hizo, pero no pude guardar una copia (${e.message.slice(0, 200)}). Súbela ya o pulsa «Repetir»: su enlace caduca.` });
    }
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

/**
 * Descarga la foto de Magnific (sin clave y, si da 401/403, con la clave de la API; reintenta los fallos de red).
 * Sus enlaces caducan: hay que bajarla en cuanto está hecha.
 */
async function fetchResult(url) {
  let last = '';
  for (let i = 0; i < 4; i++) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (NinaSync)', ...(i % 2 && magnificKey() ? { 'x-magnific-api-key': magnificKey() } : {}) };
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), type: (res.headers.get('content-type') || 'image/png').split(';')[0] };
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`No pude descargar la foto de Magnific (${last})`);
}

/** Guarda la foto nueva en Archivos de Shopify con el nombre del producto. */
async function keep(p, url) {
  const { buf, type } = await fetchResult(url);
  const filename = fileName(p, extFor(type));
  const f = await sh.keepFile(buf, filename, type, altOf(p));
  return { file_id: f.id, kept_url: f.url || null, filename };
}

const uploading = new Set();

/** Pone la foto aprobada en el producto (con el nombre del producto) y quita el logo. */
export async function upload(productId) {
  if (uploading.has(productId)) return; // doble clic
  uploading.add(productId);
  try {
    const row = await store.get(productId);
    if (row?.status === 'subida') return;
    if (!row?.file_id && !row?.result_url) throw new Error('Esta foto aún no está lista');
    const p = await sh.getProduct(productId);
    if (!p) throw new Error('Producto no encontrado');
    const placeholders = p.media.filter((m) => isPlaceholder(m.url)).map((m) => m.id);
    if (row.file_id) {
      await sh.attachFile(p.id, row.file_id, placeholders);
      const url = row.kept_url || (await sh.fileUrl(row.file_id));
      await store.set(productId, { status: 'subida', error: null, shopify_url: url || null, kept_url: url || null });
      return;
    }
    // Fotos hechas antes de guardar copia: solo se pueden subir mientras el enlace de Magnific siga vivo.
    let got;
    try {
      got = await fetchResult(row.result_url);
    } catch {
      throw new Error('El enlace de Magnific de esta foto ya caducó. Pulsa «Repetir» para hacerla de nuevo');
    }
    const name = fileName(p, extFor(got.type));
    const resourceUrl = await sh.stage(got.buf, name, got.type);
    await sh.attach(p.id, resourceUrl, altOf(p), placeholders);
    await store.set(productId, { status: 'subida', filename: name, error: null });
  } finally {
    uploading.delete(productId);
  }
}

/** Descarta una foto: si su copia no llegó a la tienda, se borra de Archivos. */
export async function discard(productId) {
  const row = await store.get(productId);
  if (row?.file_id && row.status !== 'subida') await sh.deleteFile(row.file_id).catch((e) => console.error('Fotos IA:', e.message));
  await store.set(productId, { status: 'descartada', file_id: null, kept_url: null });
}

/**
 * Repaso de las ya subidas (se hace al arrancar):
 * - guarda la URL de Shopify para enseñarla en el panel (la de Magnific caduca);
 * - corrige el texto alternativo si llevaba un tamaño falso («…Sg 100ml» en un estuche de 50);
 *   el renombrado nocturno de fotos para Google cambia luego el nombre del archivo a juego.
 */
export async function repairUploaded() {
  const rows = await store.uploadedWithoutUrl();
  let fixed = 0;
  for (const r of rows) {
    try {
      const p = await sh.getProduct(r.product_id);
      const m = p?.media.find((x) => x.url && !isPlaceholder(x.url));
      if (m) {
        const alt = altOf(p);
        if (m.alt && m.alt !== alt && slugify(m.alt).startsWith(slugify(p.title))) {
          await sh.setAlt(m.id, alt);
          fixed++;
        }
      }
      await store.set(r.product_id, { shopify_url: m?.url || '', filename: m ? currentName(m.url).name : r.filename });
    } catch (e) {
      console.error('Fotos IA (repaso de subidas):', r.title, e.message);
    }
  }
  if (rows.length) console.log(`Fotos IA: repasadas ${rows.length} fotos subidas · ${fixed} con el tamaño del nombre corregido`);
}
