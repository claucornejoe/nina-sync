import { config } from './config.js';

let cachedToken = null; // { token, expiresAt }
const base = () => process.env.SHOPIFY_API_BASE || `https://${config.shopify.shop()}`; // override solo para pruebas

async function getToken() {
  const s = config.shopify;
  if (s.accessToken) return s.accessToken;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  if (!s.clientId || !s.clientSecret) throw new Error('Faltan SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET (o SHOPIFY_ACCESS_TOKEN)');
  // Apps del Dev Dashboard instaladas en una tienda propia: client credentials grant.
  const res = await fetch(`${base()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: s.clientId, client_secret: s.clientSecret }),
  });
  if (!res.ok) throw new Error(`Shopify no dio token (${res.status}): ${await res.text()}`);
  const j = await res.json();
  cachedToken = { token: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

export async function gql(query, variables = {}, attempt = 0) {
  const s = config.shopify;
  const res = await fetch(`${base()}/admin/api/${s.apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
    body: JSON.stringify({ query, variables }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return gql(query, variables, attempt + 1);
  }
  const j = await res.json();
  const throttled = j.errors?.some((e) => e.extensions?.code === 'THROTTLED');
  if (throttled && attempt < 8) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return gql(query, variables, attempt + 1);
  }
  if (j.errors) throw new Error('Shopify GraphQL: ' + JSON.stringify(j.errors));
  // Pausa suave si el cubo de coste se vacía.
  const t = j.extensions?.cost?.throttleStatus;
  if (t && t.currentlyAvailable < 200) await new Promise((r) => setTimeout(r, 1500));
  return j.data;
}

/** Comprueba que la tienda conectada es Nina Beauty y no otra. */
export async function shopInfo() {
  const d = await gql(`{ shop { name myshopifyDomain primaryDomain { host } currencyCode } }`);
  return d.shop;
}

export async function getLocationId() {
  if (config.shopify.locationId) return config.shopify.locationId;
  const d = await gql(`{ locations(first: 5) { nodes { id name isActive } } }`);
  const loc = d.locations.nodes.find((l) => l.isActive) || d.locations.nodes[0];
  if (!loc) throw new Error('La tienda no tiene ubicaciones de inventario');
  return loc.id;
}

/** Todas las variantes con su EAN (SKU o código de barras), precio y stock. */
export async function getAllVariants(locationId) {
  const out = [];
  let after = null;
  const q = `query($after: String, $loc: ID!) {
    productVariants(first: 200, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id sku price compareAtPrice title
        product { id title tags status }
        inventoryItem { id inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { quantity } } }
      }
    }
  }`;
  do {
    const d = await gql(q, { after, loc: locationId });
    for (const v of d.productVariants.nodes) {
      out.push({
        id: v.id,
        ean: (v.sku || "").trim(),
        price: Number(v.price),
        compareAt: v.compareAtPrice ? Number(v.compareAtPrice) : null,
        variantTitle: v.title,
        productId: v.product.id,
        productTitle: v.product.title,
        tags: v.product.tags,
        inventoryItemId: v.inventoryItem.id,
        available: v.inventoryItem.inventoryLevel?.quantities?.[0]?.quantity ?? 0,
      });
    }
    after = d.productVariants.pageInfo.hasNextPage ? d.productVariants.pageInfo.endCursor : null;
  } while (after);
  return out;
}

export async function setQuantities(locationId, items) {
  // items: [{ inventoryItemId, quantity }]
  for (let i = 0; i < items.length; i += 250) {
    const chunk = items.slice(i, i + 250);
    const d = await gql(
      `mutation($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) { userErrors { field message } }
      }`,
      {
        input: {
          name: 'available',
          reason: 'correction',
          referenceDocumentUri: 'nina-sync://bts',
          quantities: chunk.map((c) => ({ inventoryItemId: c.inventoryItemId, locationId, quantity: c.quantity, changeFromQuantity: null })),
        },
      },
    );
    const errs = d.inventorySetQuantities.userErrors;
    if (errs.length) throw new Error('inventorySetQuantities: ' + JSON.stringify(errs));
  }
}

export async function updatePrices(productId, variants) {
  // variants: [{ id, price, compareAtPrice }]
  const d = await gql(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
    }`,
    { productId, variants },
  );
  const errs = d.productVariantsBulkUpdate.userErrors;
  if (errs.length) throw new Error('productVariantsBulkUpdate: ' + JSON.stringify(errs));
}

export async function addTags(id, tags) {
  const d = await gql(`mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`, { id, tags });
  if (d.tagsAdd.userErrors.length) throw new Error('tagsAdd: ' + JSON.stringify(d.tagsAdd.userErrors));
}

export async function removeTags(id, tags) {
  const d = await gql(`mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } } }`, { id, tags });
  if (d.tagsRemove.userErrors.length) throw new Error('tagsRemove: ' + JSON.stringify(d.tagsRemove.userErrors));
}

/** Lista de productos con una etiqueta (para quitar ofertas caducadas aunque falte la BD). */
export async function productsWithTag(tag) {
  const out = [];
  let after = null;
  do {
    const d = await gql(
      `query($q: String!, $after: String) { products(first: 100, query: $q, after: $after) { pageInfo { hasNextPage endCursor } nodes { id title } } }`,
      { q: `tag:'${tag}'`, after },
    );
    out.push(...d.products.nodes);
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  return out;
}

/** Producto existente con ese título exacto (sin distinguir mayúsculas), con sus opciones y tamaños. */
export async function findProductByTitle(title) {
  const q = `title:"${title.replace(/["\\]/g, ' ')}"`;
  const d = await gql(
    `query($q: String!) { products(first: 10, query: $q) { nodes { id title options { name optionValues { name } } } } }`,
    { q },
  );
  return d.products.nodes.find((p) => p.title.toLowerCase() === title.toLowerCase()) || null;
}

let onlineStorePublication = null;
async function getOnlineStorePublicationId() {
  if (process.env.SHOPIFY_PUBLICATION_ID) return process.env.SHOPIFY_PUBLICATION_ID;
  if (onlineStorePublication) return onlineStorePublication;
  const d = await gql(`{ publications(first: 20) { nodes { id catalog { title } } } }`);
  const p = d.publications.nodes.find((n) => /tienda online|online store/i.test(n.catalog?.title || ''));
  if (!p) throw new Error('No encuentro el canal Tienda online');
  onlineStorePublication = p.id;
  return p.id;
}

export async function publishToOnlineStore(productId) {
  const d = await gql(
    `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
    { id: productId, input: [{ publicationId: await getOnlineStorePublicationId() }] },
  );
  const errs = d.publishablePublish.userErrors;
  if (errs.length) throw new Error('publishablePublish: ' + JSON.stringify(errs));
}

/** Crea un producto con uno o varios tamaños y lo publica en la tienda online. */
export async function createProduct(input) {
  const d = await gql(
    `mutation($input: ProductSetInput!) { productSet(input: $input, synchronous: true) { product { id title } userErrors { field message } } }`,
    { input },
  );
  const errs = d.productSet.userErrors;
  if (errs.length) throw new Error('productSet: ' + JSON.stringify(errs));
  const product = d.productSet.product;
  await publishToOnlineStore(product.id);
  return product;
}

/** Añade tamaños nuevos a un producto existente. */
export async function addVariants(productId, variants) {
  const d = await gql(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) { userErrors { field message } }
    }`,
    { productId, variants },
  );
  const errs = d.productVariantsBulkCreate.userErrors;
  if (errs.length) throw new Error('productVariantsBulkCreate: ' + JSON.stringify(errs));
}
