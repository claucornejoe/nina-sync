// Títulos y tamaños a partir del nombre de BTS (misma lógica que build.py del catálogo inicial).
import { perfumeType } from './tags.js';

const SIZE_RE = /^(.*?)\s+(\d+(?:[.,]\d+)?\s?(?:ml|g|gr|oz))\b(.*)$/i;

export function cleanTitle(t) {
  t = String(t || '')
    .replace(/\bEau De (Perfume|Parfum)\b/gi, 'Eau de Parfum')
    .replace(/\bEau De Toilette\b/gi, 'Eau de Toilette')
    .replace(/\bEau De Cologne\b/gi, 'Eau de Cologne')
    .replace(/\b(Edp|Ep)\b/gi, 'Eau de Parfum')
    .replace(/\b(Edt|Etv|Et)\b/gi, 'Eau de Toilette')
    .replace(/\bEdc\b/gi, 'Eau de Cologne')
    .replace(/\b(Spray|Vaporizador|Vapo|Vp|Distribuidor)\b/gi, '')
    .replace(/\s\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const letters = [...t].filter((c) => /\p{L}/u.test(c));
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase());
  if (letters.length && upper.length > 0.6 * letters.length) {
    t = t
      .split(' ')
      .map((w) => (['de', 'eau'].includes(w.toLowerCase()) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ')
      .replace(/\bEau De\b/g, 'Eau de');
  }
  return t;
}

/** "Lancome Idole EDP 50ml" -> { title: "Lancome Idole Eau de Parfum", option: "Tamaño", label: "50ml" } */
export function splitName(name) {
  const m = String(name || '').match(SIZE_RE);
  if (m && perfumeType(name) !== 'Estuche') {
    const extra = m[3].replace(/\bspray\b/gi, '').replace(/[^\p{L}\p{N}\s+]/gu, '').trim();
    return { title: cleanTitle(m[1]), option: 'Tamaño', label: (m[2].replace(/\s/g, '').toLowerCase() + ' ' + extra).trim() };
  }
  const isSet = perfumeType(name) === 'Estuche';
  return { title: cleanTitle(name), option: 'Formato', label: isSet ? 'Estuche' : 'Único', single: true };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PARA = { Mujer: 'para mujer', Hombre: 'para hombre', Unisex: 'unisex' };
const NOUN = {
  'Eau de Parfum': 'un eau de parfum',
  'Eau de Toilette': 'un eau de toilette',
  Colonia: 'una colonia',
  'Body Mist': 'una bruma corporal',
  Parfum: 'un parfum',
  Estuche: 'un estuche de perfume',
  Perfume: 'un perfume',
};

export function description(title, brand, gender, type, freeFrom = 39) {
  const envio = freeFrom ? `Envío gratis desde ${String(freeFrom).replace('.', ',')} € a la península y Baleares.` : 'Envío a la península y Baleares.';
  return (
    `<p><strong>${esc(title)}</strong> es ${NOUN[type] || 'un perfume'} ${PARA[gender] || ''} de ${esc(brand)}, 100 % original.</p>` +
    `<ul><li>Producto original con su caja precintada.</li><li>${envio}</li><li>Entrega en 24 a 72 horas laborables.</li></ul>`
  );
}
