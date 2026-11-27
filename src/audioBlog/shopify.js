// Shopify para «Escuchar artículo»: leer los artículos de Nina Blog, subir el MP3 a Archivos
// y guardar en el artículo el metacampo nina.audio (enlace + tiempos de cada palabra).
// Permisos de la app: read_content y write_content (artículos) y write_files (archivos).
import { gql } from '../shopify.js';

export const BLOG_HANDLE = process.env.AUDIO_BLOG_HANDLE || 'nina-blog';
export const NS = 'nina';
export const KEY = 'audio';

const scopeHint = (e) =>
  /access denied|ACCESS_DENIED|scope|permission/i.test(e.message)
    ? new Error('A la app de Shopify le faltan permisos: añade read_content, write_content y write_files en el Dev Dashboard (versión nueva) y pulsa Deploy en Railway. Detalle: ' + e.message.slice(0, 200))
    : e;

/** Artículos del blog con el resumen de su audio (sin los tiempos, que pesan). */
export async function listArticles() {
  try {
    const d = await gql(
      `query($q: String!) { blogs(first: 1, query: $q) { nodes { id handle title articles(first: 100, reverse: true) { nodes {
        id title handle summary body isPublished publishedAt updatedAt image { url }
        metafield(namespace: "${NS}", key: "${KEY}") { value } } } } } }`,
      { q: `handle:${BLOG_HANDLE}` },
    );
    const blog = d.blogs.nodes[0];
    if (!blog) throw new Error(`No existe el blog «${BLOG_HANDLE}» en Shopify`);
    return blog.articles.nodes.map((a) => {
      let audio = null;
      if (a.metafield?.value) {
        try {
          const j = JSON.parse(a.metafield.value);
          audio = { url: j.url, fileId: j.fileId, dur: j.dur, voz: j.voz, vozId: j.vozId, modelo: j.modelo, hash: j.hash, fecha: j.fecha, frases: j.s?.length || 0 };
        } catch { audio = { roto: true }; }
      }
      return { id: a.id, title: a.title, handle: a.handle, summary: a.summary, body: a.body, isPublished: a.isPublished, updatedAt: a.updatedAt, image: a.image?.url || '', audio };
    });
  } catch (e) { throw scopeHint(e); }
}

export async function getArticle(id) {
  return (await listArticles()).find((a) => a.id === id) || null;
}

/** Sube el MP3 a Contenido → Archivos y espera a que Shopify dé su enlace. */
export async function uploadAudio(buf, filename) {
  const d = await gql(
    `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`,
    { input: [{ resource: 'FILE', filename, mimeType: 'audio/mpeg', httpMethod: 'POST', fileSize: String(buf.length) }] },
  );
  const r = d.stagedUploadsCreate;
  if (r.userErrors.length) throw scopeHint(new Error('stagedUploadsCreate: ' + JSON.stringify(r.userErrors)));
  const t = r.stagedTargets[0];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), filename);
  const up = await fetch(t.url, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`Subida del audio a Shopify: HTTP ${up.status} ${(await up.text()).slice(0, 200)}`);

  const c = await gql(
    `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id } userErrors { field message code } } }`,
    { files: [{ originalSource: t.resourceUrl, contentType: 'FILE', filename, duplicateResolutionMode: 'APPEND_UUID' }] },
  );
  if (c.fileCreate.userErrors.length) throw scopeHint(new Error('fileCreate: ' + JSON.stringify(c.fileCreate.userErrors)));
  const id = c.fileCreate.files[0].id;
  for (let i = 0; i < 40; i++) {
    const n = await gql(`query($id: ID!) { node(id: $id) { ... on GenericFile { url fileStatus fileErrors { message } } } }`, { id });
    const f = n.node;
    if (f?.fileStatus === 'READY' && f.url) return { id, url: f.url };
    if (f?.fileStatus === 'FAILED') throw new Error('Shopify no pudo procesar el audio: ' + (f.fileErrors || []).map((e) => e.message).join(', '));
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error('Shopify tarda demasiado en procesar el audio; vuelve a intentarlo en unos minutos');
}

export async function deleteFile(id) {
  if (!id) return;
  try {
    await gql(`mutation($ids: [ID!]!) { fileDelete(fileIds: $ids) { userErrors { message } } }`, { ids: [id] });
  } catch (e) {
    console.error('Audio blog: no se pudo borrar el audio antiguo', e.message);
  }
}

export async function saveAudio(articleId, data) {
  try {
    const d = await gql(
      `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message code } } }`,
      { m: [{ ownerId: articleId, namespace: NS, key: KEY, type: 'json', value: JSON.stringify(data) }] },
    );
    if (d.metafieldsSet.userErrors.length) throw new Error('metafieldsSet: ' + JSON.stringify(d.metafieldsSet.userErrors));
  } catch (e) { throw scopeHint(e); }
}

export async function removeAudio(articleId) {
  try {
    await gql(
      `mutation($m: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $m) { userErrors { field message } } }`,
      { m: [{ ownerId: articleId, namespace: NS, key: KEY }] },
    );
  } catch (e) { throw scopeHint(e); }
}
