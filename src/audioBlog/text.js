// «Escuchar artículo»: qué se lee de cada artículo de Nina Blog y cuándo suena cada palabra.
// Todo es puro (sin red) para poder probarlo. El tema usa las mismas reglas para encontrar las frases
// en la página y resaltarlas (snippet/sección nina-blog-articulo).
import crypto from 'node:crypto';

// Partes del artículo que NO se leen: tarjetas de producto, fuentes, botones, índice, tablas…
const SKIP_CLASSES = ['nba-productos', 'nba-prod', 'nba-fuentes', 'nba-cta__btn', 'nba-indice', 'nba-no-leer'];
const SKIP_TAGS = new Set(['script', 'style', 'figure', 'table', 'button', 'iframe', 'video', 'audio', 'svg', 'select', 'form', 'noscript', 'template']);
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'dt', 'dd', 'div', 'section', 'article', 'ul', 'ol', 'header', 'footer', 'aside']);
const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'track', 'param']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', euro: '€', middot: '·', deg: '°',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', egrave: 'è', ograve: 'ò', ordf: 'ª', ordm: 'º',
  times: '×', copy: '©', reg: '®', trade: '™', shy: '', zwj: '', zwnj: '',
};
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return e in NAMED ? NAMED[e] : m;
  });
}

/** Igual que en el tema: espacios (incluido el duro) colapsados y sin guiones blandos. */
export const normalize = (s) => String(s).replace(/[\u00ad\u200b\u200c\u200d]/g, '').replace(/[\s\u00a0]+/g, ' ').trim();

/**
 * Saca del HTML del artículo los bloques de texto que se leen, en orden.
 * Devuelve [{ text, heading }].
 */
export function extractBlocks(html) {
  const out = [];
  const stack = []; // { tag, skip }
  let buf = '';
  let heading = false;
  const skipping = () => stack.some((e) => e.skip);
  const flush = () => {
    const t = normalize(decodeEntities(buf));
    if (t) out.push({ text: t, heading });
    buf = '';
    heading = false;
  };
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    if (m[3] !== undefined) {
      if (!skipping()) buf += m[3];
      continue;
    }
    if (!m[1]) continue; // comentario
    const tag = m[1].toLowerCase();
    const closing = m[0][1] === '/';
    if (closing) {
      const i = stack.map((e) => e.tag).lastIndexOf(tag);
      if (i === -1) continue;
      const wasSkipping = skipping();
      stack.length = i;
      if (BLOCK_TAGS.has(tag) && !wasSkipping) flush();
      continue;
    }
    if (tag === 'br') { if (!skipping()) buf += ' '; continue; }
    if (VOID_TAGS.has(tag) || m[0].endsWith('/>')) continue;
    const cls = (m[2].match(/\bclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])
      .slice(2).find((x) => x !== undefined) || '';
    const classes = cls.split(/\s+/);
    const attrs = m[2].replace(/\s[\w-]+\s*=\s*("[^"]*"|'[^']*')/g, (a) => (/^\saria-hidden/i.test(a) ? a : ' '));
    const hidden = /\saria-hidden\s*=\s*["']true/i.test(attrs) || /(?:^|\s)hidden(?=\s|$|\/)/i.test(attrs);
    const skip = SKIP_TAGS.has(tag) || hidden || classes.some((c) => SKIP_CLASSES.includes(c));
    if (BLOCK_TAGS.has(tag) && !skipping()) flush();
    if (HEADINGS.has(tag) && !skipping() && !skip) heading = true;
    stack.push({ tag, skip });
  }
  if (!skipping()) flush();
  return out;
}

/** Corta un bloque en frases (punto, interrogación, exclamación o puntos suspensivos seguidos de mayúscula o signo de apertura). */
export function splitSentences(text) {
  const parts = [];
  const re = /[.!?…]+[»”")\]]*\s+(?=[«“"¿¡(A-ZÁÉÍÓÚÑÜ0-9])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].trimEnd().length;
    const s = text.slice(last, end).trim();
    // Abreviaturas cortas («p. ej.», «Sr.», «aprox.») no cierran la frase.
    if (/(?:^|\s)(?:p|ej|sr|sra|dr|dra|etc|aprox|núm|pág|vol|ud|uds|n\.º)\.$/i.test(s) && s.length < 400) continue;
    if (s) parts.push(s);
    last = m.index + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) parts.push(rest);
  return parts;
}

/** Lo que se lee: título, entradilla y cuerpo. Devuelve frases [{ t, h }] (h = título o apartado). */
export function buildScript({ title, summary, html }) {
  const sentences = [];
  // e = última frase de su bloque (al leer se añade una pausa; no se guarda).
  const add = (text, h) => {
    const parts = h ? [text] : splitSentences(text);
    parts.forEach((t, i) => sentences.push({ t, h: !!h, e: i === parts.length - 1 }));
  };
  if (normalize(title)) add(normalize(decodeEntities(title)), true);
  const sum = normalize(decodeEntities(String(summary || '').replace(/<[^>]*>/g, ' ')));
  if (sum) add(sum, false);
  for (const b of extractBlocks(html)) add(b.text, b.heading);
  return sentences;
}

export const scriptChars = (sentences) => sentences.reduce((n, s) => n + s.t.length + 1, 0);
export const scriptHash = (sentences) => crypto.createHash('sha1').update(sentences.map((s) => s.t).join('\n')).digest('hex').slice(0, 16);

/** Separa la palabra en el texto de la frase: mismas reglas en el tema. */
export const words = (t) => t.split(' ').filter(Boolean);

/**
 * Agrupa las frases en trozos para ElevenLabs (máx. `max` caracteres) y apunta dónde empieza cada palabra.
 * Los títulos y los finales de bloque sin puntuación llevan un punto para que la voz haga pausa (ese punto no se muestra).
 */
export function makeChunks(sentences, max = 2500) {
  const chunks = [];
  let cur = null;
  sentences.forEach((s, si) => {
    let spoken = s.t;
    if ((s.h || s.e) && !/[.!?…:;,]["»”)]*$/.test(spoken)) spoken += '.';
    if (!cur || (cur.text.length && cur.text.length + spoken.length + 2 > max)) {
      cur = { text: '', words: [] };
      chunks.push(cur);
    }
    const prev = sentences[si - 1];
    if (cur.text.length) cur.text += s.h || prev?.h ? '\n\n' : prev?.e ? '\n' : ' ';
    const base = cur.text.length;
    let pos = 0;
    words(s.t).forEach((w, wi) => {
      const at = s.t.indexOf(w, pos);
      cur.words.push({ si, wi, off: base + at, len: w.length });
      pos = at + w.length;
    });
    cur.text += spoken;
  });
  return chunks;
}

/** Duración real de un MP3 contando sus tramas (las de ElevenLabs son CBR, pero así no dependemos de eso). */
export function mp3Duration(buf) {
  const BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let i = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  let seconds = 0;
  let frames = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[i + 1] >> 1) & 3; // 1 = Layer III
    const bri = buf[i + 2] >> 4;
    const sri = (buf[i + 2] >> 2) & 3;
    const pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
    const kbps = BR[ver === 3 ? 1 : 2][bri];
    const rate = SR[ver][sri];
    const samples = ver === 3 ? 1152 : 576;
    const len = Math.floor((samples / 8) * kbps * 1000 / rate) + pad;
    if (len < 4) { i++; continue; }
    seconds += samples / rate;
    frames++;
    i += len;
  }
  return frames ? seconds : (buf.length * 8) / 128000;
}

/**
 * Junta los tiempos de ElevenLabs (por carácter, por trozo) en tiempos por palabra para toda la pista.
 * results: [{ alignment: { character_start_times_seconds }, duration }] en el mismo orden que chunks.
 * Devuelve frases [{ t, h, w: [ms de inicio de cada palabra] }].
 */
export function buildTimings(sentences, chunks, results) {
  const out = sentences.map((s) => ({ t: s.t, ...(s.h ? { h: 1 } : {}), w: [] }));
  let offset = 0;
  chunks.forEach((c, ci) => {
    const r = results[ci];
    const starts = r.alignment?.character_start_times_seconds || [];
    const chars = r.alignment?.characters || [];
    // Si ElevenLabs devolvió el mismo número de caracteres que el texto enviado, el índice coincide;
    // si no, se reparte de forma proporcional (no debería pasar con «alignment», que es el texto original).
    const ratio = chars.length && chars.length !== c.text.length ? chars.length / c.text.length : 1;
    let prev = 0;
    for (const w of c.words) {
      const idx = Math.min(starts.length - 1, Math.round(w.off * ratio));
      let t = starts.length ? starts[Math.max(0, idx)] : (w.off / c.text.length) * r.duration;
      if (!(t >= prev)) t = prev; // siempre hacia delante
      prev = t;
      out[w.si].w[w.wi] = Math.round((offset + t) * 1000);
    }
    offset += r.duration;
  });
  return { sentences: out, duration: Math.round(offset * 10) / 10 };
}
