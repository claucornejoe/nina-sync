// Precios de Google Shopping España a través de SerpApi (plan gratis: unas 250 búsquedas al mes).
import { comp } from './engine.js';

const BASE = process.env.SERPAPI_BASE || 'https://serpapi.com';

/** Busca un EAN en Google Shopping España. Devuelve la lista de ofertas tal como la da SerpApi. */
export async function searchEan(ean) {
  const u = new URL(BASE + '/search.json');
  u.search = new URLSearchParams({
    engine: 'google_shopping',
    q: ean,
    gl: 'es',
    hl: 'es',
    google_domain: 'google.es',
    location: 'Spain',
    api_key: comp.serpKey(),
  }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const msg = j.error || `HTTP ${res.status}`;
    // «Google hasn't returned any results» no es un error: simplemente nadie lo vende.
    if (/hasn't returned any results|no results/i.test(msg)) return [];
    const e = new Error('SerpApi: ' + msg);
    e.fatal = res.status === 401 || /invalid api key|run out of searches|plan/i.test(msg);
    throw e;
  }
  return [...(j.shopping_results || []), ...(j.inline_shopping_results || [])];
}

/** Búsquedas que quedan este mes en la cuenta de SerpApi (no gasta búsquedas). */
export async function account() {
  const res = await fetch(`${BASE}/account.json?api_key=${encodeURIComponent(comp.serpKey())}`, { signal: AbortSignal.timeout(20_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error('SerpApi: ' + (j.error || `HTTP ${res.status}`));
  return { left: j.plan_searches_left ?? j.total_searches_left ?? null, perMonth: j.searches_per_month ?? null, used: j.this_month_usage ?? null, plan: j.plan_name || '' };
}
