// Magnific: Nano Banana 2.1 a 1K (si su API lo ofrece) y, si no, Nano Banana 2 («Nano Banana Pro Flash»).
// Docs Nano Banana 2: https://docs.magnific.com/api-reference/text-to-image/nano-banana-pro-flash/generate
// La documentación de la API no trae aún la 2.1: se prueban sus nombres probables y, si dan 404, se pasa a la 2
// (un 404 no gasta créditos). MAGNIFIC_MODEL fija un modelo concreto y se salta la prueba.
const BASE = () => (process.env.MAGNIFIC_BASE || 'https://api.magnific.com').replace(/\/+$/, '');
const RESOLUTION = () => process.env.MAGNIFIC_RESOLUTION || '1K';
export const magnificKey = () => process.env.MAGNIFIC_API_KEY || '';

export const MODELS = [
  { path: 'text-to-image/nano-banana-2-1', label: 'Nano Banana 2.1' },
  { path: 'text-to-image/nano-banana-2.1', label: 'Nano Banana 2.1' },
  { path: 'text-to-image/nano-banana-pro-flash', label: 'Nano Banana 2' },
];
const missing = new Set(); // modelos que Magnific no tiene por API (404)
export function candidates() {
  const fixed = (process.env.MAGNIFIC_MODEL || '').replace(/^\/+|\/+$/g, '');
  if (fixed) return [{ path: fixed, label: MODELS.find((m) => m.path === fixed)?.label || fixed }];
  return MODELS.filter((m) => !missing.has(m.path));
}
export const currentModel = () => candidates()[0]?.label || '';

const headers = () => ({ 'Content-Type': 'application/json', 'x-magnific-api-key': magnificKey() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body) {
  const res = await fetch(BASE() + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const extra = (j.invalid_params || []).map((x) => `${x.field || x.name}: ${x.reason}`).join('; ');
    const msg = [j.message || j.detail || j.title || `HTTP ${res.status}`, extra].filter(Boolean).join(' — ');
    const e = new Error(`Magnific: ${msg}`);
    e.status = res.status;
    e.fatal = res.status === 401 || res.status === 402 || /credit|api key/i.test(msg);
    throw e;
  }
  return j.data || j;
}

export function requestBody(imageUrl, mimeType, prompt) {
  return { prompt, reference_images: [{ image: imageUrl, mime_type: mimeType }], aspect_ratio: '1:1', resolution: RESOLUTION() };
}

/** Manda la foto (URL pública) y el prompt; espera hasta 4 minutos. Devuelve { url, model }. */
export async function generate(imageUrl, mimeType, prompt) {
  if (!magnificKey()) throw Object.assign(new Error('Falta MAGNIFIC_API_KEY en Railway'), { fatal: true });
  let t;
  let model;
  for (const m of candidates()) {
    try {
      t = await call('POST', `/v1/ai/${m.path}`, requestBody(imageUrl, mimeType, prompt));
      model = m;
      break;
    } catch (e) {
      if ((e.status === 404 || e.status === 405 || (e.status === 400 && /not found|no route|unknown|path/i.test(e.message))) && !process.env.MAGNIFIC_MODEL) {
        missing.add(m.path);
        console.log(`Fotos IA: Magnific no tiene ${m.path} por API; pruebo el siguiente modelo.`);
        continue;
      }
      throw e;
    }
  }
  if (!model) throw Object.assign(new Error('Magnific no ofrece Nano Banana por API'), { fatal: true });
  if (t.generated?.length) return { url: t.generated[0], model: model.label };
  if (!t.task_id) throw new Error('Magnific no devolvió task_id');
  for (let i = 0; i < 60; i++) {
    await sleep(4000);
    const s = await call('GET', `/v1/ai/${model.path}/${t.task_id}`);
    if (s.status === 'COMPLETED' && s.generated?.length) return { url: s.generated[0], model: model.label };
    if (s.status === 'FAILED') throw new Error('Magnific: la generación falló');
  }
  throw new Error('Magnific tardó más de 4 minutos');
}
