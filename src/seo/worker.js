// Pone la categoría de Google y la descripción a cada producto: al crearse (webhook) y en un repaso cada hora.
import { config } from '../config.js';
import { shopInfo } from '../shopify.js';
import { seo } from './settings.js';
import * as sh from './shopify.js';
import * as store from './store.js';
import { askJson } from './openai.js';
import { ruleCategory, googleGender, isGtin } from './categories.js';
import { SCHEMA, buildPrompt, renderDescription, isReplaceable } from './describe.js';
import { placeholderMedia, logoUrl, realImageFor } from './images.js';

// Productos sin categoría posible: no se reintenta con IA hasta pasadas 24 h.
const catFailed = new Map();
const imgFailed = new Map();

/** Qué le falta a un producto. */
export function needs(p, { capReached = false } = {}) {
  if ((p.tags || []).some((t) => t.toLowerCase() === seo.skipTag)) return { any: false };
  const category = !p.category && !(catFailed.get(p.id) > Date.now());
  const description = !!seo.openaiKey() && !capReached && !p.aiDescription && isReplaceable(p.descriptionHtml);
  const g = p.google || {};
  const google = (!g.gender && !!googleGender(p.tags)) || !g.ageGroup || !g.condition;
  const barcodes = p.variants.filter((v) => !v.barcodes.length && isGtin(v.sku));
  const image = !(imgFailed.get(p.id) > Date.now()) && !!logoUrl() && placeholderMedia(p).length > 0;
  return { category, description, google, barcodes, image, any: category || description || google || image || barcodes.length > 0 };
}

// ---- Categoría con IA para lo que no es perfume ----
const CAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['busquedas'],
  properties: { busquedas: { type: 'array', items: { type: 'string' }, description: '3 términos cortos en español para buscar la categoría.' } },
};
const PICK_SCHEMA = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string' } } };

async function aiCategory(p, counter) {
  const desc = `Producto: ${p.title}\nMarca: ${p.vendor || ''}\nTipo: ${p.productType || ''}\nEtiquetas: ${(p.tags || []).join(', ')}`;
  counter.n++;
  const { busquedas } = await askJson({
    name: 'busquedas',
    schema: CAT_SCHEMA,
    system: 'Ayudas a clasificar productos de belleza en la taxonomía de productos de Shopify (en español). Da 3 términos de búsqueda cortos, del más concreto al más general (p. ej. «máscaras de pestañas», «maquillaje para ojos», «cosméticos»).',
    user: desc,
  });
  const seen = new Map();
  for (const term of (busquedas || []).slice(0, 3)) for (const c of await sh.searchCategories(term)) seen.set(c.id, c);
  const options = [...seen.values()].filter((c) => /^Salud y belleza|^Health/i.test(c.fullName) || seen.size < 5);
  if (!options.length) return null;
  counter.n++;
  const { id } = await askJson({
    name: 'categoria',
    schema: PICK_SCHEMA,
    system: 'Elige la categoría más precisa para el producto. Responde solo con el id de una de las opciones; prefiere las hojas (más concretas).',
    user: `${desc}\n\nOpciones:\n${options.map((c) => `${c.id} = ${c.fullName}`).join('\n')}`,
  });
  const chosen = options.find((c) => c.id === id);
  return chosen ? { id: chosen.id, name: chosen.fullName } : null;
}

/**
 * Procesa un producto. preview=true no guarda nada y devuelve lo que haría.
 * @returns {Promise<object>} resumen
 */
export async function processProduct(productId, { origin = 'manual', preview = false, forceDescription = false } = {}) {
  const counter = { n: 0 };
  const p = await sh.getProduct(productId);
  if (!p) return { productId, error: 'No existe' };
  const n = needs(p);
  if (forceDescription && !(p.tags || []).some((t) => t.toLowerCase() === seo.skipTag)) n.description = n.any = true;
  const out = { productId, title: p.title, origin };
  if (!n.any) return { ...out, note: 'Ya estaba completo' };

  try {
    const update = { id: p.id };
    const metafields = [];

    if (n.category) {
      let cat = ruleCategory(p);
      if (!cat && seo.openaiKey()) cat = await aiCategory(p, counter);
      if (cat) {
        update.category = cat.id;
        out.category = cat.name;
      } else {
        catFailed.set(p.id, Date.now() + 86400_000);
        out.note = 'Sin categoría: no es perfume y falta OPENAI_API_KEY o la IA no encontró una';
      }
    }

    if (n.description) {
      if (!seo.openaiKey()) out.note = [out.note, 'Descripción pendiente: falta OPENAI_API_KEY'].filter(Boolean).join(' · ');
      else if ((await store.aiCallsToday()) + counter.n >= seo.maxPerDay) out.capped = true; // mañana sigue
      else {
        const { system, user } = buildPrompt(p, { webSearch: seo.webSearch });
        counter.n++;
        const ai = await askJson({ system, user, schema: SCHEMA, name: 'ficha', webSearch: seo.webSearch });
        update.descriptionHtml = renderDescription(p, ai);
        metafields.push({ namespace: 'nina_seo', key: 'descripcion', type: 'single_line_text_field', value: `ia ${new Date().toISOString().slice(0, 10)}${ai.seguro ? '' : ' sin notas'}` });
        out.description = true;
        out.descriptionHtml = update.descriptionHtml;
      }
    }

    if (n.google) {
      const g = p.google || {};
      const gender = googleGender(p.tags);
      const mf = (key, value) => ({ namespace: 'mm-google-shopping', key, type: 'single_line_text_field', value });
      if (!g.gender && gender) metafields.push(mf('gender', gender));
      if (!g.ageGroup) metafields.push(mf('age_group', 'adult'));
      if (!g.condition) metafields.push(mf('condition', 'new'));
      out.googleFields = true;
    }
    // Foto «No image available» de BTS: la foto real de otro tamaño si BTS la tiene; si no, el logo de Nina.
    let image = null;
    if (n.image) {
      const real = await realImageFor(p).catch(() => null);
      image = { source: real || logoUrl(), remove: placeholderMedia(p).map((m) => m.id), kind: real ? 'foto de otro tamaño' : 'logo de Nina' };
      metafields.push({ namespace: 'nina_seo', key: 'foto', type: 'single_line_text_field', value: real ? 'bts' : 'logo' });
      out.note = [out.note, `Sin foto en BTS: puesta ${image.kind}`].filter(Boolean).join(' · ');
    }
    if (metafields.length) update.metafields = metafields;
    out.barcodes = n.barcodes.length;
    out.aiCalls = counter.n;

    if (!preview) {
      if (image) {
        try {
          await sh.replaceImages(p.id, image.remove, image.source, p.title);
        } catch (e) {
          imgFailed.set(p.id, Date.now() + 86400_000);
          update.metafields = (update.metafields || []).filter((m) => m.key !== 'foto');
          out.note = 'No se pudo cambiar la foto: ' + (/access|denied|scope|permis/i.test(e.message) ? 'falta el permiso write_files en la app de Shopify' : e.message.slice(0, 200));
        }
      }
      if (update.metafields && !update.metafields.length) delete update.metafields;
      if (Object.keys(update).length > 1) await sh.updateProduct(update);
      if (n.barcodes.length) await sh.setBarcodes(p.id, n.barcodes.map((v) => ({ id: v.id, ean: v.sku })));
      if (Object.keys(update).length > 1 || n.barcodes.length || out.note) await store.log(out);
    }
    return out;
  } catch (e) {
    const err = { ...out, aiCalls: counter.n, error: String(e.message || e).slice(0, 400) };
    if (!preview) await store.log(err).catch(() => {});
    return err;
  }
}

// ---- Cola: un producto a la vez por hueco, sin repetir ----
const queue = [];
const queued = new Set();
let active = 0;
let shopChecked = false;

async function checkShop() {
  if (shopChecked) return;
  const s = await shopInfo();
  if (s.myshopifyDomain !== config.shopify.shop() || /lafarmacia/i.test(s.primaryDomain?.host || '')) {
    throw new Error(`Tienda inesperada (${s.myshopifyDomain}); no se toca nada`);
  }
  shopChecked = true;
}

export function enqueue(productId, origin) {
  if (queued.has(productId)) return;
  queued.add(productId);
  queue.push({ productId, origin });
  pump();
}

function pump() {
  while (active < seo.concurrency && queue.length) {
    const job = queue.shift();
    active++;
    checkShop()
      .then(() => processProduct(job.productId, { origin: job.origin }))
      .catch((e) => console.error('Google y descripciones:', e.message))
      .finally(() => {
        active--;
        queued.delete(job.productId);
        pump();
      });
  }
}

export const queueStatus = () => ({ pending: queue.length, active });

let sweeping = false;
/** Repaso: mete en la cola los productos a los que les falta algo. */
export async function sweep(origin = 'repaso') {
  if (sweeping) return { already: true };
  sweeping = true;
  try {
    await checkShop();
    let total = 0;
    let missing = 0;
    const capReached = (await store.aiCallsToday()) >= seo.maxPerDay;
    for await (const p of sh.allProducts()) {
      total++;
      if (needs(p, { capReached }).any) {
        missing++;
        enqueue(p.id, origin);
      }
    }
    return { total, missing };
  } finally {
    sweeping = false;
  }
}
export const isSweeping = () => sweeping;
