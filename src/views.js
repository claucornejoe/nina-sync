// HTML del panel e informes. Colores y tipografías del manual de marca de Nina Beauty.
const TZ = process.env.DISPLAY_TZ || 'America/Santiago';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fmtDate(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
}

function duration(run) {
  if (!run.finished_at) return 'en curso';
  const s = Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

const KIND = {
  stock: 'Stock',
  precio: 'Precio',
  sin_bts: 'Ya no está en BTS',
  pierde: 'Retirado: pierde dinero',
  oferta_fin: 'Fin de oferta',
  etiquetas: 'Categoría',
  nuevo: 'Recién llegado',
  nuevo_error: 'Novedad no creada',
  nuevo_fin: 'Fin de «Recién llegados»',
};
const TRIGGER = { cron: 'Automática', manual: 'Manual' };

export function layout(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Nina Sync</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--rosa:#F72E75;--frambuesa:#C92F60;--petalo:#FFCCD5;--grafito:#2B2B2B;--gris:#6E6E6E;--borde:#eee;--fondo:#fff;--suave:#faf7f8}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,system-ui,sans-serif;color:var(--grafito);background:var(--suave);font-size:15px}
header{background:#fff;border-bottom:3px solid var(--rosa);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
header a{color:inherit;text-decoration:none}
.logo{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600}.logo span{color:var(--rosa)}
main{max-width:1100px;margin:0 auto;padding:20px 16px}
h1,h2{font-family:'Cormorant Garamond',serif;font-weight:600}h1{font-size:30px;margin:0 0 12px}h2{font-size:24px;margin:28px 0 10px}
.card{background:#fff;border:1px solid var(--borde);border-radius:12px;padding:16px;margin-bottom:16px}
.btn{display:inline-block;background:var(--frambuesa);color:#fff;border:0;border-radius:999px;padding:11px 22px;font:600 15px Montserrat,sans-serif;cursor:pointer;text-decoration:none}
.btn.sec{background:#fff;color:var(--frambuesa);border:1px solid var(--frambuesa)}
.btn[disabled]{opacity:.5;cursor:default}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.kpi{background:#fff;border:1px solid var(--borde);border-radius:12px;padding:12px}.kpi b{display:block;font-size:24px}.kpi small{color:var(--gris)}
.tablewrap{overflow-x:auto}
a{color:var(--frambuesa)}table{width:100%;border-collapse:collapse;background:#fff}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--borde);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--gris)}
tr.oferta td{background:#fff0f4}
.tag{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.ok{background:#e7f6ec;color:#1d6b3a}.error{background:#fde8e8;color:#9b1c1c}.running{background:#fff4d6;color:#8a5a00}
.t-oferta{background:var(--rosa);color:#fff}.t-baja{background:var(--petalo);color:var(--frambuesa)}.t-prueba{background:#eee;color:#555}
.muted{color:var(--gris);font-size:13px}
input[type=password]{width:100%;padding:11px;border:1px solid #ccc;border-radius:8px;font:inherit;margin:8px 0 14px}
.filters a{margin-right:10px;color:var(--frambuesa)}
</style></head><body>
<header><a href="/" class="logo">Nina <span>Sync</span></a><nav><a class="btn sec" href="/ofertas">Ofertas activas</a> <a class="btn sec" href="/salir">Salir</a></nav></header>
<main>${body}</main></body></html>`;
}

export function loginPage(error) {
  return layout(
    'Entrar',
    `<div class="card" style="max-width:380px;margin:40px auto">
<h1>Entrar</h1>
${error ? `<p class="tag error">Contraseña incorrecta</p>` : ''}
<form method="post" action="/entrar"><label>Contraseña<input type="password" name="password" autofocus required></label>
<button class="btn" type="submit">Entrar</button></form></div>`,
  );
}

function statusTag(run) {
  const label = { ok: 'Correcta', error: 'Error', running: 'En curso' }[run.status] || run.status;
  return `<span class="tag ${esc(run.status)}">${label}</span>${run.dry_run ? ' <span class="tag t-prueba">Prueba</span>' : ''}`;
}

export function dashboard({ runs, running, nextRun, offers }) {
  const last = runs[0];
  const rows = runs
    .map((r) => {
      const s = r.summary || {};
      return `<tr><td><a href="/sync/${r.id}">#${r.id}</a></td><td>${fmtDate(r.started_at)}</td><td>${TRIGGER[r.trigger] || esc(r.trigger)}</td><td>${statusTag(r)}</td>
<td>${s.stockChanges ?? '—'}</td><td>${s.priceChanges ?? '—'}</td><td>${s.newOffers ?? '—'}</td><td>${s.newProducts ?? '—'}</td><td>${duration(r)}</td><td><a href="/sync/${r.id}">Ver informe</a></td></tr>`;
    })
    .join('');
  return layout(
    'Panel',
    `<h1>Sincronización con BTS</h1>
<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
<div><div>Última: <b>${last ? fmtDate(last.started_at) : 'nunca'}</b> ${last ? statusTag(last) : ''}</div>
<div class="muted">Próxima automática: ${nextRun ? fmtDate(nextRun) : '—'} · cada 4 horas · ${offers} ofertas activas</div></div>
<form method="post" action="/sync"><button class="btn" ${running ? 'disabled' : ''}>${running ? 'Sincronizando…' : 'Sincronizar ahora'}</button></form>
</div>
${running ? '<p class="muted">Hay una sincronización en curso. Recarga la página en un minuto.</p>' : ''}
<h2>Historial</h2>
<div class="tablewrap"><table><thead><tr><th>Nº</th><th>Fecha y hora</th><th>Tipo</th><th>Estado</th><th>Stock</th><th>Precios</th><th>Ofertas nuevas</th><th>Recién llegados</th><th>Duración</th><th></th></tr></thead>
<tbody>${rows || '<tr><td colspan="10">Todavía no hay sincronizaciones.</td></tr>'}</tbody></table></div>`,
  );
}

export function reportHtml({ run, changes }, { filter = '', standalone = false, baseUrl = '' } = {}) {
  const s = run.summary || {};
  const shown = filter ? changes.filter((c) => (filter === 'ofertas' ? c.on_sale || c.price_drop : c.kind === filter)) : changes;
  const rows = shown
    .map((c) => {
      const tags = [c.price_drop ? '<span class="tag t-baja">Baja de precio</span>' : '', c.on_sale ? '<span class="tag t-oferta">En oferta</span>' : '']
        .filter(Boolean)
        .join(' ');
      return `<tr class="${c.on_sale || c.price_drop ? 'oferta' : ''}"><td>${esc(c.product_title)}${c.variant_title && c.variant_title !== 'Default Title' ? ` <span class="muted">· ${esc(c.variant_title)}</span>` : ''}<div class="muted">${esc(c.ean || '')}</div></td>
<td>${KIND[c.kind] || esc(c.kind)}</td><td>${esc(c.old_value)}</td><td><b>${esc(c.new_value)}</b></td><td>${tags}</td><td class="muted">${esc(c.note || '')}</td></tr>`;
    })
    .join('');
  const link = (f, label) => `<a href="${baseUrl}/sync/${run.id}${f ? `?ver=${f}` : ''}">${label}</a>`;
  const body = `<h1>Informe de la sincronización #${run.id}</h1>
<p>${fmtDate(run.started_at)} · ${TRIGGER[run.trigger] || esc(run.trigger)} · ${statusTag(run)} · duración ${duration(run)}</p>
${run.error ? `<div class="card"><b>Error:</b> ${esc(run.error)}</div>` : ''}
<div class="grid">
<div class="kpi"><b>${s.stockChanges ?? 0}</b><small>cambios de stock</small></div>
<div class="kpi"><b>${s.priceChanges ?? 0}</b><small>cambios de precio</small></div>
<div class="kpi"><b>${s.priceDrops ?? 0}</b><small>bajadas de precio</small></div>
<div class="kpi"><b>${s.newOffers ?? 0}</b><small>a «Ofertas de la semana»</small></div>
<div class="kpi"><b>${s.missingInBts ?? 0}</b><small>ya no están en BTS</small></div>
<div class="kpi"><b>${s.losingMoney ?? 0}</b><small>retirados (pierden dinero)</small></div>
<div class="kpi"><b>${s.tagChanges ?? 0}</b><small>categorías corregidas</small></div>
<div class="kpi"><b>${s.newProducts ?? 0}</b><small>recién llegados creados</small></div>
</div>
${standalone ? '' : `<p class="filters">Ver: ${link('', 'todo')} ${link('ofertas', 'ofertas')} ${link('precio', 'precios')} ${link('stock', 'stock')} ${link('etiquetas', 'categorías')} ${link('nuevo', 'recién llegados')} · <a href="/sync/${run.id}.csv">Descargar CSV</a></p>`}
<h2>Cambios (${shown.length})</h2>
<div class="tablewrap"><table><thead><tr><th>Producto</th><th>Qué</th><th>Antes</th><th>Ahora</th><th>Oferta</th><th>Detalle</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">Sin cambios.</td></tr>'}</tbody></table></div>`;
  return layout(`Informe #${run.id}`, body);
}

export function offersPage(offers) {
  const rows = offers.map((o) => `<tr><td>${esc(o.product_title)}</td><td>${fmtDate(o.started_at)}</td><td>${fmtDate(o.until)}</td></tr>`).join('');
  return layout(
    'Ofertas activas',
    `<h1>Ofertas de la semana</h1><p class="muted">Productos que bajaron de precio en los últimos 7 días. Llevan la etiqueta «oferta-semana».</p>
<div class="tablewrap"><table><thead><tr><th>Producto</th><th>Desde</th><th>Hasta</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No hay ofertas activas.</td></tr>'}</tbody></table></div>`,
  );
}

export function changesCsv(changes) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Producto', 'Tamaño', 'EAN', 'Tipo', 'Antes', 'Ahora', 'Baja de precio', 'En oferta', 'Detalle'];
  const lines = changes.map((c) =>
    [c.product_title, c.variant_title, c.ean, KIND[c.kind] || c.kind, c.old_value, c.new_value, c.price_drop ? 'sí' : '', c.on_sale ? 'sí' : '', c.note].map(q).join(';'),
  );
  return '﻿' + [head.map(q).join(';'), ...lines].join('\n');
}
