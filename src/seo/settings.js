// Ajustes de «Google y descripciones» (Railway > Variables).
const num = (name, def) => (process.env[name] ? Number(process.env[name]) : def);

export const seo = {
  // Clave de OpenAI: se pone SOLO en Railway, nunca en GitHub ni en el chat.
  openaiKey: () => process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-5-mini',
  // La IA puede buscar en internet las notas del perfume si no las conoce con seguridad.
  webSearch: process.env.OPENAI_WEB_SEARCH !== 'false',
  // false = no hace nada solo (ni al crear productos ni en el repaso); el panel sigue funcionando.
  auto: process.env.SEO_AUTO !== 'false',
  // Repaso de productos sin categoría o con la descripción plantilla.
  cron: process.env.SEO_CRON || '20 * * * *', // cada hora, a y 20
  // Tope de descripciones con IA al día (para controlar el gasto de OpenAI).
  maxPerDay: num('SEO_MAX_PER_DAY', 1500),
  // Solo se escriben descripciones con IA en productos creados desde esta fecha (los nuevos).
  // Las fichas que ya existían no se tocan. Se cambia con SEO_DESCRIPCIONES_DESDE (p. ej. 2026-11-13).
  descSince: () => new Date(process.env.SEO_DESCRIPCIONES_DESDE || '2026-11-13T19:00:00Z'),
  concurrency: num('SEO_CONCURRENCY', 3),
  // Productos con esta etiqueta no se tocan (ni categoría ni descripción).
  skipTag: process.env.SEO_SKIP_TAG || 'seo-manual',
  shopName: process.env.SHOP_NAME || 'Nina Beauty',
};

/** PUBLIC_URL con https:// y sin barra final (Shopify rechaza direcciones sin https). */
export function publicBase(raw = process.env.PUBLIC_URL || '') {
  let u = String(raw).trim().replace(/\/+$/, '');
  if (!u) return '';
  u = u.replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\//i.test(u)) u = 'https://' + u;
  return u;
}
