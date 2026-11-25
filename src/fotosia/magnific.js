// Magnific (antes Freepik API): Nano Banana 2 / 2.1 = «Nano Banana Pro Flash» (Gemini 3.1 Flash Image) a 1K.
// Docs: https://docs.magnific.com/api-reference/text-to-image/nano-banana-pro-flash/generate
const BASE = () => (process.env.MAGNIFIC_BASE || 'https://api.magnific.com').replace(/\/+$/, '');
// Cambiar de modelo sin tocar código: MAGNIFIC_MODEL=text-to-image/nano-banana-pro (Nano Banana Pro).
const MODEL = () => (process.env.MAGNIFIC_MODEL || 'text-to-image/nano-banana-pro-flash').replace(/^\/+|\/+$/g, '');
const RESOLUTION = () => process.env.MAGNIFIC_RESOLUTION || '1K';
export const magnificKey = () => process.env.MAGNIFIC_API_KEY || '';

const headers = () => ({ 'Content-Type': 'application/json', 'x-magnific-api-key': magnificKey() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body) {
  const res = await fetch(BASE() + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const extra = (j.invalid_params || []).map((x) => `${x.field || x.name}: ${x.reason}`).join('; ');
    const msg = [j.message || j.detail || j.title || `HTTP ${res.status}`, extra].filter(Boolean).join(' — ');
    const e = new Error(`Magnific: ${msg}`);
    e.fatal = res.status === 401 || res.status === 402 || /credit|api key/i.test(msg);
    throw e;
  }
  return j.data || j;
}

export function requestBody(imageUrl, mimeType, prompt) {
  return { prompt, reference_images: [{ image: imageUrl, mime_type: mimeType }], aspect_ratio: '1:1', resolution: RESOLUTION() };
}

/** Manda la foto (URL pública) y el prompt; espera hasta 4 minutos y devuelve la URL de la foto nueva. */
export async function generate(imageUrl, mimeType, prompt) {
  if (!magnificKey()) throw Object.assign(new Error('Falta MAGNIFIC_API_KEY en Railway'), { fatal: true });
  const t = await call('POST', `/v1/ai/${MODEL()}`, requestBody(imageUrl, mimeType, prompt));
  if (t.generated?.length) return t.generated[0];
  if (!t.task_id) throw new Error('Magnific no devolvió task_id');
  for (let i = 0; i < 60; i++) {
    await sleep(4000);
    const s = await call('GET', `/v1/ai/${MODEL()}/${t.task_id}`);
    if (s.status === 'COMPLETED' && s.generated?.length) return s.generated[0];
    if (s.status === 'FAILED') throw new Error('Magnific: la generación falló');
  }
  throw new Error('Magnific tardó más de 4 minutos');
}
