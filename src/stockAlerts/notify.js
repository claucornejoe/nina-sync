// Envía el correo «¡Ha vuelto!» a quien lo pidió cuando el tamaño vuelve a tener stock.
// Se ejecuta al final de cada sincronización (cada 4 h) y con el botón del panel.
import { config } from '../config.js';
import { gql } from '../shopify.js';
import { mailReady, sendCustomerMail } from '../mail.js';
import { renderStockEmail, productLink } from './email.js';
import * as store from './store.js';

const VARIANTS_Q = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id title price compareAtPrice inventoryQuantity
      image { url }
      product { id title vendor handle status tags featuredMedia { preview { image { url } } } }
    }
  }
}`;

/** Datos actuales de estos tamaños en Shopify (los que ya no existen no vienen). */
export async function fetchVariants(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const d = await gql(VARIANTS_Q, { ids: ids.slice(i, i + 100) });
    for (const v of d.nodes) if (v?.id) out.set(v.id, v);
  }
  return out;
}

/** Mensaje del correo para un tamaño con stock. */
export function emailFor(v, r = config.stockAlerts) {
  const img = v.image?.url || v.product.featuredMedia?.preview?.image?.url || '';
  const sized = img ? img + (img.includes('?') ? '&' : '?') + 'width=400' : '';
  const base = (config.publicUrl || '').replace(/\/$/, '');
  const skinCare = (v.product.tags || []).some((t) => t === 'skin-care' || t.startsWith('sc-'));
  return renderStockEmail({
    productTitle: v.product.title,
    vendor: v.product.vendor,
    variantTitle: v.title,
    price: Number(v.price),
    compareAt: v.compareAtPrice ? Number(v.compareAtPrice) : null,
    imageUrl: sized,
    url: productLink(`${r.storeUrl}/products/${v.product.handle}`, v.id),
    lowStock: v.inventoryQuantity <= r.lowStockMax,
    skinCare,
    logoUrl: `${base}/static/${skinCare ? 'logo-correo-skincare.png' : 'logo-correo.png'}`,
  });
}

let busy = false;
export const lastRun = { at: null, sent: 0, errors: 0, note: 'Todavía no se ha revisado' };

/**
 * Revisa las solicitudes pendientes y avisa a las clientas de los tamaños que ya tienen stock.
 * No hace nada en modo prueba de la sincronización (dryRun) ni si falta el correo.
 */
export async function notifyRestocked({ dryRun = false } = {}) {
  if (busy) return lastRun;
  busy = true;
  const r = config.stockAlerts;
  const res = { at: new Date(), sent: 0, errors: 0, note: '' };
  try {
    await store.expireOld(r.expireDays);
    const ids = await store.pendingVariantIds();
    if (!ids.length) return Object.assign(lastRun, res, { note: 'No hay avisos pendientes' });
    if (!mailReady()) return Object.assign(lastRun, res, { note: 'Falta configurar el correo: los avisos esperan' });

    const variants = await fetchVariants(ids);
    for (const id of ids) if (!variants.has(id)) await store.expireVariant(id); // tamaño borrado de la tienda

    const ready = [...variants.values()].filter((v) => v.inventoryQuantity > 0 && v.product.status === 'ACTIVE');
    if (!ready.length) return Object.assign(lastRun, res, { note: `${ids.length} tamaños esperan stock` });
    if (dryRun) return Object.assign(lastRun, res, { note: `Modo prueba: se avisaría de ${ready.length} tamaños` });

    const alerts = await store.pendingFor(ready.map((v) => v.id));
    const byId = new Map(ready.map((v) => [v.id, v]));
    for (const a of alerts.slice(0, r.maxPerRun)) {
      const mail = emailFor(byId.get(a.variant_id), r);
      try {
        await sendCustomerMail({ to: a.email, ...mail });
        await store.markSent(a.id);
        res.sent++;
      } catch (e) {
        // Fallo de la cuenta (contraseña, conexión): no es culpa de la dirección, se para y se reintenta luego.
        if (e.code === 'EAUTH' || e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT' || /535|auth/i.test(e.message)) {
          res.note = e.code === 'EAUTH' || /535|auth/i.test(e.message) ? 'Google rechazó la contraseña de aplicación: revisa SMTP_PASS' : 'No se pudo conectar con el correo: se reintenta en la próxima revisión';
          break;
        }
        res.errors++;
        await store.markError(a.id, e.message);
      }
    }
    const left = alerts.length - res.sent - res.errors;
    if (!res.note) res.note = `${res.sent} ${res.sent === 1 ? 'aviso enviado' : 'avisos enviados'}${left > 0 ? `, ${left} quedan para la próxima vez` : ''}`;
    return Object.assign(lastRun, res);
  } catch (e) {
    console.error('Avisos de stock:', e);
    return Object.assign(lastRun, res, { note: 'Error: ' + e.message });
  } finally {
    busy = false;
  }
}
