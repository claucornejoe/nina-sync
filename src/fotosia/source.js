// Buscar la foto del producto en Google Imágenes: Serper (SERPER_API_KEY, 2.500 búsquedas gratis)
// o, si no hay, SerpApi (SERPAPI_KEY, la misma que «Competencia»; solo 250 al mes).
import { pickImage, confidence } from './rules.js';

const SERPAPI_BASE = process.env.SERPAPI_BASE || 'https://serpapi.com';
const SERPER_BASE = process.env.SERPER_BASE || 'https://google.serper.dev';
export const serperKey = () => process.env.SERPER_API_KEY || '';
export const serpKey = () => process.env.SERPAPI_KEY || '';
export const searchProvider = () => (serperKey() ? 'Serper' : serpKey() ? 'SerpApi' : '');

const fatal = (msg) => Object.assign(new Error(msg), { fatal: true });

async function serper(q) {
  const res = await fetch(SERPER_BASE + '/images', {
    method: 'POST',
    headers: { 'X-API-KEY': serperKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'es', hl: 'es', num: 20 }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = 'Serper: ' + (j.message || `HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403 || /credit|key/i.test(msg)) throw fatal(msg);
    throw new Error(msg);
  }
  return (j.images || []).map((r) => ({ original: r.imageUrl, width: r.imageWidth, height: r.imageHeight, title: r.title, link: r.link, domain: r.domain || r.source }));
}

async function serpapi(q) {
  const u = new URL(SERPAPI_BASE + '/search.json');
  u.search = new URLSearchParams({ engine: 'google_images', q, gl: 'es', hl: 'es', google_domain: 'google.es', api_key: serpKey() }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const msg = j.error || `HTTP ${res.status}`;
    if (/hasn't returned any results|no results/i.test(msg)) return [];
    if (res.status === 401 || /invalid api key|run out of searches/i.test(msg)) throw fatal('SerpApi: ' + msg);
    throw new Error('SerpApi: ' + msg);
  }
  return (j.images_results || []).map((r) => ({ original: r.original, width: r.original_width, height: r.original_height, title: r.title, link: r.link, domain: r.source }));
}

const images = (q) => (serperKey() ? serper(q) : serpapi(q));

/** Primero por EAN (lo más exacto); si no sale nada útil, por nombre + tamaño (y entonces queda como dudosa). */
export async function findImage(p, ean, size) {
  if (!searchProvider()) throw fatal('Falta SERPER_API_KEY (o SERPAPI_KEY) en Railway');
  if (ean) {
    const r = pickImage(await images(ean), p, true);
    if (r) return { ...r, query: ean, ...confidence(r, p) };
  }
  const q = [p.title, size].filter(Boolean).join(' ');
  const r = pickImage(await images(q), p, false);
  return r ? { ...r, query: q, ...confidence(r, p) } : null;
}

/** Descarga la foto (así Magnific no depende de que la web deje enlazarla). */
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
