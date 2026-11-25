// Buscar una foto del producto en Google Imágenes (SerpApi, misma clave que «Competencia»).
import { pickImage } from './rules.js';

const BASE = process.env.SERPAPI_BASE || 'https://serpapi.com';
export const serpKey = () => process.env.SERPAPI_KEY || '';

async function images(q) {
  const u = new URL(BASE + '/search.json');
  u.search = new URLSearchParams({ engine: 'google_images', q, gl: 'es', hl: 'es', google_domain: 'google.es', api_key: serpKey() }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const msg = j.error || `HTTP ${res.status}`;
    if (/hasn't returned any results|no results/i.test(msg)) return [];
    throw Object.assign(new Error('SerpApi: ' + msg), { fatal: res.status === 401 || /invalid api key|run out of searches/i.test(msg) });
  }
  return j.images_results || [];
}

/** Primero por EAN (lo más exacto); si no sale nada útil, por nombre + tamaño. */
export async function findImage(p, ean, size) {
  if (!serpKey()) throw Object.assign(new Error('Falta SERPAPI_KEY en Railway'), { fatal: true });
  if (ean) {
    const r = pickImage(await images(ean), p);
    if (r) return { ...r, query: ean };
  }
  const q = [p.title, size].filter(Boolean).join(' ');
  const r = pickImage(await images(q), p);
  return r ? { ...r, query: q } : null;
}

/** Descarga la foto y la devuelve en base64 (así Magnific no depende de que la web deje enlazarla). */
export async function download(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NinaSync/1.0)', Accept: 'image/*' },
    signal: AbortSignal.timeout(30_000),
  });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !/^image\//.test(type)) throw new Error(`No se pudo descargar la foto (${res.status} ${type || 'sin tipo'})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error('La foto encontrada es demasiado pequeña');
  return { buf, type };
}
