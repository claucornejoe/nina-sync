// Comprueba precios de la competencia y aplica los ajustes que confirme Clau.
import { config } from '../config.js';
import * as shopify from '../shopify.js';
import * as store from './store.js';
import { comp, summarizeOffers, suggest } from './engine.js';
import { searchEan, account } from './serpapi.js';
import { round2, profit } from '../pricing.js';

export const state = { running: false, done: 0, total: 0, label: '', last: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkShop() {
  const shop = await shopify.shopInfo();
  if (shop.myshopifyDomain !== config.shopify.shop() || /lafarmacia/i.test(shop.primaryDomain?.host || '')) {
    throw new Error(`Tienda inesperada (${shop.myshopifyDomain}); se cancela`);
  }
}

/** Cuántas búsquedas se pueden gastar ahora sin pasarse del presupuesto del mes. */
export async function budget() {
  const used = await store.searchesThisMonth();
  const monthLeft = Math.max(0, comp.monthlySearches() - used);
  let serp = null;
  if (comp.serpKey()) serp = await account().catch(() => null);
  const left = serp?.left != null ? Math.min(monthLeft, serp.left) : monthLeft;
  return { used, monthLeft, left, serp };
}

/** Reparto diario: el presupuesto que queda entre los días que quedan del mes. */
export function dailyShare(left, now = new Date()) {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, last - now.getDate() + 1);
  return Math.ceil(left / daysLeft);
}

/** Elige qué tamaños buscar: primero los nunca comprobados y los más caros (donde más se nota). */
export function pickCandidates(variants, checked, { limit, recheckDays, manualTag, now = Date.now() }) {
  const seen = new Set();
  return variants
    .filter((v) => v.ean && /^\d{8,14}$/.test(v.ean) && v.available > 0 && (!v.status || v.status === 'ACTIVE') && !(v.tags || []).includes(manualTag))
    .filter((v) => {
      if (seen.has(v.ean)) return false;
      seen.add(v.ean);
      const at = checked.get(v.ean);
      return !at || now - at.getTime() > recheckDays * 86400_000;
    })
    .sort((a, b) => (checked.has(a.ean) ? 1 : 0) - (checked.has(b.ean) ? 1 : 0) || b.price - a.price)
    .slice(0, limit);
}

/** Busca la competencia de hasta `limit` tamaños. */
export async function runCheck({ limit = null, trigger = 'manual' } = {}) {
  if (state.running) return;
  if (!comp.serpKey()) throw new Error('Falta SERPAPI_KEY en Railway');
  state.running = true;
  state.done = 0;
  state.total = 0;
  state.label = 'Leyendo tus productos de Shopify…';
  const result = { trigger, checked: 0, found: 0, errors: 0, startedAt: new Date(), error: null };
  try {
    await checkShop();
    const b = await budget();
    const n = Math.min(limit ?? dailyShare(b.left), b.left);
    if (n <= 0) {
      result.error = 'No quedan búsquedas este mes';
      return;
    }
    const locationId = await shopify.getLocationId();
    const variants = await shopify.getAllVariants(locationId);
    const todo = pickCandidates(variants, await store.lastChecked(), { limit: n, recheckDays: comp.recheckDays(), manualTag: config.rules.manualPriceTag });
    state.total = todo.length;
    state.label = 'Buscando en Google Shopping…';
    for (const v of todo) {
      try {
        const s = summarizeOffers(await searchEan(v.ean));
        await store.countSearch(1);
        await store.saveCheck({ ean: v.ean, variantId: v.id, productId: v.productId, productTitle: v.productTitle, variantTitle: v.variantTitle, ourPrice: v.price, compareAt: v.compareAt, ...(s || {}) });
        result.checked++;
        if (s) result.found++;
      } catch (e) {
        result.errors++;
        console.error(`Competencia ${v.ean}:`, e.message);
        if (e.fatal) {
          result.error = e.message;
          break;
        }
      }
      state.done++;
      await sleep(1200);
    }
  } catch (e) {
    result.error = e.message;
    console.error('Comprobación de competencia fallida:', e);
  } finally {
    state.running = false;
    state.label = '';
    result.finishedAt = new Date();
    state.last = result;
    console.log(`Competencia (${trigger}): ${result.checked} comprobados, ${result.found} con precios, ${result.errors} errores${result.error ? ' · ' + result.error : ''}`);
  }
}

/** Filas de la pestaña con su posición y precio sugerido. */
export function decorate(rows, r, classifyFn) {
  return rows.map((x) => {
    const c = classifyFn(x.our_price, x.comp_min);
    const s = x.cost ? suggest({ price: x.our_price, cost: x.cost, compMin: x.comp_min }, r) : null;
    return { ...x, ...c, suggestion: s, profitNow: x.cost && x.our_price ? profit(x.our_price, x.cost, r) : null };
  });
}

/** Aplica los precios sugeridos de los EAN elegidos. Lee el precio actual de Shopify antes de tocar nada. */
export async function applyAdjustments(eans, r) {
  await checkShop();
  const wanted = new Set(eans);
  const rows = (await store.rows()).filter((x) => wanted.has(x.ean) && x.variant_id);
  const until = new Date(Date.now() + comp.overrideDays() * 86400_000);
  const out = { applied: [], skipped: [] };
  const byProduct = new Map();

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const d = await shopify.gql(
      `query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id price compareAtPrice product { id tags } } } }`,
      { ids: chunk.map((x) => x.variant_id) },
    );
    const live = new Map(d.nodes.filter(Boolean).map((n) => [n.id, n]));
    for (const x of chunk) {
      const v = live.get(x.variant_id);
      if (!v) { out.skipped.push({ ...x, why: 'ya no existe en Shopify' }); continue; }
      if (v.product.tags.includes(r.manualPriceTag)) { out.skipped.push({ ...x, why: 'tiene la etiqueta precio-manual' }); continue; }
      const price = Number(v.price);
      const s = suggest({ price, cost: x.cost, compMin: x.comp_min }, r);
      if (!s?.newPrice) { out.skipped.push({ ...x, why: 'ya no hace falta o no se puede bajar sin pasar del margen mínimo' }); continue; }
      const cmpNow = v.compareAtPrice ? Number(v.compareAtPrice) : null;
      const cmp = cmpNow && cmpNow > s.newPrice ? cmpNow : x.rrp && x.rrp > s.newPrice ? round2(x.rrp) : null;
      if (!byProduct.has(v.product.id)) byProduct.set(v.product.id, []);
      byProduct.get(v.product.id).push({ x, oldPrice: price, s, variant: { id: v.id, price: s.newPrice.toFixed(2), compareAtPrice: cmp ? cmp.toFixed(2) : null } });
    }
  }

  for (const [productId, items] of byProduct) {
    if (!config.dryRun) await shopify.updatePrices(productId, items.map((it) => it.variant));
    for (const it of items) {
      if (!config.dryRun) {
        await store.saveOverride(it.x.ean, it.s.newPrice, it.x.comp_min, until);
        await store.setOurPrice(it.x.ean, it.s.newPrice);
      }
      out.applied.push({ ...it.x, oldPrice: it.oldPrice, newPrice: it.s.newPrice, profitNew: it.s.profitNew });
    }
  }
  out.dryRun = config.dryRun;
  return out;
}

/** Quita un ajuste: el precio vuelve a la fórmula en la próxima sincronización. */
export async function removeOverride(ean) {
  await store.deleteOverride(ean);
}
