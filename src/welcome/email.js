// Correo de bienvenida para las nuevas suscriptoras: cupón BIENVENIDA3, NinaCash, Nina Blog y el foro.
// HTML de correo: tablas y estilos en línea para que se vea bien en Gmail, Outlook y el móvil.
import { esc } from '../views.js';

const C = { rosa: '#F72E75', frambuesa: '#C92F60', petalo: '#FFCCD5', petalo2: '#FFF1F4', grafito: '#2B2B2B', gris: '#6E6E6E', linea: '#F1E4E8' };
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = 'Montserrat,Helvetica,Arial,sans-serif';

const utm = (url, content) => {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'bienvenida');
  u.searchParams.set('utm_medium', 'email');
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
};

/**
 * @param {object} p
 * @param {string} [p.firstName]  nombre de la clienta, si lo dio
 * @param {string} p.storeUrl     https://www.ninabeauty.es
 * @param {string} p.logoUrl      PNG del logo (los correos no muestran SVG)
 * @param {string} [p.code]       código de bienvenida (BIENVENIDA3)
 * @param {number} [p.amount]     euros de descuento (3)
 * @param {number} [p.minimum]    pedido mínimo en euros (30)
 */
export function renderWelcomeEmail(p) {
  const code = p.code || 'BIENVENIDA3';
  const amount = p.amount ?? 3;
  const minimum = p.minimum ?? 30;
  const base = p.storeUrl.replace(/\/$/, '');
  const hola = p.firstName ? `¡Hola, ${esc(p.firstName)}!` : '¡Hola!';
  const tienda = utm(`${base}/discount/${encodeURIComponent(code)}?redirect=/collections/all`, 'cupon');
  const blog = utm(`${base}/blogs/nina-blog`, 'blog');
  const foro = utm(`${base}/apps/foro`, 'foro');
  const ninacash = utm(`${base}/pages/ninacash`, 'ninacash');
  const subject = `Bienvenida a Nina Beauty: aquí tienes tus ${amount} €`;
  const preheader = `Tu código ${code} te espera para tu primer pedido.`;

  const tarjeta = (titulo, texto, boton, href) => `
    <td class="nb-col" valign="top" width="50%" style="padding:0 6px">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.petalo2};border-radius:18px">
      <tr><td style="padding:20px 18px;font-family:${SANS}">
       <p style="margin:0 0 6px;font-family:${SERIF};font-size:22px;font-weight:600;color:${C.grafito}">${titulo}</p>
       <p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:${C.grafito}">${texto}</p>
       <a href="${esc(href)}" style="font-size:13px;font-weight:600;color:${C.frambuesa};text-decoration:none">${boton} &rarr;</a>
      </td></tr>
     </table>
    </td>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>@media (max-width:520px){.nb-pad{padding-left:22px!important;padding-right:22px!important}.nb-h1{font-size:34px!important}.nb-col{display:block!important;width:100%!important;padding:0 0 12px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.petalo2}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.petalo2}"><tr><td align="center" style="padding:28px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:22px;overflow:hidden">
  <tr><td align="center" style="padding:30px 32px 6px"><a href="${esc(utm(base, 'logo'))}"><img src="${esc(p.logoUrl)}" width="150" alt="Nina Beauty" style="display:block;width:150px;height:auto;border:0"></a></td></tr>
  <tr><td class="nb-pad" align="center" style="padding:18px 44px 0;font-family:${SANS}">
   <p style="margin:0 0 8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.frambuesa};font-weight:600">${hola}</p>
   <h1 class="nb-h1" style="margin:0;font-family:${SERIF};font-weight:600;font-size:40px;line-height:1.1;color:${C.grafito}">Bienvenida a Nina</h1>
   <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:${C.grafito}">Gracias por unirte. Aquí vas a encontrar perfumes, maquillaje y skin care 100 % originales, y una comunidad que habla de belleza sin filtros.</p>
  </td></tr>

  <tr><td class="nb-pad" style="padding:26px 44px 0">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.petalo};border-radius:18px">
    <tr><td align="center" style="padding:24px 22px;font-family:${SANS}">
     <p style="margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${C.frambuesa};font-weight:600">Tu regalo de bienvenida</p>
     <p style="margin:6px 0 0;font-family:${SERIF};font-size:46px;font-weight:600;line-height:1;color:${C.grafito}">${amount} €</p>
     <p style="margin:6px 0 14px;font-size:13px;color:${C.grafito}">de descuento en tu primer pedido</p>
     <p style="margin:0"><span style="display:inline-block;background:#ffffff;border:2px dashed ${C.rosa};color:${C.grafito};font-size:20px;font-weight:600;letter-spacing:.12em;padding:10px 22px;border-radius:12px">${esc(code)}</span></p>
     <p style="margin:12px 0 0;font-size:11px;line-height:1.5;color:${C.gris}">Para pedidos desde ${minimum} €. Un solo uso, en tu primera compra.</p>
    </td></tr>
   </table>
  </td></tr>
  <tr><td align="center" style="padding:22px 40px 4px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:${C.frambuesa}">
    <a href="${esc(tienda)}" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">Usar mis ${amount} €</a>
   </td></tr></table>
   <p style="margin:10px 0 0;font-family:${SANS};font-size:11px;color:${C.gris}">El código se aplica solo al entrar desde este botón.</p>
  </td></tr>

  <tr><td class="nb-pad" align="center" style="padding:30px 44px 12px;font-family:${SANS}">
   <p style="margin:0;font-family:${SERIF};font-size:26px;font-weight:600;color:${C.grafito}">Nina es más que una tienda</p>
  </td></tr>
  <tr><td class="nb-pad" style="padding:0 38px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${tarjeta('Nina Blog', 'Consejos de perfumes, rutinas de skin care y las tendencias que arrasan. Y puedes escuchar cada artículo.', 'Leer el blog', blog)}
    ${tarjeta('Foro Nina', 'Pregunta, recomienda y descubre qué perfume le va a tu estilo. Aquí opinan clientas como tú.', 'Entrar al foro', foro)}
   </tr></table>
  </td></tr>

  <tr><td class="nb-pad" style="padding:22px 44px 0">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.linea};border-radius:18px">
    <tr><td style="padding:18px 20px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.grafito}">
     <b style="color:${C.frambuesa}">NinaCash:</b> con cada compra ganas saldo para la siguiente, y cuanto más compras, más subes de nivel (Sparkle, Glow, Glam y Butterfly).
     <a href="${esc(ninacash)}" style="color:${C.frambuesa};font-weight:600;text-decoration:none">Cómo funciona &rarr;</a>
    </td></tr>
   </table>
  </td></tr>

  <tr><td class="nb-pad" align="center" style="padding:22px 44px 26px;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.gris}">
   100 % originales · Envío gratis desde 49 € a península y Baleares · Devoluciones en 14 días
  </td></tr>
  <tr><td align="center" style="background:${C.rosa};padding:16px 24px;font-family:${SANS};font-size:12px;color:#ffffff">
   <a href="${esc(utm(base, 'pie'))}" style="color:#ffffff;text-decoration:none;font-weight:600">ninabeauty.es</a> · ¿Dudas? Responde a este correo
  </td></tr>
  <tr><td align="center" style="padding:14px 24px 18px;font-family:${SANS};font-size:10px;line-height:1.6;color:${C.gris}">
   Recibes este correo porque te has suscrito en ninabeauty.es. Nina Beauty es una marca de DEVSECUP SPA.
   Si no quieres recibir más correos, responde con «baja» o cambia tus preferencias en tu cuenta.
  </td></tr>
 </table>
</td></tr></table></body></html>`;

  const text = `${p.firstName ? `¡Hola, ${p.firstName}!` : '¡Hola!'}

Bienvenida a Nina Beauty. Gracias por unirte.

Tu regalo de bienvenida: ${amount} € de descuento en tu primer pedido con el código ${code} (pedidos desde ${minimum} €, un solo uso).
Usar mis ${amount} €: ${tienda}

Nina es más que una tienda:
- Nina Blog: consejos de perfumes, skin care y tendencias. ${blog}
- Foro Nina: pregunta, recomienda y descubre. ${foro}

NinaCash: con cada compra ganas saldo para la siguiente. ${ninacash}

Nina Beauty, una marca de DEVSECUP SPA · www.ninabeauty.es
Si no quieres recibir más correos, responde con «baja».`;

  return { subject, html, text };
}
