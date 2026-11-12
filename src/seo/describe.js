// Descripción breve para la ficha y para Google Merchant Center.
// Google pide que la descripción hable solo del producto: sin precios, envíos, ofertas,
// enlaces, «compra ya», mayúsculas de grito ni datos de la tienda. La IA solo da los datos;
// el HTML lo montamos aquí para que siempre cumpla esas reglas.
import { perfumeTypeLabel, isPerfume } from './categories.js';

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intro', 'familia_olfativa', 'notas_salida', 'notas_corazon', 'notas_fondo', 'detalles', 'seguro'],
  properties: {
    intro: { type: 'string', description: '2 o 3 frases (máx. 420 caracteres) que describen el producto y cómo es.' },
    familia_olfativa: { type: 'string', description: 'Familia olfativa (p. ej. «Oriental floral»). Vacío si no se sabe con seguridad o no es perfume.' },
    notas_salida: { type: 'array', items: { type: 'string' } },
    notas_corazon: { type: 'array', items: { type: 'string' } },
    notas_fondo: { type: 'array', items: { type: 'string' } },
    detalles: { type: 'array', items: { type: 'string' }, description: 'Solo si aportan algo: hasta 3 datos objetivos (contenido de un estuche, acabado, uso). No repitas marca, tipo, concentración, género ni tamaños. Sin precios ni envíos. Normalmente vacío en perfumes.' },
    seguro: { type: 'boolean', description: 'true si las notas y la familia están comprobadas en una fuente fiable o se conocen con certeza.' },
  },
};

const GENDER_ES = { Mujer: 'para mujer', Hombre: 'para hombre', Unisex: 'unisex' };

export function productFacts(p) {
  const gender = ['Mujer', 'Hombre', 'Unisex'].find((g) => (p.tags || []).includes(g)) || '';
  const sizes = (p.variants || []).map((v) => v.title).filter((t) => t && !/^(default title|único|estuche)$/i.test(t));
  return { title: p.title, brand: p.vendor || '', type: perfumeTypeLabel(p), gender, sizes, perfume: isPerfume(p) };
}

export function buildPrompt(p, { webSearch }) {
  const f = productFacts(p);
  const system = [
    `Eres redactora de fichas de producto de una perfumería online española. Escribes en español de España, con tono cercano y elegante.`,
    `Reglas de Google Merchant Center que debes cumplir: habla SOLO del producto; nada de precios, descuentos, ofertas, envíos, plazos, devoluciones, «compra», «mejor precio», «original», nombre de la tienda, enlaces, emojis ni MAYÚSCULAS de énfasis; no compares con otras marcas.`,
    `No inventes nada. Si no conoces con seguridad la familia olfativa o las notas${webSearch ? ', búscalas en internet (web oficial de la marca, Fragrantica, Notino o Douglas); si tampoco las encuentras' : ''}, deja esos campos vacíos y pon seguro=false.`,
    `Nada de afirmaciones médicas o de salud (curar, tratar, prevenir enfermedades, adelgazar) ni promesas de resultados garantizados: Google las rechaza. En cosmética describe textura, acabado, tipo de piel y uso; en complementos, solo qué contiene y cómo se toma según el envase.`,
    `Las notas, en español y en minúscula (p. ej. «bergamota», «pachuli»). Máximo 5 por grupo.`,
  ].join('\n');
  const user = [
    `Producto: ${f.title}`,
    f.brand && `Marca: ${f.brand}`,
    f.type && `Tipo: ${f.type}`,
    f.gender && `Para: ${GENDER_ES[f.gender] || f.gender}`,
    f.sizes.length && `Tamaños: ${f.sizes.join(', ')}`,
    !f.perfume && p.productType && `Categoría: ${p.productType}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

// Frases que Google no admite en la descripción.
const BANNED = /(env[ií]o|gratis|oferta|descuento|rebaja|precio|€|\beur\b|compra|c[oó]mpralo|tienda|nina beauty|https?:|www\.|devoluci|stock|garant[ií]a|100 ?% original|aut[eé]ntico|mejor precio|barat)/i;

export function cleanText(s) {
  const sentences = String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((x) => x && !BANNED.test(x))
    .map((x) => x.replace(/!+/g, '.'));
  return sentences.join(' ').slice(0, 600).trim();
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Detalles que repiten datos que ya van en la lista, o que hablan de la imagen: fuera.
const REDUNDANT = /^(marca|tipo|para|g[eé]nero|concentraci[oó]n|familia|notas?|tama[nñ]os?|tonos?|formatos?|contenido neto)\b|imagen/i;
export const usefulDetail = (d) => !!d && !REDUNDANT.test(String(d).trim());

/** Quita de una descripción ya escrita las líneas sueltas sin negrita que repiten datos (versiones anteriores). */
export function stripRedundant(html) {
  return String(html || '').replace(/\n?<li>(?!\s*<strong>)([^<]*)<\/li>/g, (m, txt) => (usefulDetail(txt) ? m : ''));
}

const list = (a) => (a || []).map((x) => String(x).trim().replace(/\.$/, '')).filter((x) => x && !BANNED.test(x)).slice(0, 5);

/** HTML final de la descripción (sin precio, envío ni nada de la tienda). */
export function renderDescription(p, ai) {
  const f = productFacts(p);
  const intro = cleanText(ai?.intro);
  const items = [];
  if (f.brand) items.push(['Marca', f.brand]);
  if (f.type) items.push(['Tipo', f.type]);
  if (f.gender) items.push(['Para', f.gender]);
  const sure = ai?.seguro !== false;
  if (sure && ai?.familia_olfativa && !BANNED.test(ai.familia_olfativa)) items.push(['Familia olfativa', ai.familia_olfativa.trim()]);
  if (sure) {
    const [s, c, b] = [list(ai?.notas_salida), list(ai?.notas_corazon), list(ai?.notas_fondo)];
    if (s.length) items.push(['Notas de salida', s.join(', ')]);
    if (c.length) items.push(['Notas de corazón', c.join(', ')]);
    if (b.length) items.push(['Notas de fondo', b.join(', ')]);
  }
  for (const d of list(ai?.detalles).filter(usefulDetail).slice(0, 3)) items.push([null, d]);
  if (f.sizes.length) {
    const sizeLike = f.sizes.every((x) => /\d\s?(ml|g|gr|oz|cl|l)\b/i.test(x));
    const label = sizeLike ? (f.sizes.length > 1 ? 'Tamaños' : 'Tamaño') : (p.tags || []).some((t) => /^mq-|maquillaje/i.test(t)) ? 'Tonos' : 'Formatos';
    items.push([label, f.sizes.join(', ').replace(/(\d)ml\b/gi, '$1 ml')]);
  }

  const head = intro || `${f.title}${f.type ? `, ${f.type.toLowerCase()}` : ''}${f.gender ? ` ${GENDER_ES[f.gender]}` : ''}${f.brand ? ` de ${f.brand}` : ''}.`;
  return `<p>${esc(head)}</p>\n<ul>\n${items.map(([k, v]) => `<li>${k ? `<strong>${esc(k)}:</strong> ` : ''}${esc(v)}</li>`).join('\n')}\n</ul>`;
}

/** ¿La descripción actual es la plantilla automática (o está vacía) y se puede sustituir? */
export function isReplaceable(html) {
  const t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return true;
  return /100 % original/.test(t) && /caja precintada/.test(t);
}
