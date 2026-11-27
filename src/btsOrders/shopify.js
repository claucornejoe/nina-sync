// Pedidos de Shopify para BTS. Necesita en la app de Shopify: read_orders, read_merchant_managed_fulfillment_orders,
// write_merchant_managed_fulfillment_orders y acceso a datos protegidos de clientes (nombre, dirección y teléfono).
import { gql } from '../shopify.js';

const ORDER_FIELDS = `id name createdAt cancelledAt test displayFinancialStatus displayFulfillmentStatus phone
  currentTotalPriceSet { shopMoney { amount } }
  currentSubtotalPriceSet { shopMoney { amount } }
  shippingAddress { name firstName lastName address1 address2 zip city countryCodeV2 phone }
  billingAddress { phone }
  lineItems(first: 100) { nodes { id name sku quantity currentQuantity variant { id sku } } }`;

/** Pedidos pagados y sin enviar creados desde `sinceIso`. */
export async function paidUnfulfilledOrders(sinceIso) {
  const out = [];
  let after = null;
  const q = `created_at:>=${String(sinceIso).slice(0, 10)} financial_status:paid fulfillment_status:unfulfilled status:open`;
  do {
    const d = await gql(
      `query($q: String!, $after: String) { orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) {
        pageInfo { hasNextPage endCursor } nodes { ${ORDER_FIELDS} } } }`,
      { q, after },
    );
    out.push(...d.orders.nodes.filter((o) => !o.test));
    after = d.orders.pageInfo.hasNextPage ? d.orders.pageInfo.endCursor : null;
  } while (after);
  return out;
}

export async function getOrder(id) {
  const d = await gql(`query($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`, { id });
  return d.order;
}

/** Marca como enviado todo lo pendiente del pedido, con el seguimiento de BTS, y avisa a la clienta. */
export async function fulfillWithTracking(orderId, { number, company, url }) {
  const d = await gql(
    `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status } } } }`,
    { id: orderId },
  );
  const open = d.order.fulfillmentOrders.nodes.filter((f) => ['OPEN', 'IN_PROGRESS'].includes(f.status));
  if (!open.length) return { skipped: true };
  const r = await gql(
    `mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { fulfillment { id status } userErrors { field message } } }`,
    {
      f: {
        lineItemsByFulfillmentOrder: open.map((f) => ({ fulfillmentOrderId: f.id })),
        notifyCustomer: true,
        trackingInfo: { number, company, ...(url ? { url } : {}) },
      },
    },
  );
  const errs = r.fulfillmentCreate.userErrors;
  if (errs.length) throw new Error('Shopify fulfillmentCreate: ' + errs.map((e) => e.message).join('; '));
  return r.fulfillmentCreate.fulfillment;
}
