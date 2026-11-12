// Cliente mínimo de la API de OpenAI (Responses API) con salida JSON estructurada.
import { seo } from './settings.js';

const URL = () => process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses'; // override solo para pruebas

export function outputText(resp) {
  if (typeof resp.output_text === 'string') return resp.output_text;
  for (const item of resp.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) if (c.type === 'output_text') return c.text;
  }
  return '';
}

// Si OpenAI falla por la cuenta (clave, saldo, modelo), se para la IA una hora para no llenar el informe de errores.
let paused = null; // { until, reason }
function pauseAi(reason) {
  paused = { until: Date.now() + 3600_000, reason };
}
export const aiPaused = () => (paused && paused.until > Date.now() ? paused.reason : null);

/** Devuelve el objeto JSON que pide `schema`. */
export async function askJson({ system, user, schema, name, webSearch = false }, attempt = 0) {
  const key = seo.openaiKey();
  if (!key) throw new Error('Falta OPENAI_API_KEY en Railway');
  if (aiPaused()) throw new Error('IA en pausa: ' + aiPaused());
  const body = {
    model: seo.model,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    text: { format: { type: 'json_schema', name, schema, strict: true } },
  };
  if (/^(gpt-5|o\d)/.test(seo.model)) body.reasoning = { effort: 'low' };
  if (webSearch) body.tools = [{ type: 'web_search' }];

  const res = await fetch(URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const wait = Number(res.headers.get('retry-after')) * 1000 || 3000 * (attempt + 1);
    await new Promise((r) => setTimeout(r, wait));
    return askJson({ system, user, schema, name, webSearch }, attempt + 1);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j.error?.message || 'error';
    // Si el modelo no admite la búsqueda web junto con la respuesta en JSON, se repite sin búsqueda.
    if (res.status === 400 && webSearch) return askJson({ system, user, schema, name, webSearch: false }, attempt);
    if (res.status === 401) pauseAi('la clave de OpenAI no es válida (revisa OPENAI_API_KEY)');
    else if (j.error?.code === 'insufficient_quota' || /quota|billing|credit/i.test(msg)) pauseAi('la cuenta de OpenAI no tiene saldo');
    else if (res.status === 404 || /model/i.test(msg)) pauseAi(`el modelo ${seo.model} no está disponible en tu cuenta (cambia OPENAI_MODEL)`);
    throw new Error(`OpenAI ${res.status}: ${msg}`);
  }
  const text = outputText(j);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('OpenAI no devolvió JSON válido');
  }
}
