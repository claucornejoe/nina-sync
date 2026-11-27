// Pedidos Shopify → BTS. Modo «botón» (Clau, 2026-11-27): Nina Sync prepara cada pedido pagado
// y solo lo envía a BTS cuando Clau pulsa «Enviar a BTS». Se paga con el monedero de BTS.
// BTS no tiene modo de prueba: cada setCreateOrder es un pedido real y se cobra.
import { config } from '../config.js';
import { get, postForm } from '../bts.js';
import * as store from './store.js';
import * as sh from './shopify.js';
import { buildBtsOrder, createOrderParams, pickShipping, trackingUrl, carrierOf } from './build.js';

const money = (o, k) => Number(o?.[k]?.shopMoney?.amount || 0);

let lastRefresh = { at: null, error: null, found: 0 };
export const lastRefreshInfo = () => lastRefresh;

/** Busca pedidos pagados sin enviar y los deja preparados en el panel. No envía nada a BTS. */
export async function refreshOrders() {
  try {
    // Primer arranque: también los pedidos pagados de la última semana (nunca se envía nada sin pulsar el botón).
    const since = await store.since(config.btsOrders.since || new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
    const orders = await sh.paidUnfulfilledOrders(since);
    for (const o of orders) await saveSeen(o);
    lastRefresh = { at: new Date(), error: null, found: orders.length };
  } catch (e) {
    lastRefresh = { at: new Date(), error: e.message, found: 0 };
    throw e;
  }
  return lastRefresh;
}

async function saveSeen(o) {
  const b = buildBtsOrder(o);
  await store.upsertSeen({
    orderId: o.id,
    name: o.name,
    createdAt: o.createdAt,
    customer: b.address.client_name,
    total: money(o, 'currentTotalPriceSet'),
    detail: { lines: b.lines, other: b.other, address: b.address },
    status: b.ok ? 'pendiente' : 'error',
    error: b.ok ? null : b.problems.join(' · '),
  });
  return b;
}

/** Envía un pedido a BTS. Solo desde el botón del panel. */
export async function sendOrder(orderId) {
  if (config.dryRun) throw new Error('Nina Sync está en modo prueba (DRY_RUN=true): no se envían pedidos a BTS');
  // Datos frescos de Shopify (dirección o cantidades pueden haber cambiado).
  const o = await sh.getOrder(orderId);
  if (!o) throw new Error('Shopify no encuentra el pedido');
  if (o.displayFulfillmentStatus && !['UNFULFILLED', 'PARTIALLY_FULFILLED'].includes(o.displayFulfillmentStatus)) {
    await store.setStatus(orderId, 'ignorado');
    throw new Error('Este pedido ya está enviado en Shopify');
  }
  const b = await saveSeen(o);
  if (!b.ok) throw new Error(b.problems.join(' · '));

  const row = await store.lockForSend(orderId);
  if (!row) throw new Error('Este pedido ya se está enviando o ya se envió a BTS');

  let rate;
  try {
    const params = [
      ['address[country_code]', b.address.country_code],
      ['address[postal_code]', b.address.postal_code],
    ];
    b.lines.forEach((l, i) => params.push([`products[${i}][sku]`, l.sku], [`products[${i}][quantity]`, String(l.quantity)]));
    rate = pickShipping(await get('getShippingPrices', params), money(o, 'currentSubtotalPriceSet'));
    if (!rate) throw new Error('BTS no ofrece envío a este código postal');
  } catch (e) {
    await store.markError(orderId, e.message);
    throw e;
  }

  let res;
  try {
    res = await postForm('setCreateOrder', createOrderParams(b, rate.id, config.btsOrders.paymentMethod));
  } catch (e) {
    // Si BTS respondió con un error claro, el pedido no se creó y se puede reintentar.
    // Si no hubo respuesta (corte de red), puede que sí se creara: queda en «revisar» y no se reintenta solo.
    const answered = /respondió \d{3}/.test(e.message);
    await store.markError(orderId, explain(e.message), answered ? 'error' : 'revisar');
    throw new Error(explain(e.message));
  }
  if (!res?.order_number) {
    const msg = explain(JSON.stringify(res));
    await store.markError(orderId, msg, 'error');
    throw new Error(msg);
  }
  await store.markSent(orderId, {
    number: String(res.order_number),
    total: Number(res.order_total) || null,
    status: res.order_status || null,
    company: rate.company_name || null,
    shippingCost: Number(rate.shipping_cost) || 0,
    detail: { lines: b.lines, other: b.other, address: b.address, expected_delivery_date: res.expected_delivery_date || null },
  });
  return res;
}

const ERRORS = {
  no_enough_money: 'No hay saldo suficiente en el monedero de BTS. Recárgalo y vuelve a pulsar «Enviar a BTS».',
  no_stock: 'BTS no tiene stock de algún producto del pedido (BTS no hace envíos parciales).',
  product_error: 'BTS no reconoce algún producto (EAN) del pedido.',
  shipping_cost_code_error: 'BTS no acepta el envío para ese código postal.',
  payment_method_error: 'Método de pago no válido en BTS.',
};
export function explain(text) {
  for (const [k, v] of Object.entries(ERRORS)) if (String(text).includes(k)) return v;
  return String(text).slice(0, 300);
}

/** Trae el seguimiento de BTS y marca los pedidos como enviados en Shopify (la clienta recibe el correo). */
export async function syncTrackings() {
  if (config.dryRun) return { checked: 0, fulfilled: 0 }; // en modo prueba no se toca Shopify
  const rows = await store.awaitingTracking();
  if (!rows.length) return { checked: 0, fulfilled: 0 };
  let fulfilled = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    let list = [];
    try {
      const params = chunk.map((r, j) => [`order_number[${j}]`, r.bts_order_number]);
      const j = await get('getTrackings', params);
      list = Array.isArray(j) ? j : j?.trackings || [];
    } catch (e) {
      if (!/order_not_found/i.test(e.message)) console.error('BTS getTrackings:', e.message);
      continue;
    }
    for (const t of list) {
      if (!t?.tracking) continue;
      const row = chunk.find((r) => r.bts_order_number === String(t.order_number));
      if (!row) continue;
      try {
        let company = row.shipping_company;
        try {
          company = carrierOf(await get('getOrder', [['order_number', row.bts_order_number]]), t.tracking);
        } catch {}
        const number = String(t.tracking);
        if (!config.dryRun) await sh.fulfillWithTracking(row.order_id, { number, company, url: trackingUrl(company, number) });
        await store.markFulfilled(row.order_id, number, company);
        fulfilled++;
      } catch (e) {
        console.error(`Seguimiento del pedido ${row.name}:`, e.message);
      }
    }
  }
  return { checked: rows.length, fulfilled };
}
