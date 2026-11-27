// Subir a Shopify la foto aprobada con su nombre para Google y soltar el logo provisional.
import { gql } from '../shopify.js';

/** Productos (solo lo que hace falta aquí). */
const FIELDS = `id title vendor handle status media(first: 10) { nodes { id alt ... on MediaImage { image { url } } } } variants(first: 10) { nodes { title sku } }`;
const shape = (p) => ({
  id: p.id, title: p.title, vendor: p.vendor, handle: p.handle, status: p.status,
  media: p.media.nodes.map((m) => ({ id: m.id, alt: m.alt || '', url: m.image?.url || '' })),
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (errs, what) => { if (errs?.length) throw new Error(`${what}: ${JSON.stringify(errs)}`); };

/**
 * Guarda la foto de Magnific en Archivos de Shopify sin ponerla aún en el producto
 * (los enlaces de Magnific caducan; los de Shopify no). Devuelve { id, url } (url vacía si Shopify aún la procesa).
 */
export async function keepFile(buf, filename, mimeType, alt) {
  const resourceUrl = await stage(buf, filename, mimeType);
  const d = await gql(
    `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id fileStatus ... on MediaImage { image { url } } } userErrors { field message code } } }`,
    { files: [{ originalSource: resourceUrl, contentType: 'IMAGE', alt, filename }] },
  );
  check(d.fileCreate.userErrors, 'fileCreate');
  const f = d.fileCreate.files[0];
  let url = f.image?.url || '';
  for (let i = 0; !url && i < 15; i++) {
    await sleep(2000);
    const n = (await gql(`query($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url } } } }`, { id: f.id })).node;
    if (n?.fileStatus === 'FAILED') throw new Error('Shopify no pudo procesar la foto');
    url = n?.image?.url || '';
  }
  return { id: f.id, url };
}

/** URL de una foto guardada (por si Shopify tardó en procesarla). */
export async function fileUrl(id) {
  const n = (await gql(`query($id: ID!) { node(id: $id) { ... on MediaImage { image { url } } } }`, { id })).node;
  return n?.image?.url || '';
}

/** Borra una foto guardada que no llegó a usarse (descartada o repetida). */
export async function deleteFile(id) {
  const d = await gql(`mutation($ids: [ID!]!) { fileDelete(fileIds: $ids) { deletedFileIds userErrors { field message code } } }`, { ids: [id] });
  check(d.fileDelete.userErrors, 'fileDelete');
}

const markIa = (productId) => gql(
  `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`,
  { m: [{ ownerId: productId, namespace: 'nina_seo', key: 'foto', type: 'single_line_text_field', value: 'ia-magnific' }] },
).then((d) => check(d.metafieldsSet.userErrors, 'metafieldsSet'));

/** Pone en el producto la foto ya guardada en Archivos y suelta las provisionales (el logo compartido no se borra). */
export async function attachFile(productId, fileId, placeholderIds) {
  const d = await gql(`mutation($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { userErrors { field message code } } }`, {
    files: [{ id: fileId, referencesToAdd: [productId] }, ...placeholderIds.map((id) => ({ id, referencesToRemove: [productId] }))],
  });
  check(d.fileUpdate.userErrors, 'fileUpdate (poner foto)');
  await markIa(productId);
}

/** Cambia el texto alternativo de una foto (el renombrado nocturno ajusta luego el nombre del archivo). */
export async function setAlt(fileId, alt) {
  const d = await gql(`mutation($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { userErrors { field message code } } }`, { files: [{ id: fileId, alt }] });
  check(d.fileUpdate.userErrors, 'fileUpdate (alt)');
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
