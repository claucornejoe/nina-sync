// Correo «Ya está disponible» del botón «Agotado · Avísame».
// HTML de correo: tablas y estilos en línea para que se vea bien en Gmail, Outlook y el móvil.
import { esc } from '../views.js';

const C = { rosa: '#F72E75', frambuesa: '#C92F60', petalo: '#FFCCD5', petalo2: '#FFF1F4', grafito: '#2B2B2B', gris: '#6E6E6E', linea: '#F1E4E8' };
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "Montserrat,Helvetica,Arial,sans-serif";
const eur = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;

/** Añade la variante y la marca de campaña al enlace de la ficha. */
export function productLink(url, variantId) {
  const u = new URL(url);
  const num = String(variantId || '').split('/').pop();
  if (num) u.searchParams.set('variant', num);
  u.searchParams.set('utm_source', 'aviso-stock');
  u.searchParams.set('utm_medium', 'email');
  return u.toString();
}

/**
 * @param {object} p
 * @param {string} p.productTitle  p. ej. «Good Girl Eau de Parfum»
 * @param {string} [p.vendor]      marca
 * @param {string} [p.variantTitle] tamaño («80 ml»); se omite si es «Default Title»
 * @param {number} p.price
 * @param {number} [p.compareAt]
 * @param {string} [p.imageUrl]
 * @param {string} p.url           enlace a la ficha (ya con variante)
 * @param {boolean} p.lowStock     true si han llegado pocas unidades
 * @param {string} p.logoUrl       PNG del logo (los correos no muestran SVG)
 */
export function renderStockEmail(p) {
  const size = p.variantTitle && !/default title/i.test(p.variantTitle) ? p.variantTitle : '';
  // «Carolina Herrera Good Girl…» con la marca encima: se quita la marca del nombre para no repetirla.
  const short = p.vendor && p.productTitle.toLowerCase().startsWith(p.vendor.toLowerCase() + ' ') ? p.productTitle.slice(p.vendor.length + 1) : p.productTitle;
  const name = short + (size ? ` · ${size}` : '');
  const subject = `¡Ha vuelto! ${p.productTitle} ya está disponible`;
  const preheader = p.lowStock ? 'Han llegado pocas unidades: si lo quieres, mejor no esperar.' : 'Nos pediste que te avisáramos y aquí está.';
  const note = p.lowStock ? 'Han llegado pocas unidades' : 'La última vez se agotó';
  const sale = !!p.compareAt && p.compareAt >= p.price * 1.05; // tachado solo si ahorra al menos un 5 %

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>@media (max-width:520px){.nb-pad{padding-left:22px!important;padding-right:22px!important}.nb-h1{font-size:34px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.petalo2}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.petalo2}"><tr><td align="center" style="padding:28px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:22px;overflow:hidden">
  <tr><td align="center" style="padding:30px 32px 6px"><a href="${esc(p.url)}"><img src="${esc(p.logoUrl)}" width="150" alt="Nina Beauty" style="display:block;width:150px;height:auto;border:0"></a></td></tr>
  <tr><td class="nb-pad" align="center" style="padding:18px 40px 0;font-family:${SANS}">
   <p style="margin:0 0 8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.frambuesa};font-weight:600">Ya está disponible</p>
   <h1 class="nb-h1" style="margin:0;font-family:${SERIF};font-weight:600;font-size:40px;line-height:1.1;color:${C.grafito}">¡Ha vuelto!</h1>
   <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:${C.grafito}">Nos pediste que te avisáramos y aquí está: ya puedes volver a comprarlo en Nina Beauty.</p>
  </td></tr>
  <tr><td class="nb-pad" style="padding:26px 40px 0">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.linea};border-radius:18px">
    <tr><td align="center" style="padding:22px 22px 6px">${
      p.imageUrl ? `<img src="${esc(p.imageUrl)}" width="190" alt="${esc(p.productTitle)}" style="display:block;width:190px;max-width:100%;height:auto;border:0">` : ''
    }</td></tr>
    <tr><td align="center" style="padding:8px 22px 22px;font-family:${SANS}">
     ${p.vendor ? `<p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.gris}">${esc(p.vendor)}</p>` : ''}
     <p style="margin:0;font-family:${SERIF};font-size:22px;font-weight:600;line-height:1.25;color:${C.grafito}">${esc(name)}</p>
     <p style="margin:8px 0 0;font-size:17px;font-weight:600;color:${sale ? C.rosa : C.grafito}">${eur(p.price)}${
       sale ? ` <span style="font-weight:400;font-size:14px;color:${C.gris};text-decoration:line-through">${eur(p.compareAt)}</span>` : ''
     }</p>
     <p style="margin:14px 0 0"><span style="display:inline-block;background:${C.petalo};color:${C.frambuesa};font-size:12px;font-weight:600;padding:7px 14px;border-radius:999px">${esc(note)}</span></p>
    </td></tr>
   </table>
  </td></tr>
  <tr><td align="center" style="padding:26px 40px 8px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:${C.frambuesa}">
    <a href="${esc(p.url)}" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">Lo quiero</a>
   </td></tr></table>
  </td></tr>
  <tr><td class="nb-pad" align="center" style="padding:18px 40px 30px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.gris}">
   Te escribimos una sola vez porque lo pediste en la tienda. Después de este correo borramos tu dirección de la lista de avisos.
  </td></tr>
  <tr><td align="center" style="background:${C.rosa};padding:16px 24px;font-family:${SANS};font-size:12px;color:#ffffff">
   <a href="https://www.ninabeauty.es" style="color:#ffffff;text-decoration:none;font-weight:600">ninabeauty.es</a> · ¿Dudas? Responde a este correo
  </td></tr>
 </table>
</td></tr></table></body></html>`;

  const text = `¡Ha vuelto!

Nos pediste que te avisáramos y aquí está: ${p.vendor ? `${p.vendor} ` : ''}${name} ya está disponible en Nina Beauty por ${eur(p.price)}.
${note}.

Lo quiero: ${p.url}

Te escribimos una sola vez porque lo pediste en la tienda. Después de este correo borramos tu dirección de la lista de avisos.
Nina Beauty · www.ninabeauty.es`;

  return { subject, html, text };
}
