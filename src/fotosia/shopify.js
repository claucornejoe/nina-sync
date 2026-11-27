// Subir a Shopify la foto aprobada con su nombre para Google y soltar el logo provisional.
import { gql } from '../shopify.js';

/** Productos (solo lo que hace falta aquí). */
const FIELDS = `id title vendor handle status media(first: 10) { nodes { id ... on MediaImage { image { url } } } } variants(first: 10) { nodes { title sku } }`;
const shape = (p) => ({
  id: p.id, title: p.title, vendor: p.vendor, handle: p.handle, status: p.status,
  media: p.media.nodes.map((m) => ({ id: m.id, url: m.image?.url || '' })),
  variants: p.variants.nodes.map((v) => ({ title: v.title, sku: (v.sku || '').trim() })),
});

export async function getProduct(id) {
  const d = await gql(`query($id: ID!) { product(id: $id) { ${FIELDS} } }`, { id });
  return d.product ? shape(d.product) : null;
}

export async function* allProducts() {
  let after = null;
  do {
    const d = await gql(`query($after: String) { products(first: 100, after: $after, query: "status:active") { pageInfo { hasNextPage endCursor } nodes { ${FIELDS} } } }`, { after });
    for (const p of d.products.nodes) yield shape(p);
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
}

/** Sube los bytes con el nombre de archivo elegido (stagedUploads) y devuelve la URL interna para usarla como media. */
export async function stage(buf, filename, mimeType) {
  const d = await gql(
    `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`,
    { input: [{ resource: 'IMAGE', filename, mimeType, httpMethod: 'POST', fileSize: String(buf.length) }] },
  );
  const r = d.stagedUploadsCreate;
  if (r.userErrors.length) throw new Error('stagedUploadsCreate: ' + JSON.stringify(r.userErrors));
  const t = r.stagedTargets[0];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buf], { type: mimeType }), filename);
  const res = await fetch(t.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Subida a Shopify: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return t.resourceUrl;
}

/**
 * Añade la foto nueva como principal y suelta las provisionales del producto.
 * El logo compartido (NinaBeauty_rrss_rosa.png) lo usan ~1.300 productos: no se borra, solo se desvincula de este.
 */
export async function attach(productId, resourceUrl, alt, placeholderIds) {
  const d = await gql(
    `mutation($product: ProductUpdateInput!, $media: [CreateMediaInput!]) { productUpdate(product: $product, media: $media) { product { media(first: 1) { nodes { id } } } userErrors { field message } } }`,
    {
      product: { id: productId, metafields: [{ namespace: 'nina_seo', key: 'foto', type: 'single_line_text_field', value: 'ia-magnific' }] },
      media: [{ originalSource: resourceUrl, mediaContentType: 'IMAGE', alt }],
    },
  );
  const errs = d.productUpdate.userErrors;
  if (errs.length) throw new Error('productUpdate(media): ' + JSON.stringify(errs));
  if (placeholderIds.length) {
    const u = await gql(`mutation($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { userErrors { field message code } } }`, {
      files: placeholderIds.map((id) => ({ id, referencesToRemove: [productId] })),
    });
    const e2 = u.fileUpdate.userErrors;
    if (e2.length) throw new Error('fileUpdate (soltar logo): ' + JSON.stringify(e2));
  }
}
