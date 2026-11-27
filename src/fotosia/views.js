// Página «Fotos con IA» del panel.
import { shell, esc, icon } from '../views.js';

const STATUS = {
  pendiente: ['En cola', 'prueba'],
  generando: ['Generando…', 'running'],
  lista: ['Lista para revisar', 'nuevo'],
  dudosa: ['Dudosa: búscala tú', 'running'],
  error: ['Error', 'error'],
  subida: ['Subida a Shopify', 'ok'],
};
const img = (url, alt) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy"></a>` : '<div class="vacio">—</div>');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const n = (x) => Number(x || 0).toLocaleString('es-ES');

function row(r, ver) {
  const [label, cls] = STATUS[r.status] || [r.status, 'prueba'];
  const id = esc(r.product_id);
  const num = r.product_id.split('/').pop();
  const hid = `<input type="hidden" name="id" value="${id}"><input type="hidden" name="ver" value="${esc(ver)}">`;
  const acciones = r.status === 'subida' ? '' : `
    ${r.status === 'lista' ? `<form method="post" action="/fotos-ia/subir">${hid}<button class="btn">${icon('check', 16)} Subir a Shopify</button></form>` : ''}
    <form method="post" action="/fotos-ia/repetir" class="otra">${hid}
      <input name="fuente" placeholder="${r.status === 'dudosa' ? 'Pega aquí el enlace de la foto buena' : 'Otra foto de partida (enlace, opcional)'}"><button class="btn ghost">${r.status === 'dudosa' ? 'Usar esta foto' : 'Repetir'}</button></form>
    ${r.status === 'dudosa' && r.source_url ? `<form method="post" action="/fotos-ia/repetir">${hid}<input type="hidden" name="forzar" value="si"><button class="btn ghost">Es correcta: hazla</button></form>` : ''}
    <form method="post" action="/fotos-ia/descartar">${hid}<button class="btn ghost">Descartar</button></form>`;
  return `<div class="card foto">
  <div class="cab"><div><b>${esc(r.title)}</b><div class="sub">${esc(r.vendor || '')} · EAN ${esc(r.ean || '—')} · <a href="https://admin.shopify.com/store/ikwg4h-mk/products/${esc(num)}" target="_blank" rel="noopener">abrir en Shopify</a>${r.model ? ` · ${esc(r.model)}` : ''}</div></div><span class="chip ${cls}">${label}</span></div>
  ${r.doubt ? `<div class="sub duda">${icon('search', 14)} ${esc(r.doubt)}</div>` : ''}
  <div class="tres">
    <figure>${img(r.before_url, 'Antes')}<figcaption>Ahora en la tienda</figcaption></figure>
    <figure>${img(r.source_url, 'Foto encontrada')}<figcaption>Foto encontrada${r.source_page ? ` · <a href="${esc(r.source_page)}" target="_blank" rel="noopener">${esc(host(r.source_page))}</a>` : ''}</figcaption></figure>
    <figure>${img(r.result_url, 'Nueva con IA')}<figcaption>Nueva con Nano Banana</figcaption></figure>
  </div>
  ${r.filename ? `<div class="sub">Nombre del archivo: <code>${esc(r.filename)}</code></div>` : ''}
  ${r.error ? `<div class="sub err">${esc(r.error)}</div>` : ''}
  <div class="acc">${acciones}</div>
</div>`;
}

const FILTROS = [['', 'Todo'], ['lista', 'Por revisar'], ['dudosa', 'Dudosas'], ['error', 'Con error'], ['subida', 'Subidas']];

export function fotosPage({ rows, ver = '', counts, models = {}, state, keys, model, notice }) {
  const css = `<style>
.foto{margin-top:18px}.foto .cab{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.tres{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:16px 0 10px}
.tres figure{margin:0}.tres img,.tres .vacio{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--linea);border-radius:14px;display:flex;align-items:center;justify-content:center;color:var(--gris)}
.tres figcaption{font-size:12px;color:var(--gris);margin-top:6px;text-align:center}
.acc{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;align-items:center}.acc form{margin:0}
.otra{display:flex;gap:8px;flex:1;min-width:240px}.otra input,.lote input{flex:1;min-width:0;border:1px solid var(--petalo);border-radius:999px;padding:10px 16px;font:14px var(--sans)}
.lote{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}.lote input[type=number]{max-width:90px;flex:none}
.err{color:var(--rojo)}.sub{font-size:13px;color:var(--gris)}.duda{color:var(--ambar);margin-top:6px}
.filtros{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.filtros a{padding:7px 14px;border-radius:999px;border:1px solid var(--petalo);font-size:13px}.filtros a.on{background:var(--petalo);font-weight:600}
@media(max-width:720px){.tres{grid-template-columns:1fr 1fr}.tres figure:first-child{display:none}}
</style>`;
  const c = (k) => counts[k] || 0;
  const busy = state.running || !keys.magnific || !keys.search;
  const faltan = [!keys.magnific && '<code>MAGNIFIC_API_KEY</code>', !keys.search && '<code>SERPER_API_KEY</code>'].filter(Boolean);
  const pend = state.pending;
  const body = `${css}
<h1>Fotos con IA</h1>
<p class="sub">Para los productos que solo tienen el logo: busca su foto por EAN en Google Imágenes${keys.search ? ` (${esc(keys.search)})` : ''}, ${esc(model || 'Nano Banana')} en Magnific la rehace como foto de tienda 1:1 con fondo blanco para Google Shopping, y se guarda con el nombre del producto. Si no es seguro que la foto encontrada sea el producto, queda como <b>dudosa</b>: no gasta créditos ni se sube, y sale en el listado para que la busques tú.</p>
${notice ? `<div class="card" style="margin-top:14px">${notice}</div>` : ''}
${faltan.length ? `<div class="card" style="margin-top:14px">Falta ${faltan.join(' y ')} en Railway → Variables.</div>` : ''}
<div class="card" style="margin-top:14px">
  <b>${n(c('lista'))}</b> por revisar · <b>${n(c('subida'))}</b> subidas · <b>${n(c('dudosa'))}</b> dudosas · <b>${n(c('error'))}</b> con error
  ${Object.keys(models).length ? `<div class="sub">Modelo usado: ${Object.entries(models).map(([m, k]) => `${esc(m)} (${n(k)})`).join(' · ')}</div>` : ''}
  ${pend ? `<div class="sub">Productos con logo ahora: <b>${n(pend.total)}</b>, de ellos <b>${n(pend.fresh)}</b> sin intentar todavía.</div>` : ''}
  ${state.running ? `<p>${icon('spark', 16)} Trabajando: ${n(state.done)} de ${state.total ? n(state.total) : '…'}${state.auto ? ` · ${n(state.uploaded)} subidas` : ''} · ${n(state.doubtful)} dudosas · ${n(state.failed)} con error ${state.note ? '· ' + esc(state.note) : ''}. La página se recarga sola.</p>
    <form method="post" action="/fotos-ia/parar" class="lote"><button class="btn ghost">Parar</button></form>` : ''}
  ${state.stopped ? `<p class="err">Se paró: ${esc(state.stopped)}</p>` : ''}
  <form method="post" action="/fotos-ia/probar" class="lote">
    <span>Prueba con</span><input type="number" name="n" value="10" min="1" max="50"><span>productos (no sube nada)</span>
    <button class="btn" ${busy ? 'disabled' : ''}>Empezar</button>
  </form>
  <form method="post" action="/fotos-ia/todos" class="lote">
    <label><input type="checkbox" name="subir" value="si" checked> Subir solas a Shopify las que salgan seguras</label>
    <button class="btn" ${busy ? 'disabled' : ''}>Hacer todos los que quedan</button>
  </form>
  <form method="post" action="/fotos-ia/probar" class="lote">
    <input name="ids" placeholder="O pega enlaces/números de productos concretos, separados por espacios">
    <button class="btn ghost" ${busy ? 'disabled' : ''}>Hacer estos</button>
  </form>
  <div class="lote">
    ${c('lista') > 1 ? `<form method="post" action="/fotos-ia/subir-todas"><button class="btn ghost">Subir las ${n(c('lista'))} que están listas</button></form>` : ''}
    <form method="post" action="/fotos-ia/contar"><button class="btn ghost" ${state.counting ? 'disabled' : ''}>Contar productos con logo</button></form>
    ${c('dudosa') ? `<a class="btn ghost" href="/fotos-ia/dudosas.csv">${icon('download', 16)} Listado de dudosas (${n(c('dudosa'))})</a>` : ''}
  </div>
</div>
<div class="filtros">${FILTROS.map(([k, l]) => `<a href="/fotos-ia${k ? `?ver=${k}` : ''}" class="${ver === k ? 'on' : ''}">${l}${k && c(k) ? ` (${n(c(k))})` : ''}</a>`).join('')}</div>
${rows.map((r) => row(r, ver)).join('') || '<p class="sub" style="margin-top:18px">No hay fotos aquí todavía.</p>'}`;
  return shell('Fotos con IA', 'fotosia', body, { refresh: state.running || state.counting });
}

const csvCell = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
/** Listado para buscar a mano: marca, producto, EAN, motivo, foto que encontré y enlace al admin. */
export function doubtfulCsv(rows) {
  const head = ['Marca', 'Producto', 'EAN', 'Por qué es dudosa', 'Foto que encontré', 'Página de esa foto', 'Abrir en Shopify'];
  const lines = rows.map((r) => [r.vendor, r.title, r.ean, r.doubt, r.source_url, r.source_page, `https://admin.shopify.com/store/ikwg4h-mk/products/${r.product_id.split('/').pop()}`].map(csvCell).join(';'));
  return '﻿' + [head.map(csvCell).join(';'), ...lines].join('\n');
}
