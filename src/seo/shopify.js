// Consultas a Shopify que usa «Google y descripciones». Reutiliza el cliente de Nina Sync.
import { gql } from '../shopify.js';

const PRODUCT_FIELDS = `id title vendor productType tags status descriptionHtml createdAt
  category { id name fullName }
  gGender: metafield(namespace: "mm-google-shopping", key: "gender") { value }
  gAge: metafield(namespace: "mm-google-shopping", key: "age_group") { value }
  gCond: metafield(namespace: "mm-google-shopping", key: "condition") { value }
  ninaDesc: metafield(namespace: "nina_seo", key: "descripcion") { value }
  ninaFoto: metafield(namespace: "nina_seo", key: "foto") { value }
  media(first: 20) { nodes { id ... on MediaImage { image { url } } } }
  variants(first: 50) { nodes { id title sku barcodes(first: 3) { nodes { value } } } }`;

const shape = (p) => ({
  id: p.id,
  title: p.title,
  vendor: p.vendor,
  productType: p.productType,
  tags: p.tags,
  status: p.status,
  createdAt: p.createdAt,
  descriptionHtml: p.descriptionHtml,
  category: p.category,
  google: { gender: p.gGender?.value, ageGroup: p.gAge?.value, condition: p.gCond?.value },
  aiDescription: p.ninaDesc?.value || null,
  photoMark: p.ninaFoto?.value || null,
  media: (p.media?.nodes || []).map((m) => ({ id: m.id, url: m.image?.url || '' })),
  variants: p.variants.nodes.map((v) => ({ id: v.id, title: v.title, sku: (v.sku || '').trim(), barcodes: v.barcodes.nodes.map((b) => b.value) })),
});

export async function getProduct(id) {
  const d = await gql(`query($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`, { id });
  return d.product ? shape(d.product) : null;
}

/** Recorre todos los productos (para el repaso y el contador del panel). */
export async function* allProducts() {
  let after = null;
  do {
    const d = await gql(
      `query($after: String) { products(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${PRODUCT_FIELDS} } } }`,
      { after },
    );
    for (const p of d.products.nodes) yield shape(p);
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
}

export async function updateProduct(input) {
  const d = await gql(
    `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id } userErrors { field message } } }`,
    { product: input },
  );
  const errs = d.productUpdate.userErrors;
  if (errs.length) throw new Error('productUpdate: ' + JSON.stringify(errs));
}

export async function setBarcodes(productId, variants) {
  const d = await gql(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
    }`,
    { productId, variants: variants.map((v) => ({ id: v.id, barcodes: [{ type: 'EAN', value: v.ean }] })) },
  );
  const errs = d.productVariantsBulkUpdate.userErrors;
  if (errs.length) throw new Error('barcodes: ' + JSON.stringify(errs));
}

/** Categorías hoja de la taxonomía de Shopify que coinciden con un término. */
export async function searchCategories(term) {
  const d = await gql(
    `query($q: String!) { taxonomy { categories(first: 15, search: $q) { nodes { id fullName isLeaf isArchived } } } }`,
    { q: term },
  );
  return d.taxonomy.categories.nodes.filter((c) => !c.isArchived);
}

/** Se suscribe a «producto creado» (si no lo estaba ya). */
export async function ensureWebhook(uri) {
  const d = await gql(`query($uri: String!) { webhookSubscriptions(first: 5, topics: [PRODUCTS_CREATE], uri: $uri) { nodes { id } } }`, { uri });
  if (d.webhookSubscriptions.nodes.length) return 'ya estaba';
  const c = await gql(
    `mutation($sub: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic: PRODUCTS_CREATE, webhookSubscription: $sub) { webhookSubscription { id } userErrors { field message } } }`,
    { sub: { uri, format: 'JSON' } },
  );
  const errs = c.webhookSubscriptionCreate.userErrors;
  if (errs.length) throw new Error('webhookSubscriptionCreate: ' + JSON.stringify(errs));
  return 'creado';
}

/** Sustituye imágenes: borra las indicadas y añade la nueva (queda como principal si no hay otras). */
export async function replaceImages(productId, removeIds, source, alt) {
  if (removeIds.length) {
    const d = await gql(`mutation($ids: [ID!]!) { fileDelete(fileIds: $ids) { deletedFileIds userErrors { field message code } } }`, { ids: removeIds });
    const errs = d.fileDelete.userErrors;
    if (errs.length) throw new Error('fileDelete: ' + JSON.stringify(errs));
  }
  const d = await gql(
    `mutation($product: ProductUpdateInput!, $media: [CreateMediaInput!]) { productUpdate(product: $product, media: $media) { userErrors { field message } } }`,
    { product: { id: productId }, media: [{ originalSource: source, mediaContentType: 'IMAGE', alt }] },
  );
  const errs = d.productUpdate.userErrors;
  if (errs.length) throw new Error('productUpdate(media): ' + JSON.stringify(errs));
}
