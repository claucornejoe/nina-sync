// Reglas del Foro Nina (sin base de datos, para poder probarlas): categorías, validación,
// moderación, firma del proxy de Shopify y token de los formularios.
import crypto from 'node:crypto';

export const CATEGORIAS = [
  { id: 'skincare', nombre: 'Skincare', desc: 'Rutinas, tipos de piel, sérums, protección solar…' },
  { id: 'maquillaje', nombre: 'Maquillaje', desc: 'Bases, labios, ojos, técnicas y tonos' },
  { id: 'perfumes', nombre: 'Perfumes', desc: 'Encontrar tu aroma, que dure más, regalos' },
  { id: 'cabello-cuerpo', nombre: 'Cabello y cuerpo', desc: 'Cuidado del pelo, hidratación, bienestar' },
  { id: 'consejos', nombre: 'Consejos varios', desc: 'Todo lo demás: dudas, ideas y trucos' },
];
export const categoria = (id) => CATEGORIAS.find((c) => c.id === id) || null;

const LIMITES = { titulo: [8, 120], cuerpo: [15, 3000], respuesta: [2, 2000], apodo: [2, 30] };

/** Limpia texto de una clienta: sin etiquetas, sin caracteres de control, espacios normalizados. */
export function limpiar(s, max = 5000) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Valida un apodo: letras, números, espacios, puntos y guiones. */
export function validarApodo(s) {
  const a = limpiar(s, 60).replace(/\n/g, ' ');
  if (a.length < LIMITES.apodo[0] || a.length > LIMITES.apodo[1]) return { error: 'Tu nombre debe tener entre 2 y 30 caracteres.' };
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(a)) return { error: 'Tu nombre solo puede llevar letras, números, espacios, puntos y guiones.' };
  if (/nina|equipo|admin|moderador/i.test(a)) return { error: 'Ese nombre está reservado para el equipo de Nina Beauty. Elige otro, por favor.' };
  return { apodo: a };
}

/** Valida un tema nuevo. Devuelve { error } o { categoria, titulo, cuerpo }. */
export function validarTema(b = {}) {
  const cat = categoria(String(b.categoria || ''));
  if (!cat) return { error: 'Elige una categoría.' };
  const titulo = limpiar(b.titulo, 200).replace(/\n/g, ' ');
  const cuerpo = limpiar(b.cuerpo);
  if (titulo.length < LIMITES.titulo[0]) return { error: 'Escribe un título un poco más largo (mínimo 8 caracteres).' };
  if (titulo.length > LIMITES.titulo[1]) return { error: 'El título es demasiado largo (máximo 120 caracteres).' };
  if (cuerpo.length < LIMITES.cuerpo[0]) return { error: 'Cuéntanos un poco más en el mensaje (mínimo 15 caracteres).' };
  if (cuerpo.length > LIMITES.cuerpo[1]) return { error: 'El mensaje es demasiado largo (máximo 3.000 caracteres).' };
  return { categoria: cat.id, titulo, cuerpo };
}

export function validarRespuesta(b = {}) {
  const cuerpo = limpiar(b.cuerpo);
  if (cuerpo.length < LIMITES.respuesta[0]) return { error: 'Escribe tu respuesta.' };
  if (cuerpo.length > LIMITES.respuesta[1]) return { error: 'La respuesta es demasiado larga (máximo 2.000 caracteres).' };
  return { cuerpo };
}

// Palabras que mandan el mensaje a revisión aunque la clienta sea de confianza.
const SOSPECHOSO = [
  /https?:\/\/|www\.|\.(com|es|net|org|shop|store|ly|io)\b/i, // enlaces
  /@[a-z0-9_.]{3,}|instagram|tiktok|whats?app|telegram/i, // redes y contacto
  /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{3}\b/, // teléfonos
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // correos
  /\b(puta|put[oa]s|zorra|gilipollas|imb[eé]cil|subnormal|mierda|cabr[oó]n|idiota|est[uú]pida)\b/i, // insultos
  /\b(cura|curar|elimina(r)? (el )?acn[eé]|garantizad[oa])\b/i, // promesas de salud
];

/**
 * ¿Se publica directamente o queda pendiente?
 * modo «previa»: todo lo de clientas se revisa. modo «confianza»: se publica solo si la clienta
 * ya tiene `minConfianza` mensajes aprobados y el texto no tiene nada sospechoso.
 */
export function decidirEstado({ texto, equipo = false, modo = 'previa', aprobados = 0, minConfianza = 2 }) {
  if (equipo) return { estado: 'publicado', motivo: null };
  const marca = SOSPECHOSO.find((re) => re.test(texto));
  if (marca) return { estado: 'pendiente', motivo: motivoDe(marca) };
  if (modo === 'confianza' && aprobados >= minConfianza) return { estado: 'publicado', motivo: null };
  return { estado: 'pendiente', motivo: null };
}
function motivoDe(re) {
  const i = SOSPECHOSO.indexOf(re);
  return ['Lleva un enlace', 'Menciona redes o contacto', 'Parece un teléfono', 'Lleva un correo', 'Posible insulto', 'Promesa de salud'][i];
}

/** «Qué rutina me recomendáis» → «que-rutina-me-recomendais». */
export function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
}
export const rutaTema = (t) => `t/${t.id}-${slug(t.titulo) || 'tema'}`;
/** «12-que-rutina» → 12 */
export const idDeRuta = (s) => {
  const m = /^(\d{1,9})(?:-|$)/.exec(String(s || ''));
  return m ? Number(m[1]) : null;
};

// ---- Proxy de aplicación de Shopify ----
/**
 * Comprueba la firma que añade Shopify a las peticiones del proxy (/apps/foro/… → Nina Sync).
 * Shopify ordena los parámetros, los une como «clave=valor» sin separador (los repetidos, con comas)
 * y firma con HMAC-SHA256 y el secreto de la app, en hexadecimal.
 */
export function firmaProxy(query, secret) {
  const pares = Object.entries(query || {})
    .filter(([k]) => k !== 'signature')
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
    .sort();
  return crypto.createHmac('sha256', secret).update(pares.join('')).digest('hex');
}
/** Lee la query tal cual llega (sin el analizador de Express, que convierte «a[b]» en objetos). */
export function leerQuery(raw) {
  const out = {};
  for (const [k, v] of new URLSearchParams(String(raw || '').replace(/^\?/, ''))) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}
export function verificarProxy(query, secret, ahora = Date.now(), margenSeg = 600) {
  if (!secret || !query || typeof query.signature !== 'string') return false;
  const buena = firmaProxy(query, secret);
  const a = Buffer.from(buena);
  const b = Buffer.from(query.signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const ts = Number(query.timestamp);
  return Number.isFinite(ts) && Math.abs(ahora / 1000 - ts) <= margenSeg;
}

// ---- Token de formulario (evita que otra web publique en nombre de una clienta conectada) ----
export function tokenForm(clienteId, secret, ahora = Date.now()) {
  const dia = Math.floor(ahora / 86400_000);
  return `${dia}.${crypto.createHmac('sha256', secret).update(`foro:${clienteId}:${dia}`).digest('hex').slice(0, 32)}`;
}
export function tokenValido(token, clienteId, secret, ahora = Date.now()) {
  const [dia] = String(token || '').split('.');
  const hoy = Math.floor(ahora / 86400_000);
  if (!/^\d+$/.test(dia) || hoy - Number(dia) > 1 || Number(dia) > hoy) return false;
  const bueno = tokenForm(clienteId, secret, Number(dia) * 86400_000);
  const a = Buffer.from(bueno);
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Apodo por defecto a partir del nombre de Shopify: «Laura M.» */
export function apodoPorDefecto(firstName, lastName) {
  const f = limpiar(firstName, 30).split(/\s+/)[0] || '';
  const l = limpiar(lastName, 30).charAt(0);
  const a = [f, l && `${l.toUpperCase()}.`].filter(Boolean).join(' ');
  return validarApodo(a).apodo || '';
}
