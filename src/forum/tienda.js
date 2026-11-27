// Páginas del Foro Nina que ve la clienta. Shopify las sirve en www.ninabeauty.es/apps/foro/…
// (proxy de aplicación) dentro del tema, con cabecera y pie de la tienda: por eso salen como «application/liquid».
// Todo texto de clientas pasa por `t()`, que además neutraliza las llaves para que Liquid no lo interprete.
import { CATEGORIAS, categoria, rutaTema } from './rules.js';
import { FONDO_MARIPOSAS } from './mariposas.js';

export const BASE = (process.env.FORO_PATH || '/apps/foro').replace(/\/+$/, '');
const TZ = 'Europe/Madrid';

export const t = (s) =>
  String(s ?? '').replace(/[&<>"'{}]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '{': '&#123;', '}': '&#125;' })[c]);
/** Párrafos y saltos de línea de un mensaje. */
export const parrafos = (s) =>
  String(s || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${t(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

export function fecha(d, ahora = Date.now()) {
  if (!d) return '';
  const m = Math.round((ahora - new Date(d)) / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const dd = Math.round(h / 24);
  if (dd < 7) return `hace ${dd} ${dd === 1 ? 'día' : 'días'}`;
  return new Intl.DateTimeFormat('es-ES', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
}
const iso = (d) => new Date(d).toISOString();
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

const LOGIN = `{{ routes.storefront_login_url | default: routes.account_login_url }}`;
const loginUrl = (vuelta) => `${LOGIN}?return_to=${encodeURIComponent(vuelta)}&amp;return_url=${encodeURIComponent(vuelta)}`;

const MARIPOSA = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g fill="currentColor"><ellipse cx="7.3" cy="8.4" rx="5" ry="3.8" transform="rotate(-35 7.3 8.4)"/><ellipse cx="16.7" cy="8.4" rx="5" ry="3.8" transform="rotate(35 16.7 8.4)"/><ellipse cx="8.4" cy="15.6" rx="3.4" ry="2.7" transform="rotate(30 8.4 15.6)"/><ellipse cx="15.6" cy="15.6" rx="3.4" ry="2.7" transform="rotate(-30 15.6 15.6)"/></g><path d="M12 6.5v12M12 6.5 10.2 3.2M12 6.5l1.8-3.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/></svg>`;

// Iconos de línea de las categorías (idea de las tarjetas con icono de las plantillas de belleza).
const ICONOS = {
  todo: '<path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z"/>',
  skincare: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  maquillaje: '<path d="M9 21h6v-8H9z"/><path d="M10 13V7.5L14 4v9"/>',
  perfumes: '<rect x="6" y="9" width="12" height="12" rx="3"/><path d="M10 9V6h4v3M9 3h6"/>',
  'cabello-cuerpo': '<path d="M7 21c0-7 2-13 9-17"/><path d="M11 21c0-5 2-9 7-12"/><path d="M4 12c3-1 5 0 6 2"/>',
  consejos: '<path d="M4 6h16v10H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
};
const icono = (id, size = 22) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[id] || ICONOS.consejos}</svg>`;
// Destello de cuatro puntas y línea ondulada: las «pegatinas» de las plantillas juveniles, en colores Nina.
const DESTELLO = (c, s, extra = '') =>
  `<svg class="nf-deco ${extra}" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path fill="${c}" d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z"/></svg>`;
const ONDA = (c, extra = '') =>
  `<svg class="nf-deco ${extra}" viewBox="0 0 120 24" width="120" height="24" aria-hidden="true"><path d="M2 12c10-12 20-12 29 0s19 12 29 0 19-12 29 0 19 12 29 0" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/></svg>`;
// Color de cada categoría para su icono y su avatar (todo dentro de la paleta Nina).
const TONO = { skincare: '#C92F60', maquillaje: '#F72E75', perfumes: '#B0245A', 'cabello-cuerpo': '#E0567F', consejos: '#6E6E6E' };

const CSS = `
.nf{--rosa:#F72E75;--petalo:#FFCCD5;--petalo2:#FFF1F4;--fram:#C92F60;--graf:#2B2B2B;--gris:#6E6E6E;--linea:#F3DDE3;
  --serif:'Cormorant Garamond','Cormorant',var(--font-heading--family,Georgia),serif;--sans:Montserrat,var(--font-body--family,system-ui),sans-serif;
  max-width:1100px;margin:0 auto;padding:24px 16px 64px;color:var(--graf);font-family:var(--sans);font-size:15px;line-height:1.6}
.nf *{box-sizing:border-box}
.nf a{color:var(--fram)}
.nf h1,.nf h2,.nf h3{font-family:var(--serif);font-weight:500;color:var(--graf);line-height:1.15;margin:0}
.nf-hero{text-align:center;padding:0 8px}
.nf-kicker{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--fram);margin:0 0 8px;font-weight:600}
.nf-hero h1{font-size:clamp(34px,4.4vw,42px);color:var(--rosa)}
.nf-hero p{max-width:640px;margin:2px auto 0}
.nf-hero .nf-kicker{margin-bottom:4px}
.nf-banners{display:grid;gap:14px;margin-top:14px}
@media(min-width:700px){.nf-banners{grid-template-columns:1fr 1fr}}
.nf-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;border-radius:20px;padding:12px 20px;text-decoration:none;min-height:74px;transition:transform .15s,box-shadow .15s}
.nf-banner:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(201,47,96,.18)}
.nf-banner b{display:block;font-family:var(--serif);font-weight:500;font-size:clamp(22px,2.6vw,26px);line-height:1.1}
.nf-banner span{display:block;font-size:13px;margin-top:2px}
.nf-banner i{font-style:normal;flex:0 0 auto;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:20px}
.nf-banner.rosa{background:var(--rosa);color:#fff!important}.nf-banner.rosa i{background:#fff;color:var(--rosa)}
.nf-banner.petalo{background:var(--petalo);color:var(--graf)!important}.nf-banner.petalo b{color:var(--fram)}.nf-banner.petalo i{background:var(--fram);color:#fff}
.nf-barra{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:28px 0 18px}
.nf-barra .nf-cats{margin:0}
.nf-buscar{display:flex;align-items:center;gap:6px;border:1px solid var(--linea);border-radius:999px;padding:4px 6px 4px 12px;background:rgba(255,255,255,.85);color:var(--gris)}
.nf-buscar input{border:0;background:transparent;font:13px var(--sans);color:var(--graf);width:150px;padding:4px 0;outline:none}
.nf-buscar input::placeholder{color:var(--gris)}
.nf-buscar button{border:0;background:none;color:var(--fram);cursor:pointer;padding:4px;display:grid;place-items:center}
.nf-buscar:focus-within{border-color:var(--rosa)}
.nf-hero p{font-size:14px}
@media(max-width:699px){
  .nf-banners{grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
  .nf-banner{min-height:0;padding:14px 16px;border-radius:18px}
  .nf-banner b{font-size:21px}.nf-banner span,.nf-banner i{display:none}
  .nf-barra{margin:20px 0 14px}
  .nf-barra .nf-cats{flex-wrap:nowrap;overflow-x:auto;width:100%;padding-bottom:4px;scrollbar-width:none}
  .nf-barra .nf-cats::-webkit-scrollbar{display:none}
  .nf-cat{white-space:nowrap}
  .nf-buscar{width:100%}.nf-buscar input{flex:1;width:auto}
}
.nf-chip.ejemplo{background:#fff;border:1px dashed var(--petalo);color:var(--gris)}
.nf-btn{display:inline-flex;align-items:center;gap:8px;background:var(--fram);color:#fff!important;border:1.5px solid var(--fram);border-radius:999px;padding:12px 24px;font:600 14px var(--sans);letter-spacing:.03em;text-decoration:none;cursor:pointer}
.nf-btn:hover{background:var(--rosa);border-color:var(--rosa)}
.nf-btn.linea{background:transparent;color:var(--fram)!important}
.nf-btn.linea:hover{background:var(--petalo2)}
.nf-acciones{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px}
.nf-cats{display:flex;flex-wrap:wrap;gap:8px;margin:28px 0 18px}
.nf-cat{border:1px solid var(--petalo);border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600;text-decoration:none;color:var(--graf)!important;background:#fff}
.nf-cat.on,.nf-cat:hover{background:var(--fram);border-color:var(--fram);color:#fff!important}
.nf-lista{display:grid;gap:14px}
.nf-card{display:block;background:#fff;border:1px solid var(--linea);border-radius:20px;padding:20px 22px;text-decoration:none;color:var(--graf)!important;transition:box-shadow .15s,transform .15s}
a.nf-card:hover{box-shadow:0 10px 26px rgba(201,47,96,.12);transform:translateY(-1px)}
.nf-chip{display:inline-block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;background:var(--petalo2);color:var(--fram);padding:3px 10px;border-radius:999px;font-weight:600}
.nf-chip.fijo{background:var(--fram);color:#fff}
.nf-card h3{font-size:24px;font-weight:600;margin:10px 0 4px}
.nf-meta{font-size:13px;color:var(--gris);display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center}
.nf-equipo{display:inline-flex;align-items:center;gap:5px;background:var(--fram);color:#fff;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;letter-spacing:.04em}
.nf-vacio{text-align:center;padding:40px 16px;border:1px dashed var(--petalo);border-radius:20px;color:var(--gris)}
.nf-pag{display:flex;justify-content:center;gap:10px;margin-top:22px}
.nf-caja{background:#fff;border:1px solid var(--linea);border-radius:22px;padding:24px;margin-top:28px}
.nf-caja h2{font-size:30px;color:var(--rosa);margin-bottom:6px}
.nf-caja.rosa{background:var(--rosa);border-color:var(--rosa);color:#fff}
.nf-caja.rosa h2,.nf-caja.rosa .nf-nota,.nf-caja.rosa label,.nf-caja.rosa a:not(.nf-btn){color:#fff}
.nf-caja.rosa .nf-nota{font-size:14px;font-weight:500}
.nf-caja.rosa a:not(.nf-btn){text-decoration:underline}
.nf-caja.rosa .nf-form input[type=text],.nf-caja.rosa .nf-form select,.nf-caja.rosa .nf-form textarea{border-color:#fff}
.nf-caja.rosa .nf-form input:focus,.nf-caja.rosa .nf-form select:focus,.nf-caja.rosa .nf-form textarea:focus{outline-color:#fff}
.nf-caja.rosa .nf-check input{accent-color:#fff}
.nf-caja.rosa .nf-btn{background:#fff;border-color:#fff;color:var(--fram)!important}
.nf-caja.rosa .nf-btn:hover{background:var(--petalo);border-color:var(--petalo)}
.nf-form{display:grid;gap:14px;margin-top:14px}
.nf-form label{display:grid;gap:6px;font-size:13px;font-weight:600}
.nf-form input[type=text],.nf-form select,.nf-form textarea{width:100%;border:1px solid var(--petalo);border-radius:14px;padding:12px 14px;font:15px var(--sans);color:var(--graf);background:#fff}
.nf-form textarea{min-height:140px;resize:vertical}
.nf-form input:focus,.nf-form select:focus,.nf-form textarea:focus{outline:2px solid var(--rosa);outline-offset:1px}
.nf-check{display:flex!important;grid-template-columns:none!important;gap:10px!important;align-items:flex-start;font-weight:400!important;line-height:1.5}
.nf-check input{margin-top:4px;accent-color:var(--fram)}
.nf-nota{font-size:13px;color:var(--gris);margin:0}
.nf-trampa{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}
.nf-aviso{border-radius:16px;padding:14px 18px;margin:18px 0 0;font-size:14px}
.nf-aviso.ok{background:#E8F5EE;color:#1F7A4D}.nf-aviso.error{background:#FDE9EE;color:#A61B3A}
.nf-miga{font-size:13px;margin-bottom:14px}
.nf-tema{background:#fff;border:1px solid var(--linea);border-radius:24px;padding:26px}
.nf-tema h1{font-size:clamp(30px,4.5vw,44px);margin:10px 0 6px}
.nf-cuerpo{font-size:16px;margin-top:14px}.nf-cuerpo p{margin:0 0 12px}
.nf-pie{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:8px}
.nf-mini{background:none;border:1px solid var(--petalo);border-radius:999px;padding:5px 14px;font:600 13px var(--sans);color:var(--fram);cursor:pointer}
.nf-mini:hover{background:var(--petalo2)}
.nf-denuncia summary{cursor:pointer;font-size:12px;color:var(--gris);list-style:none}
.nf-denuncia summary::-webkit-details-marker{display:none}
.nf-denuncia form{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.nf-denuncia select{border:1px solid var(--petalo);border-radius:10px;padding:6px 10px;font:13px var(--sans)}
.nf-resps{display:grid;gap:12px;margin-top:22px}
.nf-resps h2{font-size:28px}
.nf-resp{display:grid;grid-template-columns:40px 1fr;gap:12px;background:#fff;border:1px solid var(--linea);border-radius:20px;padding:18px}
.nf-resp.nina{background:var(--petalo2);border-color:var(--petalo)}
.nf-av{width:40px;height:40px;border-radius:50%;background:var(--petalo);color:var(--fram);display:grid;place-items:center;font-weight:700;font-family:var(--serif);font-size:20px}
.nf-resp.nina .nf-av{background:var(--fram);color:#fff}
.nf-resp p{margin:6px 0 0}
.nf-legal{font-size:12px;color:var(--gris);margin-top:24px;line-height:1.5}
.nf-normas{background:#fff;border:1px solid var(--linea);border-radius:24px;padding:26px;max-width:780px;margin:24px auto 0}
.nf-normas li{margin:6px 0}
/* ===== Rediseño 2026-11-27: llamativo y fácil ===== */
.nf{position:relative}
.nf .nf-deco{position:absolute;pointer-events:none;z-index:0}
.nf-top{position:relative;display:grid;gap:18px;align-items:center;padding:20px 22px;border-radius:28px;background:linear-gradient(135deg,#FFF1F4 0%,#FFE3EA 55%,#FFCCD5 100%);overflow:hidden}
.nf-top>*:not(.nf-deco){position:relative;z-index:1}
.nf-top .d1{top:14px;right:46%;z-index:0}.nf-top .d2{bottom:16px;left:8px;z-index:0}.nf-top .o1{top:-4px;left:38%;opacity:.55;z-index:0}
.nf-etiqueta{display:inline-block;background:var(--graf);color:#fff;font:700 11px var(--sans);letter-spacing:.18em;text-transform:uppercase;padding:6px 12px;border-radius:6px;transform:rotate(-2deg);box-shadow:3px 3px 0 var(--rosa)}
.nf-top h1{font-size:clamp(38px,4.6vw,50px);color:var(--graf);margin:6px 0 2px;line-height:1}
.nf-top h1 em{font-style:italic;color:var(--rosa)}
.nf-top p{margin:0;max-width:440px}
.nf-cifras{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.nf-cifra{display:inline-flex;align-items:center;gap:6px;background:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600;color:var(--graf);box-shadow:0 2px 0 var(--petalo)}
.nf-cifra b{color:var(--rosa);font-size:14px}
.nf-top .nf-banners{margin:0;grid-template-columns:1fr;gap:12px}
.nf-banner{position:relative;border-radius:18px;min-height:62px;padding:9px 18px;box-shadow:5px 5px 0 var(--graf);border:2px solid var(--graf)}
.nf-banner:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--graf)}
.nf-banner.petalo{background:#fff}
.nf-banner .nf-pegatina{position:absolute;top:-12px;right:64px;background:#FFE25C;color:var(--graf);font:800 10px var(--sans);letter-spacing:.08em;text-transform:uppercase;padding:4px 9px;border-radius:999px;transform:rotate(6deg);border:1.5px solid var(--graf);display:block;margin:0}
@media(min-width:800px){.nf-top{grid-template-columns:1.05fr 1fr;padding:16px 28px}}
.nf-cats2{display:flex;gap:10px;margin:26px 0 8px;overflow-x:auto;padding:4px 2px 8px;scrollbar-width:none}
.nf-cats2::-webkit-scrollbar{display:none}
.nf-tile{flex:1 0 128px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;background:#fff;border:1.5px solid var(--linea);border-radius:18px;padding:12px 14px;text-decoration:none;color:var(--graf)!important;transition:transform .15s,box-shadow .15s,border-color .15s}
.nf-tile i{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#fff;font-style:normal}
.nf-tile b{font-size:14px;line-height:1.2}
.nf-tile small{font-size:12px;color:var(--gris)}
.nf-tile:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(201,47,96,.14)}
.nf-tile.on{border-color:var(--graf);box-shadow:4px 4px 0 var(--rosa)}
.nf-cabeza{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:14px 0 14px}
.nf-cabeza h2{font-size:30px}
.nf-card{position:relative;display:grid;grid-template-columns:46px 1fr;gap:14px;border:1.5px solid var(--linea);border-radius:20px;padding:16px 18px;background:rgba(255,255,255,.96)}
a.nf-card:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--petalo);border-color:var(--rosa)}
.nf-card.fijada{border-color:var(--graf);box-shadow:5px 5px 0 var(--rosa)}
.nf-avatar{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;color:#fff;font:600 21px var(--serif)}
.nf-card h3{font-size:22px;margin:6px 0 2px}
.nf-extracto{margin:0 0 6px;color:#555;font-size:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.nf-chip.nina{background:#fff;border:1.5px solid var(--rosa);color:var(--rosa);display:inline-flex;align-items:center;gap:4px}
.nf-pastilla{display:inline-flex;align-items:center;gap:4px;font-weight:600;color:var(--fram)}
.nf-pasos{display:grid;gap:12px;margin-top:28px}
@media(min-width:700px){.nf-pasos{grid-template-columns:repeat(3,1fr)}}
.nf-paso{position:relative;background:#fff;border:1.5px solid var(--linea);border-radius:20px;padding:16px 18px 16px 62px}
.nf-paso span{position:absolute;left:16px;top:16px;width:34px;height:34px;border-radius:50%;background:var(--rosa);color:#fff;display:grid;place-items:center;font:600 20px var(--serif)}
.nf-paso b{display:block;font-size:14px}.nf-paso p{margin:2px 0 0;font-size:13px;color:var(--gris)}
.nf-fab{display:none}
@media(max-width:899px){.nf-fab{display:inline-flex;position:fixed;left:16px;bottom:18px;z-index:20;align-items:center;gap:6px;background:var(--rosa);color:#fff!important;text-decoration:none;font:700 14px var(--sans);padding:12px 18px;border-radius:999px;box-shadow:3px 3px 0 var(--graf);border:2px solid var(--graf)}}
.nf-volver{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid var(--linea);border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px;text-decoration:none}
.nf-tema{position:relative;border:2px solid var(--graf);box-shadow:6px 6px 0 var(--petalo);overflow:hidden}
.nf-tema .dt{top:18px;right:22px}
.nf-tema .nf-etiqueta{background:var(--rosa);box-shadow:3px 3px 0 var(--graf)}
.nf-autor{display:flex;align-items:center;gap:10px;margin-top:8px}
.nf-autor .nf-avatar{width:38px;height:38px;font-size:18px}
.nf-compartir{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.nf-resp{grid-template-columns:40px 1fr;border:0;background:transparent;padding:0}
.nf-burbuja{position:relative;background:#fff;border:1.5px solid var(--linea);border-radius:4px 20px 20px 20px;padding:12px 16px}
.nf-resp.nina{background:transparent}
.nf-resp.nina .nf-burbuja{background:var(--petalo2);border-color:var(--rosa)}
@media(max-width:699px){
  .nf-top{padding:14px 14px 16px;gap:12px}
  .nf-top h1{font-size:36px;margin-top:4px}
  .nf-top p{font-size:13px;line-height:1.45}
  .nf-cifras{margin-top:6px;gap:6px}.nf-cifra{padding:3px 9px;font-size:11px}.nf-cifra:last-child{display:none}
  .nf-top .nf-banners{grid-template-columns:1fr 1fr;gap:10px}
  .nf-banner{min-height:0;padding:10px 12px;box-shadow:3px 3px 0 var(--graf)}
  .nf-banner b{font-size:18px}
  .nf-banner .nf-pegatina{right:10px;top:-11px;display:block}
  .nf-cats2{margin:18px 0 4px;gap:8px}
  .nf-tile{flex:0 0 auto;display:grid;grid-template-columns:32px auto;column-gap:8px;row-gap:0;align-items:center;padding:7px 12px 7px 8px;border-radius:14px}
  .nf-tile i{width:32px;height:32px;border-radius:10px;grid-row:span 2}
  .nf-tile i svg{width:18px;height:18px}
  .nf-tile b{font-size:13px;white-space:nowrap}.nf-tile small{font-size:11px;white-space:nowrap}
  .nf-card{grid-template-columns:38px 1fr;gap:10px;padding:14px}
  .nf-avatar{width:38px;height:38px;font-size:18px}
  .nf-card h3{font-size:20px}
}
@media(min-width:900px){.nf-dos{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}.nf-dos .nf-caja{margin-top:0;position:sticky;top:20px}}
`;

// Fuera de .nf: el foro es un espacio de comunidad, así que se oculta la lupa de productos de la cabecera
// (solo en las páginas del foro) y se ponen las mariposas de marca de agua en el fondo de toda la página.
const PAGINA = `
search-button.search-action,.search-action{display:none!important}
body,main#MainContent{background-image:${FONDO_MARIPOSAS}!important;background-size:420px 420px!important;background-repeat:repeat!important}
`;
const envolver = (html, extra = '') => `<style>${PAGINA}${CSS}</style><div class="nf">${html}</div>${extra}`;

function cabecera(enPortada = true, cifras = null) {
  const c = cifras && cifras.temas ? `<div class="nf-cifras"><span class="nf-cifra"><b>${cifras.temas}</b> ${cifras.temas === 1 ? 'tema' : 'temas'}</span><span class="nf-cifra"><b>${cifras.respuestas}</b> ${cifras.respuestas === 1 ? 'respuesta' : 'respuestas'}</span><span class="nf-cifra">${MARIPOSA} Responde el equipo Nina</span></div>` : '';
  return `<section class="nf-top">
  ${DESTELLO('#F72E75', 22, 'd1')}${DESTELLO('#FFFFFF', 30, 'd2')}${ONDA('#FFFFFF', 'o1')}
  <div>
    <span class="nf-etiqueta">Comunidad Nina</span>
    <h1>Foro <em>Nina</em></h1>
    <p>Pregunta, comparte tus trucos y ayuda a otras chicas. Nuestro equipo también responde.</p>
    ${c}
  </div>
  <div class="nf-banners">
    <a class="nf-banner rosa" href="${enPortada ? '' : BASE}#abrir-tema"><div><b>Abre tu tema en el foro</b><span>Cuéntanos tu duda o comparte tu truco</span></div><i aria-hidden="true">${MARIPOSA.replace('width="14" height="14"', 'width="22" height="22"')}</i></a>
    <a class="nf-banner petalo" href="/blogs/nina-blog"><em class="nf-pegatina">Trucos</em><div><b>Visita nuestro blog</b><span>Rutinas, perfumes y trucos explicados fácil</span></div><i aria-hidden="true">→</i></a>
  </div>
</section>`;
}
const LUPA = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
/** Buscador discreto: solo busca en los temas del foro, no en productos. */
const buscador = (buscar, catActual) =>
  `<form class="nf-buscar" method="get" action="${BASE}" role="search">${catActual ? `<input type="hidden" name="c" value="${t(catActual)}">` : ''}<input type="search" name="q" value="${t(buscar)}" placeholder="Buscar en el foro" aria-label="Buscar en el foro" maxlength="80"><button type="submit" aria-label="Buscar">${LUPA}</button></form>`;
const autorDe = (x) => (x.ejemplo ? `${x.autor} · ejemplo` : x.autor);
const chipEjemplo = (x) => (x.ejemplo ? ' <span class="nf-chip ejemplo">Tema de ejemplo</span>' : '');

const mensajes = {
  enviado: ['ok', '¡Gracias! Hemos recibido tu tema. Lo publicaremos en cuanto lo revisemos (normalmente en menos de 24 horas).'],
  publicado: ['ok', '¡Listo! Tu tema ya está publicado.'],
  respuesta: ['ok', '¡Gracias por responder! Tu respuesta aparecerá en cuanto la revisemos.'],
  respondido: ['ok', '¡Gracias por responder!'],
  denuncia: ['ok', 'Gracias por avisarnos. Lo revisaremos lo antes posible.'],
  sesion: ['error', 'Tu sesión ha caducado. Vuelve a intentarlo, por favor.'],
  limite: ['error', 'Has escrito muchos mensajes hoy. Vuelve a intentarlo mañana.'],
  bloqueada: ['error', 'Tu cuenta no puede publicar en el foro. Si crees que es un error, escríbenos.'],
};
const aviso = (clave, error) => {
  if (error) return `<div class="nf-aviso error" role="alert">${t(error)}</div>`;
  const m = mensajes[clave];
  return m ? `<div class="nf-aviso ${m[0]}" role="status">${t(m[1])}</div>` : '';
};

const casillaNormas = (perfil) =>
  perfil?.acepto_normas_at
    ? ''
    : `<label class="nf-check"><input type="checkbox" name="acepto" value="1" required> <span>Tengo 14 años o más y acepto las <a href="${BASE}/normas" target="_blank">normas del foro</a> y la <a href="/policies/privacy-policy" target="_blank">política de privacidad</a>. Mi nombre en el foro y mis mensajes serán públicos.</span></label>`;

function campoApodo(perfil, sugerido) {
  return `<label>Tu nombre<input type="text" name="apodo" maxlength="30" required value="${t(perfil?.apodo || sugerido || '')}" placeholder="Por ejemplo: Laura M."></label>`;
}

function formTema({ sesion, perfil, sugerido, token, valores = {}, catActual }) {
  if (!sesion)
    return `<div class="nf-caja rosa" id="abrir-tema"><h2>Abre tu tema</h2><p class="nf-nota">Para escribir en el foro inicia sesión con tu cuenta de Nina Beauty (si no tienes, se crea al momento con tu correo).</p>
<p style="margin:16px 0 0"><a class="nf-btn" href="${loginUrl(`${BASE}#abrir-tema`)}">Iniciar sesión para escribir</a></p></div>`;
  const opts = CATEGORIAS.map((c) => `<option value="${c.id}"${(valores.categoria || catActual) === c.id ? ' selected' : ''}>${t(c.nombre)}</option>`).join('');
  return `<div class="nf-caja rosa" id="abrir-tema"><h2>Abre tu tema</h2><p class="nf-nota">Cuéntanos tu duda o tu truco. Revisamos cada mensaje antes de publicarlo.</p>
<form class="nf-form" method="post" action="${BASE}/nuevo">
  <input type="hidden" name="token" value="${t(token)}">
  <div class="nf-trampa" aria-hidden="true"><label>No rellenar<input type="text" name="web" tabindex="-1" autocomplete="off"></label></div>
  ${campoApodo(perfil, sugerido)}
  <label>Categoría<select name="categoria" required><option value="">Elige una…</option>${opts}</select></label>
  <label>Título<input type="text" name="titulo" maxlength="120" required value="${t(valores.titulo || '')}" placeholder="¿Qué rutina de noche me recomendáis para piel mixta?"></label>
  <label>Tu mensaje<textarea name="cuerpo" maxlength="3000" required placeholder="Cuéntanos tu tipo de piel, qué usas ahora y qué te gustaría mejorar.">${t(valores.cuerpo || '')}</textarea></label>
  ${casillaNormas(perfil)}
  <p class="nf-nota">No compartas datos personales (teléfono, dirección, correo) ni fotos de terceras personas.</p>
  <div><button class="nf-btn" type="submit">Publicar mi tema</button></div>
</form></div>`;
}

function tarjeta(tm) {
  const cat = categoria(tm.categoria);
  const color = tm.equipo ? '#C92F60' : TONO[tm.categoria] || '#C92F60';
  const extracto = String(tm.cuerpo || '').replace(/\s+/g, ' ').slice(0, 170);
  return `<a class="nf-card${tm.fijado ? ' fijada' : ''}" href="${BASE}/${rutaTema(tm)}">
  <span class="nf-avatar" style="background:${color}">${tm.equipo ? MARIPOSA.replace('width="14" height="14"', 'width="22" height="22"') : t((tm.autor || '?').charAt(0).toUpperCase())}</span>
  <div>
    ${tm.fijado ? '<span class="nf-chip fijo">Destacado</span> ' : ''}<span class="nf-chip">${t(cat?.nombre || tm.categoria)}</span>${chipEjemplo(tm)}${tm.con_nina && !tm.equipo ? ` <span class="nf-chip nina">${MARIPOSA} Responde Nina</span>` : ''}
    <h3>${t(tm.titulo)}</h3>
    ${extracto ? `<p class="nf-extracto">${t(extracto)}</p>` : ''}
    <div class="nf-meta"><span>${tm.equipo ? `<span class="nf-equipo">${MARIPOSA} Equipo Nina</span>` : t(autorDe(tm))}</span><span>${fecha(tm.actividad)}</span><span class="nf-pastilla">💬 ${tm.respuestas}</span>${tm.ayuda ? `<span class="nf-pastilla">♥ ${tm.ayuda}</span>` : ''}</div>
  </div>
</a>`;
}

const PASOS = `<section class="nf-pasos" aria-label="Cómo funciona el foro">
  <div class="nf-paso"><span>1</span><b>Pregunta o comparte</b><p>Abre tu tema con tu duda o tu truco favorito.</p></div>
  <div class="nf-paso"><span>2</span><b>La comunidad responde</b><p>Otras chicas te cuentan lo que les funciona.</p></div>
  <div class="nf-paso"><span>3</span><b>El equipo Nina te ayuda</b><p>Revisamos cada mensaje y respondemos también.</p></div>
</section>`;

/** Portada del foro: categorías, lista de temas y formulario. */
export function portada({ temas, total, pagina, porPagina, catActual, buscar = '', conteo = {}, cifras = null, sesion, perfil, sugerido, token, ok, error, valores }) {
  const n = (k) => (k ? `${k} ${k === 1 ? 'tema' : 'temas'}` : 'Sé la primera');
  const todos = Object.values(conteo).reduce((a, b) => a + b, 0);
  const cats = [`<a class="nf-tile${!catActual ? ' on' : ''}" href="${BASE}"><i style="background:var(--graf)">${icono('todo')}</i><b>Todo</b><small>${n(todos)}</small></a>`]
    .concat(CATEGORIAS.map((c) => `<a class="nf-tile${catActual === c.id ? ' on' : ''}" href="${BASE}?c=${c.id}" title="${t(c.desc)}"><i style="background:${TONO[c.id]}">${icono(c.id)}</i><b>${t(c.nombre)}</b><small>${n(conteo[c.id] || 0)}</small></a>`))
    .join('');
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const q = (p) => `${BASE}?${catActual ? `c=${catActual}&amp;` : ''}${buscar ? `q=${encodeURIComponent(buscar)}&amp;` : ''}p=${p}`;
  const pag =
    paginas > 1
      ? `<nav class="nf-pag">${pagina > 1 ? `<a class="nf-btn linea" href="${q(pagina - 1)}">← Más recientes</a>` : ''}${pagina < paginas ? `<a class="nf-btn linea" href="${q(pagina + 1)}">Más antiguos →</a>` : ''}</nav>`
      : '';
  const lista = temas.length
    ? `<div class="nf-lista">${temas.map(tarjeta).join('')}</div>${pag}`
    : buscar
      ? `<div class="nf-vacio"><p style="font-family:var(--serif);font-size:26px;color:var(--rosa);margin:0">No hay temas con «${t(buscar)}»</p><p style="margin:6px 0 0">Prueba con otra palabra o <a href="#abrir-tema">abre tú el tema</a>.</p></div>`
      : `<div class="nf-vacio"><p style="font-family:var(--serif);font-size:26px;color:var(--rosa);margin:0">${catActual ? 'Aún no hay temas aquí' : 'El foro acaba de abrir'}</p><p style="margin:6px 0 0">¡Sé la primera en abrir un tema!</p></div>`;
  const cat = categoria(catActual);
  const tituloLista = buscar
    ? `Resultados para «${t(buscar)}» <a href="${BASE}${catActual ? `?c=${catActual}` : ''}" style="font:600 13px var(--sans);margin-left:8px">Quitar búsqueda</a>`
    : cat ? t(cat.nombre) : 'Últimos temas';
  return envolver(`${cabecera(true, cifras)}
${aviso(ok, error)}
<nav class="nf-cats2" aria-label="Categorías">${cats}</nav>
<div class="nf-dos"><div><div class="nf-cabeza"><h2>${tituloLista}</h2>${buscador(buscar, catActual)}</div>${lista}</div>
${formTema({ sesion, perfil, sugerido, token, valores, catActual })}</div>
${PASOS}
<a class="nf-fab" href="#abrir-tema">＋ Abrir tema</a>
<p class="nf-legal">Los consejos del foro los escriben clientas y nuestro equipo, son orientativos y no sustituyen la opinión de un profesional. Si tienes una irritación o un problema de piel que no mejora, consulta a tu dermatólogo. <a href="${BASE}/normas">Normas del foro</a>.</p>`);
}

/** Página de un tema con sus respuestas. */
export function paginaTema({ tema, respuestas, sesion, perfil, sugerido, token, ok, error, valores = {}, url }) {
  const cat = categoria(tema.categoria);
  const ruta = `${BASE}/${rutaTema(tema)}`;
  const votar = (tipo, id, n) =>
    sesion
      ? `<form method="post" action="${BASE}/ayuda" style="display:inline"><input type="hidden" name="token" value="${t(token)}"><input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="id" value="${id}"><input type="hidden" name="volver" value="${t(ruta)}"><button class="nf-mini" type="submit">♥ Me ayudó${n ? ` · ${n}` : ''}</button></form>`
      : n
        ? `<span class="nf-meta">♥ ${n} ${n === 1 ? 'persona dice' : 'personas dicen'} que le ayudó</span>`
        : '';
  const denunciar = (tipo, id, equipo) =>
    sesion && !equipo
      ? `<details class="nf-denuncia"><summary>Avisar de un problema</summary><form method="post" action="${BASE}/denunciar"><input type="hidden" name="token" value="${t(token)}"><input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="id" value="${id}"><input type="hidden" name="volver" value="${t(ruta)}">
<select name="motivo"><option>Spam o publicidad</option><option>Insultos o falta de respeto</option><option>Datos personales</option><option>Consejo peligroso</option><option>Otro motivo</option></select><button class="nf-mini" type="submit">Enviar aviso</button></form></details>`
      : '';
  const resp = respuestas
    .map(
      (r) => `<article class="nf-resp${r.equipo ? ' nina' : ''}" id="r${r.id}">
  <div class="nf-av">${r.equipo ? MARIPOSA.replace('width="14" height="14"', 'width="20" height="20"') : t((r.autor || '?').charAt(0).toUpperCase())}</div>
  <div class="nf-burbuja"><div class="nf-meta"><b style="color:var(--graf)">${r.equipo ? `<span class="nf-equipo">${MARIPOSA} Equipo Nina</span>` : t(autorDe(r))}</b><span>${fecha(r.creado)}</span></div>
  <div class="nf-cuerpo" style="margin-top:4px;font-size:15px">${parrafos(r.cuerpo)}</div>
  <div class="nf-pie">${votar('respuesta', r.id, r.ayuda)}${denunciar('respuesta', r.id, r.equipo)}</div></div>
</article>`,
    )
    .join('');
  const responder = !sesion
    ? `<div class="nf-caja" id="responder"><h2>Responder</h2><p class="nf-nota">Inicia sesión con tu cuenta de Nina Beauty para responder.</p><p style="margin:16px 0 0"><a class="nf-btn" href="${loginUrl(ruta + '#responder')}">Iniciar sesión para responder</a></p></div>`
    : `<div class="nf-caja" id="responder"><h2>Responder</h2>
<form class="nf-form" method="post" action="${BASE}/responder">
  <input type="hidden" name="token" value="${t(token)}"><input type="hidden" name="tema" value="${tema.id}">
  <div class="nf-trampa" aria-hidden="true"><label>No rellenar<input type="text" name="web" tabindex="-1" autocomplete="off"></label></div>
  ${campoApodo(perfil, sugerido)}
  <label>Tu respuesta<textarea name="cuerpo" maxlength="2000" required placeholder="Comparte lo que te ha funcionado a ti.">${t(valores.cuerpo || '')}</textarea></label>
  ${casillaNormas(perfil)}
  <div><button class="nf-btn" type="submit">Publicar respuesta</button></div>
</form></div>`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: tema.titulo,
    text: tema.cuerpo,
    url,
    inLanguage: 'es-ES',
    datePublished: iso(tema.publicado_at || tema.creado),
    author: { '@type': tema.equipo ? 'Organization' : 'Person', name: tema.equipo ? 'Nina Beauty' : tema.autor },
    interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: respuestas.length }],
    comment: respuestas.map((r) => ({
      '@type': 'Comment',
      text: r.cuerpo,
      datePublished: iso(r.creado),
      author: { '@type': r.equipo ? 'Organization' : 'Person', name: r.equipo ? 'Nina Beauty' : r.autor },
    })),
  };
  // En JSON nunca hay «{{» ni «{%» fuera de un texto; dentro de un texto los escapamos para que Liquid no los toque.
  const ldTxt = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/\{(?=[{%])/g, '\\u007b');
  return envolver(
    `<nav class="nf-miga"><a class="nf-volver" href="${BASE}">← Foro Nina</a> <a class="nf-volver" href="${BASE}?c=${t(tema.categoria)}">${icono(tema.categoria, 16)} ${t(cat?.nombre || tema.categoria)}</a></nav>
${aviso(ok, error)}
<article class="nf-tema">
  ${DESTELLO('#FFCCD5', 26, 'dt')}
  <span class="nf-etiqueta">${t(cat?.nombre || tema.categoria)}</span> ${tema.fijado ? '<span class="nf-chip fijo">Destacado</span>' : ''}${chipEjemplo(tema)}
  <h1>${t(tema.titulo)}</h1>
  <div class="nf-autor"><span class="nf-avatar" style="background:${tema.equipo ? '#C92F60' : TONO[tema.categoria] || '#C92F60'}">${tema.equipo ? MARIPOSA.replace('width="14" height="14"', 'width="20" height="20"') : t((tema.autor || '?').charAt(0).toUpperCase())}</span><div class="nf-meta"><span>${tema.equipo ? `<span class="nf-equipo">${MARIPOSA} Equipo Nina</span>` : `Pregunta de <b>${t(autorDe(tema))}</b>`}</span><span>${fecha(tema.publicado_at || tema.creado)}</span></div></div>
  <div class="nf-cuerpo">${parrafos(tema.cuerpo)}</div>
  <div class="nf-pie">${votar('tema', tema.id, tema.ayuda)}<a class="nf-mini" style="text-decoration:none" href="https://wa.me/?text=${encodeURIComponent(`${tema.titulo} ${url || ''}`)}" target="_blank" rel="noopener">Compartir por WhatsApp</a>${denunciar('tema', tema.id, tema.equipo)}</div>
</article>
<section class="nf-resps"><h2>${respuestas.length ? plural(respuestas.length, 'respuesta', 'respuestas') : 'Aún no hay respuestas'}</h2>${resp || '<p class="nf-nota">¿Sabes algo que pueda ayudar? ¡Sé la primera en responder!</p>'}</section>
${responder}
<a class="nf-fab" href="#responder">＋ Responder</a>
<p class="nf-legal">Los consejos del foro son orientativos y no sustituyen la opinión de un profesional. Si tienes una irritación o un problema de piel que no mejora, consulta a tu dermatólogo. <a href="${BASE}/normas">Normas del foro</a>.</p>`,
    // Los temas de ejemplo no se marcan como conversaciones reales para Google.
    tema.ejemplo ? '' : `<script type="application/ld+json">${ldTxt}</script>`,
  );
}

export function normas() {
  return envolver(`${cabecera(false)}
<div class="nf-normas"><h2 style="font-size:34px;color:var(--rosa)">Normas del Foro Nina</h2>
<p>El Foro Nina es un espacio para ayudarnos entre todas. Para que siga siendo bonito:</p>
<ul>
<li><b>Respeto siempre.</b> Nada de insultos, burlas ni comentarios sobre el físico de nadie.</li>
<li><b>Sin datos personales.</b> No publiques teléfonos, direcciones, correos ni fotos de otras personas.</li>
<li><b>Sin publicidad ni enlaces.</b> Los mensajes con enlaces o promociones no se publican.</li>
<li><b>Consejos, no diagnósticos.</b> Comparte tu experiencia, pero no prometas que un producto cura nada. Ante un problema de piel, consulta a un dermatólogo.</li>
<li><b>Opiniones sinceras.</b> Cuenta tu experiencia real con los productos, buena o mala.</li>
<li><b>Edad mínima: 14 años.</b> Es la edad a la que en España puedes aceptar tú misma el uso de tus datos.</li>
</ul>
<h3 style="font-size:24px;margin-top:18px">Cómo moderamos</h3>
<p>Revisamos los mensajes antes de publicarlos y podemos editar o retirar los que no cumplan estas normas. Si ves algo que no debería estar, pulsa «Avisar de un problema». Con varios avisos, el mensaje se oculta hasta que lo revisemos.</p>
<h3 style="font-size:24px;margin-top:18px">Tus datos</h3>
<p>Para escribir necesitas tu cuenta de Nina Beauty. En el foro solo se muestra el nombre que elijas; tu correo nunca es visible. Puedes pedirnos que borremos tus mensajes cuando quieras escribiendo a nuestro correo de atención. Más información en la <a href="/policies/privacy-policy">política de privacidad</a>.</p>
<p style="margin-top:20px"><a class="nf-btn" href="${BASE}">Volver al foro</a></p></div>`);
}

export function noEncontrado() {
  return envolver(`<div class="nf-vacio" style="margin-top:24px"><p style="font-family:var(--serif);font-size:28px;color:var(--rosa);margin:0">Este tema no existe o aún no está publicado</p><p><a class="nf-btn" href="${BASE}">Ir al Foro Nina</a></p></div>`);
}
