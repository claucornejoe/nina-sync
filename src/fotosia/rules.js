// Reglas puras de «Fotos con IA» (sin red ni base de datos), para poder probarlas.
import { slugify } from '../seo/filenames.js';

// Fotos provisionales que hay que sustituir: la de BTS «no image», el logo compartido y las copias sin-foto*.png.
const PLACEHOLDER = /(\/no_image[^/]*|\/NinaBeauty_rrss_rosa[^/]*|\/sin-foto[^/]*)\.(webp|png|jpe?g)(\?|$)/i;
export const isPlaceholder = (url) => PLACEHOLDER.test(String(url || ''));

/** Un producto necesita foto si no tiene ninguna o solo tiene fotos provisionales. */
export const needsPhoto = (p) => !(p.media || []).length || (p.media || []).every((m) => isPlaceholder(m.url));

export const slug = slugify;

const SIZE = /\b\d+(?:[.,]\d+)?\s?(?:ml|g|gr|oz)\b/i;
/** Tamaño del primer formato del producto («100ml»), si lo hay. */
export function sizeOf(p) {
  for (const v of p.variants || []) {
    const m = String(v.title || '').match(SIZE);
    if (m) return m[0].replace(/\s/g, '').toLowerCase();
  }
  return '';
}

// Estuches y sets en el nombre de BTS: «Set …», «Estuche 2 Piezas», «4 X 6ml», «Sg» (con gel), «Gel75», «Bl50», «+ …».
const SET_TITLE = /\b(sets?|estuches?|lotes?|coffrets?|packs?|kits?|piezas|duo|trio|neceser|sg|miniatures|miniaturas)\b|\d\s?x\s?\d|\+|\b(gel|sgel|g|bl|lc|body|desodorante|deo|balm|mini)\s?\d+\s?(ml|g)?\b|\bdesodorante\b.*\beau\b|\beau\b.*\bdesodorante\b/i;
/** ¿El producto es un estuche o set (varias piezas)? */
export const isSetTitle = (title) => SET_TITLE.test(String(title || ''));

// El nombre ya lleva tamaño: «50ml», «Edt100», «125v», «150 Eau de Toilette», «Eau de Parfum 100 Unisex».
// (solo números de tamaño habituales, para no confundir «Baccarat 540», «212 VIP» o «Gritti 19-68»).
const ML = '(?:15|20|25|30|35|40|45|50|60|65|70|75|80|85|90|100|110|120|125|150|160|175|180|200|240|250|300|350|400|500)';
const TITLE_SIZE = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s?(?:ml|g|gr|oz)\\b|\\b(?:edt|edp|edc)\\s?\\d+|\\b${ML}\\s?(?:v|vap|vapo|sp|spray|un|unisex|eau|edt|edp)\\b`, 'i');

/**
 * Texto alternativo de la foto: nombre del producto y tamaño del formato.
 * Si el nombre ya trae un tamaño o es un estuche, no se añade (BTS pone a veces otro tamaño en el formato:
 * «1 Million 50 Eau de Toilette Sg» viene con formato «100ml», y saldría un nombre falso).
 */
export function altOf(p) {
  const title = String(p.title || '').trim();
  if (TITLE_SIZE.test(title) || isSetTitle(title)) return title;
  return [title, sizeOf(p)].filter(Boolean).join(' ');
}

/**
 * Nombre del archivo = nombre del producto (mismo formato que el renombrado de fotos para Google,
 * src/seo/filenames.js, que lo saca del texto alternativo; así el repaso nocturno no lo vuelve a cambiar).
 */
export const fileName = (p, ext = 'png') => `${slugify(altOf(p)) || 'producto'}.${ext}`;

export const extFor = (mime) => (/webp/.test(mime) ? 'webp' : /jpe?g/.test(mime) ? 'jpg' : 'png');

/**
 * Prompt de Clau (27-11-2026), con el nombre del producto, su frase de alejar un 20 % en inglés
 * y que no cambie el texto de la etiqueta. MAGNIFIC_PROMPT lo sustituye ({producto} = nombre y tamaño).
 */
export function buildPrompt(p) {
  const name = altOf(p);
  if (process.env.MAGNIFIC_PROMPT) return process.env.MAGNIFIC_PROMPT.replaceAll('{producto}', name);
  return [
    `Commercial e-commerce product photography of "${name}" @img1.`,
    'Strictly preserve the exact original geometry, silhouettes, curved and rounded bottoms, labels, and packaging details without flattening or altering their bases.',
    'Keep every word, logo and colour on the label exactly as in the reference image.',
    'Place the product resting naturally on a surface with accurate, delicate contact shadows directly beneath its true rounded edges.',
    'White studio background optimized for Google Shopping.',
    'High-resolution studio lighting, sharp focus, centered composition, square 1:1 format.',
    'If the product appears too close or cropped, zoom out by about 20% so the whole product fits with some margin.',
  ].join(' ');
}

// Palabras que no sirven para reconocer un producto concreto.
const GENERIC = new Set(
  'eau de du la le les el los las of the and y for pour femme homme men women man woman parfum perfume toilette cologne colonia edp edt spray vapo vaporizador ml g gr oz set estuche piezas pieza crema cream serum gel locion lotion intense intensa new nuevo nueva mini travel unisex body'.split(' '),
);
export function keyWords(p) {
  const brand = new Set(slug(p.vendor).split('-'));
  return [...new Set(slug(p.title).split('-'))].filter((w) => w.length >= 3 && !GENERIC.has(w) && !brand.has(w) && !/^\d+$/.test(w));
}

const SKIP = /(shutterstock|istockphoto|gettyimages|alamy|dreamstime|123rf|depositphotos|freepik|pinterest|instagram|facebook|tiktok|youtube|ebay|aliexpress|temu|wallapop|vinted|milanuncios)\./i;

// La foto de la web es de un estuche si su título o su enlace lo dicen (en varios idiomas).
const SET_PHOTO = /\b(sets?|giftset|gift|coffrets?|cofanetto|confezione|estuches?|kits?|lotes?|packs?|geschenkset|duo|trio|piezas|pieces|pcs|miniatures|miniaturas)\b|\bshower[-\s]gel\b|\bgel[-\s]de[-\s]ducha\b|\bbody[-\s]lotion\b|\s\+\s/i;
export function looksLikeSet(r) {
  const raw = [r?.title, r?.link].filter(Boolean).join(' ');
  return SET_PHOTO.test(raw) || SET_PHOTO.test(slug(raw).replace(/-/g, ' '));
}

/**
 * ¿La foto encontrada es con seguridad este producto?
 * Segura = salió buscando el EAN, el texto de la foto nombra la marca y al menos una palabra propia del producto,
 * y los dos son estuche (o los dos frasco solo).
 * Devuelve { ok, why } (why explica la duda).
 */
export function confidence(r, p) {
  if (!r) return { ok: false, why: 'No encontré ninguna foto' };
  const text = slug([r.title, r.link, r.domain].filter(Boolean).join(' '));
  const brandWords = slug(p.vendor).split('-').filter((w) => w.length >= 3);
  const words = keyWords(p);
  if (!r.viaEan) return { ok: false, why: 'Por EAN no salió nada; la encontré por el nombre' };
  if (brandWords.length && !brandWords.some((w) => text.includes(w))) return { ok: false, why: 'La foto encontrada no nombra la marca' };
  if (words.length && !words.some((w) => text.includes(w))) return { ok: false, why: 'La foto encontrada no nombra el producto' };
  const photoSet = looksLikeSet(r);
  const productSet = isSetTitle(p.title);
  if (photoSet && !productSet) return { ok: false, why: 'La foto encontrada parece un estuche o set, y este producto es un frasco solo' };
  if (productSet && !photoSet) return { ok: false, why: 'Este producto es un estuche o set, y la foto encontrada parece un frasco solo' };
  return { ok: true, why: '' };
}

/** Elige la mejor foto: primero las seguras, luego grandes; descarta bancos de imágenes y redes. */
export function pickImage(results, p, viaEan) {
  const ok = (results || []).filter((r) => r.original && /^https?:/.test(r.original) && !SKIP.test(r.original) && !SKIP.test(r.link || ''));
  const size = (r) => (Math.min(r.width || 0, r.height || 0) >= 600 ? 2 : (r.width || 0) >= 400 ? 1 : 0);
  const scored = ok.map((r) => ({ ...r, viaEan }));
  scored.sort((a, b) => (confidence(b, p).ok - confidence(a, p).ok) || size(b) - size(a));
  return scored[0] || null;
}
