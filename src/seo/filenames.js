// Nombres de archivo de las fotos para Google: «marca-producto-tamano.webp» en vez del EAN de BTS.
// El nombre sale del texto alternativo de la foto (o del título del producto si no tiene).
// Las fotos de «sin foto» (logo de Nina y no_image de BTS) no se tocan.
// Se repasa al arrancar y cada noche, así las fotos de los productos nuevos también quedan con nombre.
import { gql, shopInfo } from '../shopify.js';
import { isPlaceholderUrl } from './images.js';

export const filenamesAuto = () => process.env.FOTOS_NOMBRE_AUTO !== 'false';
export const filenamesCron = () => process.env.FOTOS_NOMBRE_CRON || '20 4 * * *';
const BATCH = 25;
const MAX_LEN = 90;

const isLogo = (url) => isPlaceholderUrl(url) || /sin-foto|NinaBeauty_rrss/i.test(String(url || ''));

/** «Hermès L'Interdit 50ml & Co» → «hermes-l-interdit-50ml-y-co». */
export function slugify(s) {
  const base = String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= MAX_LEN) return base;
  return base.slice(0, MAX_LEN).replace(/-[^-]*$/, '') || base.slice(0, MAX_LEN);
}

/** Nombre actual y extensión a partir de la URL del CDN. */
export function currentName(url) {
  const last = decodeURIComponent(String(url || '').split('?')[0].split('/').pop() || '');
  const m = last.match(/^(.*?)(\.[a-z0-9]+)$/i);
  return m ? { name: last, stem: m[1], ext: m[2].toLowerCase() } : { name: last, stem: last, ext: '' };
}

/**
 * Decide los cambios de un producto. `used` guarda los nombres ya ocupados en toda la tienda.
 * Devuelve [{ id, filename, from }] (solo las fotos que hay que renombrar).
 */
export function planProduct(p, used) {
  const out = [];
  for (const m of p.media || []) {
    if (!m.url || isLogo(m.url)) continue;
    const { name, stem, ext } = currentName(m.url);
    if (!ext) continue;
    const slug = slugify(m.alt || p.title) || slugify(p.title);
    if (!slug) continue;
    // Ya tiene un nombre del formato (slug o slug-N): se deja.
    if (new RegExp(`^${slug}(-\\d+)?$`).test(stem) && !used.has(name)) {
      used.add(name);
      continue;
    }
    let n = 1;
    let target = slug + ext;
    while (used.has(target)) target = `${slug}-${++n}${ext}`;
    used.add(target);
    out.push({ id: m.id, filename: target, from: name });
  }
  return out;
}

const status = { running: false, finished: false, done: 0, renamed: 0, skipped: 0, failed: 0, errors: [], startedAt: null, endedAt: null, origin: null };
export const filenamesStatus = () => ({ ...status, errors: status.errors.slice(-10) });

async function* productsWithMedia() {
  let after = null;
  do {
    const d = await gql(
      `query($after: String) { products(first: 100, after: $after) { pageInfo { hasNextPage endCursor }
        nodes { id title media(first: 30) { nodes { id alt ... on MediaImage { image { url } } } } } } }`,
      { after },
    );
    for (const p of d.products.nodes) yield { id: p.id, title: p.title, media: p.media.nodes.map((m) => ({ id: m.id, alt: m.alt || '', url: m.image?.url || '' })) };
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
}

async function updateFiles(files) {
  const d = await gql(
    `mutation($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { files { id } userErrors { field message code } } }`,
    { files: files.map((f) => ({ id: f.id, filename: f.filename })) },
  );
  return d.fileUpdate.userErrors || [];
}

async function apply(batch) {
  let errs = [];
  try {
    errs = await updateFiles(batch);
  } catch (e) {
    errs = [{ message: e.message }];
  }
  if (!errs.length) {
    status.renamed += batch.length;
    return;
  }
  // Algo falló en la tanda: se repite una a una para saber cuál; si el nombre choca, se añade un sufijo.
  for (const f of batch) {
    let ok = false;
    for (const name of [f.filename, f.filename.replace(/(\.[a-z0-9]+)$/, `-${f.id.split('/').pop().slice(-6)}$1`)]) {
      try {
        const e = await updateFiles([{ ...f, filename: name }]);
        if (!e.length) {
          ok = true;
          break;
        }
        f.lastError = e.map((x) => x.message).join('; ');
      } catch (e) {
        f.lastError = e.message;
      }
    }
    if (ok) status.renamed++;
    else {
      status.failed++;
      status.errors.push(`${f.from} → ${f.filename}: ${String(f.lastError || '').slice(0, 200)}`);
    }
  }
}

/** Repasa toda la tienda y renombra las fotos que no tengan el nombre del producto. */
export async function renameAll(origin = 'manual') {
  if (status.running) return { already: true };
  Object.assign(status, { running: true, finished: false, done: 0, renamed: 0, skipped: 0, failed: 0, errors: [], startedAt: new Date(), endedAt: null, origin });
  try {
    const shop = await shopInfo();
    if (!/ikwg4h-mk/.test(shop.myshopifyDomain)) throw new Error(`La tienda conectada es ${shop.myshopifyDomain}, no Nina Beauty. No se hace nada.`);
    const used = new Set();
    let pending = [];
    for await (const p of productsWithMedia()) {
      const plan = planProduct(p, used);
      status.done++;
      status.skipped += (p.media || []).length - plan.length;
      pending.push(...plan);
      while (pending.length >= BATCH) await apply(pending.splice(0, BATCH));
    }
    if (pending.length) await apply(pending);
  } catch (e) {
    status.errors.push(e.message);
    console.error('Nombres de fotos:', e.message);
  } finally {
    Object.assign(status, { running: false, finished: true, endedAt: new Date() });
    console.log(`Nombres de fotos (${origin}): ${status.renamed} renombradas, ${status.failed} fallos, ${status.done} productos.`);
  }
  return filenamesStatus();
}
