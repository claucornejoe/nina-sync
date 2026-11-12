// Categoría de producto de Shopify (taxonomía estándar, la que Shopify envía a Google como google_product_category).
// Los perfumes se clasifican por reglas, sin IA. El resto, con IA entre las categorías que devuelve la búsqueda de Shopify.

const C = 'gid://shopify/TaxonomyCategory/';
export const PERFUME_CATEGORIES = {
  bodyMist: { id: C + 'hb-3-2-8-1', name: 'Brumas corporales' },
  cologne: { id: C + 'hb-3-2-8-2', name: 'Colonias' },
  edp: { id: C + 'hb-3-2-8-3', name: 'Aguas de perfume (Eau de Parfum)' },
  edt: { id: C + 'hb-3-2-8-4', name: 'Eau de Toilette' },
  extract: { id: C + 'hb-3-2-8-7', name: 'Extractos de perfume' },
  oil: { id: C + 'hb-3-2-8-8', name: 'Aceites de perfume' },
  hair: { id: C + 'hb-3-2-8-6', name: 'Perfumes capilares' },
  solid: { id: C + 'hb-3-2-8-10', name: 'Perfumes sólidos' },
  samples: { id: C + 'hb-3-2-8-9', name: 'Muestras y sets de descubrimiento' },
};

// Maquillaje y cuidado de la piel: por la etiqueta de sección que ponen los CSV (mq-*, sc-*).
// Las que no son concretas (cremas, limpieza, sets…) las decide la IA.
export const TAG_CATEGORIES = {
  'mq-ojos': { id: C + 'hb-3-2-6-3', name: 'Maquillaje para ojos' },
  'mq-rostro': { id: C + 'hb-3-2-6-4', name: 'Maquillaje para cara y mejillas' },
  'mq-labios': { id: C + 'hb-3-2-6-5', name: 'Maquillaje de labios' },
  'mq-unas': { id: C + 'hb-3-2-7-11', name: 'Esmaltes de uñas' },
  'sc-serums': { id: C + 'hb-3-2-9-21', name: 'Sérums faciales' },
  'sc-solar': { id: C + 'hb-3-2-9-15', name: 'Protector solar' },
  'sc-suplementos': { id: C + 'hb-1-9-6', name: 'Vitaminas y complementos' },
  'sc-tonicos': { id: C + 'hb-3-2-9-17', name: 'Tónicos y astringentes' },
  'sc-mascarillas': { id: C + 'hb-3-2-9-13', name: 'Máscaras y peelings para cuidado de la piel' },
  'sc-sets': { id: C + 'hb-3-2-9-25', name: 'Kits y sets de cuidado de la piel' },
};

const has = (tags, t) => (tags || []).some((x) => x.toLowerCase() === t.toLowerCase());

/** ¿Es un perfume? Por las etiquetas de tipo que pone Nina Sync o por el tipo de producto. */
export function isPerfume(p) {
  const types = ['Eau de Parfum', 'Eau de Toilette', 'Parfum', 'Colonia', 'Body Mist', 'Perfume', 'Estuche'];
  if (/maquillaje|cuidado de la piel/i.test(p.productType || '') || (p.tags || []).some((t) => /^(mq|sc)-/i.test(t))) return false;
  return /perfum|fragan|colonia/i.test(p.productType || '') || types.some((t) => has(p.tags, t));
}

/** Categoría por reglas para perfumes; null si no es perfume (entonces decide la IA). */
export function ruleCategory(p) {
  for (const t of p.tags || []) if (TAG_CATEGORIES[t.toLowerCase()]) return TAG_CATEGORIES[t.toLowerCase()];
  if (!isPerfume(p)) return null;
  const t = String(p.title || '').toLowerCase();
  if (/\b(hair mist|perfume (para el )?cabello|hair perfume|capilar)\b/.test(t)) return PERFUME_CATEGORIES.hair;
  if (/\b(muestras?|discovery|miniaturas?|coffret de miniaturas)\b/.test(t)) return PERFUME_CATEGORIES.samples;
  if (/\b(aceite|perfume oil|oil perfume|attar)\b/.test(t)) return PERFUME_CATEGORIES.oil;
  if (/\b(s[oó]lido|solid)\b/.test(t)) return PERFUME_CATEGORIES.solid;
  if (has(p.tags, 'Body Mist') || /\b(body mist|bruma|mist)\b/.test(t)) return PERFUME_CATEGORIES.bodyMist;
  // Estuches: la categoría del perfume que llevan dentro.
  if (/toilette|\bedt\b/.test(t) || has(p.tags, 'Eau de Toilette')) return PERFUME_CATEGORIES.edt;
  if (/colonia|cologne|\bedc\b/.test(t) || has(p.tags, 'Colonia')) return PERFUME_CATEGORIES.cologne;
  if (/eau de parfum|\bedp\b/.test(t) || has(p.tags, 'Eau de Parfum')) return PERFUME_CATEGORIES.edp;
  if (/extrait|elixir|\bparfum\b/.test(t) || has(p.tags, 'Parfum')) return PERFUME_CATEGORIES.extract;
  return PERFUME_CATEGORIES.edp;
}

/** Género para Google Shopping a partir de las etiquetas (no las cambia). */
export function googleGender(tags) {
  if (has(tags, 'Unisex')) return 'unisex';
  if (has(tags, 'Hombre')) return 'male';
  if (has(tags, 'Mujer')) return 'female';
  return null;
}

/** Tipo de perfume legible para la descripción. */
export function perfumeTypeLabel(p) {
  for (const t of ['Eau de Parfum', 'Eau de Toilette', 'Parfum', 'Colonia', 'Body Mist', 'Estuche']) if (has(p.tags, t)) return t;
  return isPerfume(p) ? 'Perfume' : p.productType || '';
}

/** EAN válido (8, 12, 13 o 14 cifras con dígito de control correcto). */
export function isGtin(code) {
  const s = String(code || '').trim();
  if (!/^(\d{8}|\d{12,14})$/.test(s)) return false;
  const d = s.split('').map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
