// Consultas a Shopify para NinaCash y niveles. Reutiliza el cliente de Nina Sync.
import { gql } from '../shopify.js';

const ORDER_FIELDS = `id name createdAt processedAt cancelledAt displayFinancialStatus tags
  customer { id displayName }
  currentSubtotalPriceSet { shopMoney { amount currencyCode } }
  transactions(first: 30) { kind status gateway formattedGateway amountSet { shopMoney { amount } } }
  fulfillments(first: 10) { status createdAt deliveredAt }`;

export async function getOrder(id) {
  const d = await gql(`query($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`, { id });
  return d.order;
}

/** Pedidos de los últimos días (para la primera carga y el repaso). */
export async function* recentOrders(days = 365) {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  let after = null;
  do {
    const d = await gql(
      `query($q: String!, $after: String) { orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) { pageInfo { hasNextPage endCursor } nodes { ${ORDER_FIELDS} } } }`,
      { q: `created_at:>=${since}`, after },
    );
    for (const o of d.orders.nodes) yield o;
    after = d.orders.pageInfo.hasNextPage ? d.orders.pageInfo.endCursor : null;
  } while (after);
}

export async function getCustomer(id) {
  const d = await gql(
    `query($id: ID!) { customer(id: $id) { id displayName tags
      storeCreditAccounts(first: 5) { nodes { id balance { amount currencyCode } } } } }`,
    { id },
  );
  return d.customer;
}

export const balanceOf = (customer, currency = 'EUR') =>
  Number(customer?.storeCreditAccounts?.nodes?.find((a) => a.balance.currencyCode === currency)?.balance.amount || 0);

/** Clientas sin etiqueta de nivel (cuentas nuevas sin compras). */
export async function* customersWithoutLevel(tags) {
  const q = tags.map((t) => `-tag:${t}`).join(' ');
  let after = null;
  do {
    const d = await gql(
      `query($q: String!, $after: String) { customers(first: 100, after: $after, query: $q) { pageInfo { hasNextPage endCursor } nodes { id displayName } } }`,
      { q, after },
    );
    for (const c of d.customers.nodes) yield c;
    after = d.customers.pageInfo.hasNextPage ? d.customers.pageInfo.endCursor : null;
  } while (after);
}

const check = (payload, name) => {
  const errs = payload?.userErrors || [];
  if (errs.length) throw new Error(`${name}: ` + JSON.stringify(errs));
  return payload;
};

export async function credit(customerId, amount, expiresAt) {
  const d = await gql(
    `mutation($id: ID!, $input: StoreCreditAccountCreditInput!) { storeCreditAccountCredit(id: $id, creditInput: $input) {
      storeCreditAccountTransaction { id } userErrors { field message code } } }`,
    { id: customerId, input: { creditAmount: { amount: amount.toFixed(2), currencyCode: 'EUR' }, expiresAt: expiresAt.toISOString(), notify: true } },
  );
  check(d.storeCreditAccountCredit, 'storeCreditAccountCredit');
}

export async function debit(accountOrCustomerId, amount) {
  const d = await gql(
    `mutation($id: ID!, $input: StoreCreditAccountDebitInput!) { storeCreditAccountDebit(id: $id, debitInput: $input) {
      storeCreditAccountTransaction { id } userErrors { field message code } } }`,
    { id: accountOrCustomerId, input: { debitAmount: { amount: amount.toFixed(2), currencyCode: 'EUR' } } },
  );
  check(d.storeCreditAccountDebit, 'storeCreditAccountDebit');
}

export async function addTags(id, tags) {
  if (!tags.length) return;
  const d = await gql(`mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`, { id, tags });
  check(d.tagsAdd, 'tagsAdd');
}
export async function removeTags(id, tags) {
  if (!tags.length) return;
  const d = await gql(`mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`, { id, tags });
  check(d.tagsRemove, 'tagsRemove');
}

/** metafields: [{ ownerId, key, type, value }] en el espacio «nina». */
export async function setMetafields(metafields) {
  for (let i = 0; i < metafields.length; i += 25) {
    const d = await gql(
      `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message code } } }`,
      { m: metafields.slice(i, i + 25).map((m) => ({ namespace: 'nina', ...m, value: String(m.value) })) },
    );
    check(d.metafieldsSet, 'metafieldsSet');
  }
}

export async function shopId() {
  const d = await gql(`{ shop { id } }`);
  return d.shop.id;
}

/** Definiciones de metacampos (para que se vean bien en el admin y en el tema). */
export async function ensureDefinitions(defs) {
  for (const def of defs) {
    const d = await gql(
      `mutation($def: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $def) { createdDefinition { id } userErrors { field message code } } }`,
      { def: { namespace: 'nina', ...def } },
    );
    const errs = d.metafieldDefinitionCreate.userErrors.filter((e) => e.code !== 'TAKEN');
    if (errs.length) throw new Error('metafieldDefinitionCreate: ' + JSON.stringify(errs));
  }
}

/** Segmento de clientas por nombre; si no existe, lo crea. */
export async function ensureSegment(name, query) {
  const d = await gql(`query($q: String!) { segments(first: 10, query: $q) { nodes { id name query } } }`, { q: name });
  const found = d.segments.nodes.find((s) => s.name === name);
  if (found) {
    if (found.query !== query) {
      const u = await gql(`mutation($id: ID!, $query: String!) { segmentUpdate(id: $id, query: $query) { segment { id } userErrors { field message } } }`, { id: found.id, query });
      check(u.segmentUpdate, 'segmentUpdate');
    }
    return found.id;
  }
  const c = await gql(`mutation($name: String!, $query: String!) { segmentCreate(name: $name, query: $query) { segment { id } userErrors { field message } } }`, { name, query });
  check(c.segmentCreate, 'segmentCreate');
  return c.segmentCreate.segment.id;
}

export async function discountExists(id) {
  if (!id) return false;
  const d = await gql(`query($id: ID!) { discountNode(id: $id) { id } }`, { id });
  return !!d.discountNode;
}

const COMBINE = { orderDiscounts: true, productDiscounts: true, shippingDiscounts: false };

/** Envío gratis automático para un segmento (Butterfly). */
export async function createAutomaticFreeShipping(title, segmentId) {
  const d = await gql(
    `mutation($d: DiscountAutomaticFreeShippingInput!) { discountAutomaticFreeShippingCreate(freeShippingAutomaticDiscount: $d) {
      automaticDiscountNode { id } userErrors { field message code } } }`,
    { d: { title, startsAt: new Date().toISOString(), context: { customerSegments: { add: [segmentId] } }, destination: { all: true }, combinesWith: COMBINE } },
  );
  check(d.discountAutomaticFreeShippingCreate, 'discountAutomaticFreeShippingCreate');
  return d.discountAutomaticFreeShippingCreate.automaticDiscountNode.id;
}

/** Código de envío gratis de un solo uso para una clienta (Glam, 1 al mes). */
export async function createPersonalFreeShipping({ code, title, customerId, endsAt }) {
  const d = await gql(
    `mutation($d: DiscountCodeFreeShippingInput!) { discountCodeFreeShippingCreate(freeShippingCodeDiscount: $d) {
      codeDiscountNode { id } userErrors { field message code } } }`,
    {
      d: {
        title,
        code,
        startsAt: new Date().toISOString(),
        endsAt: endsAt.toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        context: { customers: { add: [customerId] } },
        destination: { all: true },
        combinesWith: COMBINE,
      },
    },
  );
  check(d.discountCodeFreeShippingCreate, 'discountCodeFreeShippingCreate');
  return d.discountCodeFreeShippingCreate.codeDiscountNode.id;
}

/** Cupón de descuento solo para los segmentos (niveles) elegidos. */
export async function createLevelCoupon({ code, title, segmentIds, kind, value, minTotal, startsAt, endsAt }) {
  const val = kind === 'porcentaje' ? { percentage: Number(value) / 100 } : { discountAmount: { amount: Number(value).toFixed(2), appliesOnEachItem: false } };
  const input = {
    title,
    code,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    appliesOncePerCustomer: true,
    context: { customerSegments: { add: segmentIds } },
    customerGets: { value: val, items: { all: true } },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
  };
  if (minTotal) input.minimumRequirement = { subtotal: { greaterThanOrEqualToSubtotal: Number(minTotal).toFixed(2) } };
  const d = await gql(
    `mutation($d: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message code } } }`,
    { d: input },
  );
  check(d.discountCodeBasicCreate, 'discountCodeBasicCreate');
  return d.discountCodeBasicCreate.codeDiscountNode.id;
}

/** Se suscribe a un aviso de Shopify si no lo estaba ya. */
export async function ensureWebhook(topic, uri) {
  const d = await gql(`query($uri: String!, $t: [WebhookSubscriptionTopic!]) { webhookSubscriptions(first: 5, topics: $t, uri: $uri) { nodes { id } } }`, { uri, t: [topic] });
  if (d.webhookSubscriptions.nodes.length) return 'ya estaba';
  const c = await gql(
    `mutation($t: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic: $t, webhookSubscription: $sub) { webhookSubscription { id } userErrors { field message } } }`,
    { t: topic, sub: { uri, format: 'JSON' } },
  );
  check(c.webhookSubscriptionCreate, 'webhookSubscriptionCreate');
  return 'creado';
}
