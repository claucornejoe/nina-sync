// Reglas puras de «Fotos con IA» (sin red ni base de datos), para poder probarlas.

// Fotos provisionales que hay que sustituir: la de BTS «no image», el logo compartido y las copias sin-foto*.png.
const PLACEHOLDER = /(\/no_image[^/]*|\/NinaBeauty_rrss_rosa[^/]*|\/sin-foto[^/]*)\.(webp|png|jpe?g)(\?|$)/i;
export const isPlaceholder = (url) => PLACEHOLDER.test(String(url || ''));

/** Un producto necesita foto si no tiene ninguna o solo tiene fotos provisionales. */
export const needsPhoto = (p) => !(p.media || []).length || (p.media || []).every((m) => isPlaceholder(m.url));

/** «Carolina Herrera Good Girl» → «carolina-herrera-good-girl» (sin tildes, minúsculas, guiones). */
export function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

const SIZE = /\b\d+(?:[.,]\d+)?\s?(?:ml|g|gr|oz)\b/i;
/** Tamaño del primer formato del producto («100ml»), si lo hay. */
export function sizeOf(p) {
  for (const v of p.variants || []) {
    const m = String(v.title || '').match(SIZE);
    if (m) return m[0].replace(/\s/g, '').toLowerCase();
  }
  return '';
}

/** Nombre de archivo para Google: marca-producto-tamano.ext (sin repetir la marca si el título ya la lleva). */
export function fileName(p, ext = 'png') {
  const t = slug(p.title);
  const brand = slug(p.vendor);
  const base = brand && !t.startsWith(brand) ? `${brand}-${t}` : t;
  const size = slug(sizeOf(p));
  const name = [base, size && !base.endsWith(size) ? size : ''].filter(Boolean).join('-').slice(0, 120).replace(/-+$/, '');
  return `${name || 'producto'}.${ext}`;
}

export const extFor = (mime) => (/webp/.test(mime) ? 'webp' : /jpe?g/.test(mime) ? 'jpg' : 'png');

/**
 * Prompt para Nano Banana. En inglés porque el modelo lo sigue mejor; la regla clave es no tocar el producto ni su etiqueta.
 * Se puede cambiar entero con la variable MAGNIFIC_PROMPT (usa {producto} donde va el nombre).
 */
export function buildPrompt(p) {
  const name = [p.title, sizeOf(p)].filter(Boolean).join(' ');
  if (process.env.MAGNIFIC_PROMPT) return process.env.MAGNIFIC_PROMPT.replaceAll('{producto}', name);
  return [
    `Professional e-commerce packshot of the product "${name}".`,
    'Use the reference image as the one and only source of truth for the product: reproduce the exact same bottle or packaging,',
    'with identical shape, proportions, colours, cap, materials, logo, typography and every word printed on the label.',
    'Do not redesign, redraw, translate, add or remove any text, and do not invent details that are not visible in the reference.',
    'If the reference shows the product next to its box, keep both exactly as shown.',
    'Remove everything else: background, hands, props, other products, watermarks, price tags and shop logos.',
    'Show only this product, centred, straight front view, on a pure white seamless background (#FFFFFF),',
    'soft even studio lighting, a subtle natural contact shadow under the product, sharp focus, high resolution,',
    'square 1:1 image with the product filling about 80% of the height. No text overlays, no frames, no reflections of other objects.',
  ].join(' ');
}

/** Elige la mejor foto de Google Imágenes: grande, no de bancos de imágenes ni redes, y mejor si el título cita la marca. */
const SKIP = /(shutterstock|istockphoto|gettyimages|alamy|dreamstime|123rf|depositphotos|freepik|pinterest|instagram|facebook|tiktok|youtube|ebay|aliexpress|temu|wallapop|vinted|milanuncios)\./i;
export function pickImage(results, p) {
  const brand = slug(p.vendor).split('-')[0];
  const ok = (results || []).filter((r) => r.original && /^https?:/.test(r.original) && !SKIP.test(r.original) && !SKIP.test(r.link || ''));
  const score = (r) =>
    (Math.min(r.original_width || 0, r.original_height || 0) >= 600 ? 2 : (r.original_width || 0) >= 400 ? 1 : 0) +
    (brand && slug(r.title).includes(brand) ? 1 : 0);
  return [...ok].sort((a, b) => score(b) - score(a))[0] || null;
}
