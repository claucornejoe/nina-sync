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

/** Devuelve el objeto JSON que pide `schema`. */
export async function askJson({ system, user, schema, name, webSearch = false }, attempt = 0) {
  const key = seo.openaiKey();
  if (!key) throw new Error('Falta OPENAI_API_KEY en Railway');
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
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${j.error?.message || 'error'}`);
  const text = outputText(j);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('OpenAI no devolvió JSON válido');
  }
}
