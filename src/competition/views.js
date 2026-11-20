// Página «Competencia» del panel: tus precios frente a Google Shopping España.
import { shell, esc, fmtDate, icon } from '../views.js';
import { comp } from './engine.js';

const eur = (x) => (x === null || x === undefined ? '—' : `${Number(x).toFixed(2).replace('.', ',')} €`);
const pct = (x) => `${x > 0 ? '+' : ''}${String(Math.round(x * 10) / 10).replace('.', ',')} %`;
const plural = (n, a, b) => `${n.toLocaleString('es-ES')} ${n === 1 ? a : b}`;
const short = (d) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(d));

export const POS = {
  mejor: ['Mejor precio', 'ok', 'Eres la tienda más barata o empatas'],
  'en-linea': ['En línea', 'prueba', `Hasta un ${comp.closePct()} % más cara`],
  caro: ['Por encima', 'running', `Entre un ${comp.closePct()} y un ${comp.highPct()} % más cara`],
  'muy-caro': ['Muy por encima', 'error', `Más de un ${comp.highPct()} % más cara`],
  'sin-datos': ['Sin datos', 'prueba', 'Google Shopping no muestra otras tiendas'],
};
const chip = (pos) => `<span class="chip ${POS[pos][1]}" title="${esc(POS[pos][2])}">${POS[pos][0]}</span>`;

const FILTERS = [
  ['', 'Lo importante'],
  ['muy-caro', 'Muy por encima'],
  ['caro', 'Por encima'],
  ['en-linea', 'En línea'],
  ['mejor', 'Mejor posicionados'],
  ['sin-datos', 'Sin datos'],
  ['ajustados', 'Ajustados'],
  ['todos', 'Todos'],
];

function filterRows(rows, ver) {
  if (ver === 'todos') return rows;
  if (ver === 'ajustados') return rows.filter((x) => x.override_price);
  if (ver) return rows.filter((x) => x.pos === ver);
  return rows.filter((x) => x.pos === 'muy-caro' || x.pos === 'mejor');
}
const order = { 'muy-caro': 0, caro: 1, 'en-linea': 2, mejor: 3, 'sin-datos': 4 };
const sortRows = (rows) => [...rows].sort((a, b) => order[a.pos] - order[b.pos] || (a.pos === 'mejor' ? a.diffPct - b.diffPct : (b.diffPct ?? 0) - (a.diffPct ?? 0)));

function setup() {
  return `<div class="card" style="margin-top:22px">
  <h3>Falta conectar Google Shopping</h3>
  <p>La pestaña busca cada producto por su código EAN en Google Shopping España con <b>SerpApi</b> (plan gratis: 250 búsquedas al mes, 0 €).</p>
  <p class="muted">Pon la clave de SerpApi en Railway como <code>SERPAPI_KEY</code> y pulsa <b>Deploy</b>.</p>
</div>`;
}

function row(x) {
  const s = x.suggestion;
  const can = s?.newPrice;
  const sug = !x.comp_min
    ? '<span class="muted">—</span>'
    : can
      ? `<b>${eur(s.newPrice)}</b><div class="sub">ganas ${eur(s.profitNew)}${s.limited ? ' · tope por margen mínimo' : ''}</div>`
      : x.pos === 'mejor' || x.pos === 'en-linea'
        ? '<span class="muted">No hace falta</span>'
        : x.cost
          ? `<span class="muted">No se puede: bajaría del margen mínimo (${eur(s?.floor)})</span>`
          : '<span class="muted">Sin coste de BTS</span>';
  const comp = x.comp_min
    ? `<b>${eur(x.comp_min)}</b><div class="sub">${x.cheapest_url ? `<a href="${esc(x.cheapest_url)}" target="_blank" rel="noopener">${esc(x.cheapest_shop)}</a>` : esc(x.cheapest_shop || '')} · ${plural(x.shops, 'tienda', 'tiendas')}${x.shops > 1 ? ` · mediana ${eur(x.comp_median)}` : ''}</div>`
    : '<span class="muted">Nadie más lo vende en Google Shopping</span>';
  const ov = x.override_price
    ? `<div class="sub">Ajustado hasta el ${short(x.override_until)} · <button class="linkbtn" form="quitar" name="ean" value="${esc(x.ean)}">quitar ajuste</button></div>`
    : '';
  return `<tr class="${x.pos === 'muy-caro' ? 'destaca' : ''}">
  <td class="nw">${can ? `<input type="checkbox" name="ean" value="${esc(x.ean)}" ${x.pos === 'muy-caro' ? 'checked' : ''} aria-label="Ajustar">` : ''}</td>
  <td class="sub"><div class="prod">${esc(x.product_title)}</div><div class="sub">${esc(x.variant_title || '')} · EAN ${esc(x.ean)} · visto ${short(x.checked_at)}</div>${ov}</td>
  <td class="num"><b>${eur(x.our_price)}</b>${x.cost ? `<div class="sub">ganas ${eur(x.profitNow)}</div>` : ''}</td>
  <td class="num">${comp}</td>
  <td class="nw">${chip(x.pos)}${x.diffPct !== null ? `<div class="sub">${pct(x.diffPct)}</div>` : ''}</td>
  <td class="num">${sug}</td>
</tr>`;
}

export function competitionPage({ rows, ver, budget, state, notice, hasKey }) {
  const count = (p) => rows.filter((x) => x.pos === p).length;
  const adjustable = rows.filter((x) => x.suggestion?.newPrice);
  const shown = sortRows(filterRows(rows, ver));
  const kpi = (label, n, ic, cls = '') => `<div class="kpi ${cls}"><div class="top">${label}${icon(ic)}</div><b>${n.toLocaleString('es-ES')}</b></div>`;
  const last = state.last;
  const running = state.running
    ? `<div class="progreso"><div class="ptop"><b>${esc(state.label)}</b><span>${state.done} de ${state.total}</span></div><div class="pbar"><div style="width:${state.total ? Math.round((state.done / state.total) * 100) : 3}%"></div></div><span class="muted">La página se actualiza sola.</span></div>`
    : '';
  const body = `
<style>.linkbtn{background:none;border:0;padding:0;color:var(--frambuesa);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline}
.bar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin:0 0 14px}
td .prod{min-width:150px}
code{background:var(--petalo-2);padding:2px 6px;border-radius:6px;font-size:13px}</style>
<section class="hero">
  <img class="mariposa" src="/static/mariposa.svg" alt="">
  <div>
    <div class="eyebrow">Precios</div>
    <h1>Tú frente a <em>la competencia</em></h1>
    <p>Cada producto se busca por su EAN en Google Shopping España y se compara con la tienda más barata. Los ajustes nunca bajan de una ganancia de ${eur(comp.minProfit())} ni del ${comp.minMarginPct()} % del precio.</p>
    <div class="meta">
      <span>${icon('search', 18)} ${budget.used} de ${comp.monthlySearches()} búsquedas usadas este mes</span>
      ${budget.serp?.left != null ? `<span>${icon('clock', 18)} SerpApi: quedan ${budget.serp.left}</span>` : ''}
      ${last ? `<span>${icon('sync', 18)} Última búsqueda: ${fmtDate(last.finishedAt)} · ${last.checked} productos${last.error ? ' · ' + esc(last.error) : ''}</span>` : ''}
    </div>
  </div>
  ${hasKey ? `<form method="post" action="/competencia/buscar"><button class="btn" ${state.running || budget.left <= 0 ? 'disabled' : ''}>${icon('search')} Buscar ${Math.min(25, budget.left)} productos ahora</button></form>` : ''}
</section>
${running}
${notice ? `<div class="card" style="margin-top:18px">${notice}</div>` : ''}
${hasKey ? '' : setup()}
<div class="kpis">
  ${kpi('Comparados', rows.filter((x) => x.comp_min).length, 'layers')}
  ${kpi('Mejor posicionados', count('mejor'), 'heart')}
  ${kpi('En línea', count('en-linea'), 'tag')}
  ${kpi('Por encima', count('caro'), 'alert')}
  ${kpi('Muy por encima', count('muy-caro'), 'alert', 'destacado')}
  ${kpi('Se pueden ajustar', adjustable.length, 'down')}
</div>
<nav class="pills">${FILTERS.map(([k, t]) => `<a href="/competencia${k ? '?ver=' + k : ''}" class="${(ver || '') === k ? 'on' : ''}">${t}</a>`).join('')}<span class="sep"></span><a href="/competencia.csv">${icon('download', 16)} CSV</a></nav>
<form id="quitar" method="post" action="/competencia/quitar"></form>
<form method="post" action="/competencia/revisar">
<div class="bar"><span class="muted">${plural(shown.length, 'producto', 'productos')}${shown.length > 500 ? ' (se muestran 500)' : ''}. Marca los que quieras ajustar.</span>
${adjustable.length ? `<button class="btn ghost">${icon('down', 16)} Revisar ajuste de los marcados</button>` : ''}</div>
<div class="tablecard"><div class="tablewrap"><table>
<thead><tr><th></th><th>Producto</th><th>Tu precio</th><th>Más barato fuera</th><th>Posición</th><th>Precio sugerido</th></tr></thead>
<tbody>${shown.length ? shown.slice(0, 500).map(row).join('') : `<tr><td colspan="6"><div class="empty"><img src="/static/mariposa.svg" alt="">${rows.length ? 'Nada en esta vista.' : 'Aún no se ha comparado ningún producto.'}</div></td></tr>`}</tbody>
</table></div></div>
</form>
<p class="muted" style="margin-top:14px">Un precio ajustado dura ${comp.overrideDays()} días; después vuelve a la fórmula. Si BTS sube el coste, la sincronización lo sube lo justo para no bajar del margen mínimo. Los productos con la etiqueta <code>precio-manual</code> no se tocan.</p>`;
  return shell('Competencia', 'competencia', body, { refresh: state.running });
}

/** Paso de confirmación antes de cambiar precios en la tienda. */
export function reviewPage(items, { dryRun }) {
  const lose = items.reduce((a, x) => a + (x.suggestion.profitNow - x.suggestion.profitNew), 0);
  const body = `
<a class="back" href="/competencia">${icon('back', 16)} Volver</a>
<div class="eyebrow">Confirmar</div>
<h1>Ajustar ${plural(items.length, 'precio', 'precios')}</h1>
<p>Estos precios bajan en tu tienda en cuanto pulses el botón. Ganarías de media ${eur(items.length ? lose / items.length : 0)} menos por venta en estos productos, a cambio de quedar más cerca de la tienda más barata.${dryRun ? ' <b>Modo prueba activo: no se cambiará nada en Shopify.</b>' : ''}</p>
<form method="post" action="/competencia/aplicar">
<div class="tablecard" style="margin-top:18px"><div class="tablewrap"><table>
<thead><tr><th>Producto</th><th>Ahora</th><th>Nuevo precio</th><th>Más barato fuera</th><th>Ganancia</th></tr></thead>
<tbody>${items
    .map(
      (x) => `<tr><td class="sub"><input type="hidden" name="ean" value="${esc(x.ean)}"><div class="prod">${esc(x.product_title)}</div><div class="sub">${esc(x.variant_title || '')}</div></td>
<td class="num">${eur(x.our_price)}</td><td class="num"><b>${eur(x.suggestion.newPrice)}</b>${x.suggestion.limited ? '<div class="sub">tope por margen mínimo</div>' : ''}</td>
<td class="num">${eur(x.comp_min)}<div class="sub">${esc(x.cheapest_shop || '')}</div></td>
<td class="num">${eur(x.suggestion.profitNow)} → <b>${eur(x.suggestion.profitNew)}</b></td></tr>`,
    )
    .join('')}</tbody></table></div></div>
<p style="margin-top:20px"><button class="btn">${icon('down')} Sí, aplicar ${plural(items.length, 'precio', 'precios')}</button> <a class="btn ghost" href="/competencia">Cancelar</a></p>
</form>`;
  return shell('Confirmar ajuste', 'competencia', body);
}

export function competitionCsv(rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const n = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const head = ['Producto', 'Tamaño', 'EAN', 'Tu precio', 'Más barato fuera', 'Tienda', 'Tiendas', 'Mediana', 'Diferencia %', 'Posición', 'Precio sugerido', 'Ganancia ahora', 'Ganancia sugerida', 'Comprobado'];
  const lines = rows.map((x) =>
    [x.product_title, x.variant_title, x.ean, n(x.our_price), n(x.comp_min), x.cheapest_shop, x.shops, n(x.comp_median), n(x.diffPct), POS[x.pos][0], n(x.suggestion?.newPrice), n(x.suggestion?.profitNow), n(x.suggestion?.profitNew), new Date(x.checked_at).toISOString().slice(0, 10)].map(q).join(';'),
  );
  return '﻿' + [head.map(q).join(';'), ...lines].join('\n');
}
