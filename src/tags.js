// Etiquetas que reparten los perfumes en las colecciones de Nina Beauty.
// Misma lógica que se usó para crear las fichas (catalogo/shopify/scripts/build.py).

export const GENDERS = ['Mujer', 'Hombre', 'Unisex'];
export const TYPES = ['Eau de Parfum', 'Eau de Toilette', 'Estuche', 'Parfum', 'Colonia', 'Body Mist', 'Perfume'];
export const ARABIC = 'Árabe';

// Categorías raíz de BTS que son perfumería.
export const PERFUME_ROOTS = ['14498/', '14497/14508'];
export const isPerfumeCategory = (cats) => PERFUME_ROOTS.some((r) => String(cats || '').startsWith(r));

export const ARABIC_BRANDS = new Set(
  [
    'LATTAFA', 'AL HARAMAIN', 'ARMAF', 'AFNAN', 'RASASI', 'AJMAL', 'MAISON ALHAMBRA', 'PARIS CORNER', 'FRENCH AVENUE',
    'FRAGRANCE WORLD', 'ZIMAYA', 'ARD AL ZAAFARAN', 'KHADLAJ', 'NABEEL', 'SWISS ARABIAN', 'RIIFFS', 'EMPER', 'AL WATANIAH',
    'ORIENTICA', 'LE CHAMEAU', 'ALHAMBRA', 'ASDAAF', 'FA PARIS', 'ANFAR', 'BHARARA', 'MAISON ASRAR', 'AROOQ',
  ],
);

export function perfumeType(name) {
  const l = String(name || '').toLowerCase();
  if (/\b(set|estuche|lote|pieces|piezas|neceser)\b/.test(l) || (l.match(/\d+\s?(ml|g|gr)\b/g) || []).length > 1 || l.includes(' + ')) return 'Estuche';
  if (l.includes('eau de parfum') || l.includes('eau de perfume') || /\b(edp|ep)\b/.test(l)) return 'Eau de Parfum';
  if (l.includes('eau de toilette') || /\b(edt|etv)\b/.test(l)) return 'Eau de Toilette';
  if (l.includes('cologne') || l.includes('colonia') || /\bedc\b/.test(l)) return 'Colonia';
  if (l.includes('mist')) return 'Body Mist';
  if (l.includes('extrait') || l.includes('parfum') || l.includes('perfume')) return 'Parfum';
  return 'Perfume';
}

export function perfumeGender(btsItems, title) {
  if (btsItems.some((b) => String(b.categories || '').startsWith('14497'))) return 'Hombre';
  const t = String(title || '');
  if (/\b(homme|men|man|uomo|hombre|him|male)\b/i.test(t)) return 'Hombre';
  if (/unisex/i.test(t)) return 'Unisex';
  return 'Mujer';
}

export const brandTag = (manufacturer) =>
  String(manufacturer || '')
    .toLowerCase()
    .replace(/(^|[^\p{L}])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())
    .trim();

/**
 * Etiquetas que debería llevar un producto según BTS.
 * @param {string} title título del producto en Shopify
 * @param {Array} btsItems datos BTS de sus tamaños
 */
export function expectedTags(title, btsItems) {
  if (!btsItems.length) return null;
  const maker = btsItems[0].manufacturer;
  const tags = [perfumeGender(btsItems, title), perfumeType(title)];
  if (maker) tags.push(brandTag(maker));
  if (ARABIC_BRANDS.has(String(maker || '').toUpperCase().trim())) tags.push(ARABIC);
  return tags;
}

/**
 * Compara las etiquetas actuales con las esperadas. Solo toca las que gestiona la app
 * (género, tipo, Árabe) y añade la marca si falta. El resto de etiquetas no se toca.
 */
export function tagDiff(current, expected) {
  if (!expected) return { add: [], remove: [] };
  const cur = new Set(current || []);
  const exp = new Set(expected);
  const managed = new Set([...GENDERS, ...TYPES, ARABIC]);
  const lower = new Set([...cur].map((t) => t.toLowerCase()));
  const add = expected.filter((t) => !lower.has(t.toLowerCase()));
  const remove = [...cur].filter((t) => managed.has(t) && !exp.has(t));
  return { add, remove };
}
