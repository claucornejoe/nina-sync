// Fotos: los productos que BTS trae con la imagen «No image available» reciben la foto real de otro
// tamaño (si BTS la tiene) o, mientras tanto, el logo de Nina Beauty.
import { publicBase } from './settings.js';
import { fetchCatalog } from '../bts.js';

const PLACEHOLDER = /\/no_image[^/]*\.(webp|png|jpe?g)(\?|$)/i;

export const isPlaceholderUrl = (url) => PLACEHOLDER.test(String(url || ''));

export function placeholderMedia(p) {
  return (p.media || []).filter((m) => isPlaceholderUrl(m.url));
}

/** URL pública del logo provisional (public/sin-foto.png servido por el panel). */
export function logoUrl() {
  if (process.env.NO_PHOTO_URL) return process.env.NO_PHOTO_URL;
  return publicBase() ? publicBase() + '/static/sin-foto.png' : '';
}

/** Foto real de BTS de cualquiera de los tamaños del producto, o null. */
export async function realImageFor(p) {
  const eans = p.variants.map((v) => v.sku).filter(Boolean);
  if (!eans.length || !process.env.BTS_TOKEN) return null;
  const bts = await fetchCatalog(eans);
  for (const e of eans) {
    const img = bts.get(e)?.image;
    if (img && /^https?:/.test(img) && !isPlaceholderUrl(img)) return img;
  }
  return null;
}
