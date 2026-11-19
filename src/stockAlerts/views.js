// Página «Avisos de stock» del panel: informe de lo que esperan las clientas.
import { shell, esc, fmtDate, icon } from '../views.js';

const eur = (x) => `${Number(x || 0).toFixed(2).replace('.', ',')} €`;
const eur0 = (x) => `${Math.round(Number(x || 0)).toLocaleString('es-ES')} €`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

// Situación según BTS: [texto corto, clase de chip]
const REASON = {
  agotado: ['BTS sin stock', 'error'],
  pocas: ['BTS tiene menos de 3', 'running'],
  pierde: ['Pierdes dinero a PVP', 'baja'],
  'sin-bts': ['BTS ya no lo vende', 'prueba'],
  vuelve: ['Vuelve pronto', 'ok'],
  'sin-dato': ['Sin datos de BTS', 'prueba'],
  'sin-ean': ['Sin EAN', 'prueba'],
};
const reasonChip = (r) => {
  const [t, c] = REASON[r.code] || [r.text, 'prueba'];
  return `<span class="chip ${c}" title="${esc(r.text)}">${esc(t)}</span>`;
};

function bars(rows, { label = (r) => r.name, value = (r) => r.n, sub = () => '' } = {}) {
  const max = Math.max(1, ...rows.map(value));
  return rows
    .map(
      (r) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center">
  <div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label(r))}</div><div class="muted" style="font-size:12px">${sub(r)}</div></div>
  <b style="font-variant-numeric:tabular-nums">${value(r)}</b>
  <div style="grid-column:1/-1;height:6px;border-radius:99px;background:var(--petalo-2)"><div style="height:100%;width:${Math.max(4, (value(r) / max) * 100)}%;border-radius:99px;background:var(--rosa)"></div></div>
</div>`,
    )
    .join('');
}

function weekChart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.n));
  const fmt = (s) => {
    const d = new Date(s + 'T12:00:00Z');
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };
  return `<div style="display:grid;grid-template-columns:repeat(${weeks.length},1fr);gap:8px;align-items:end;height:150px">
${weeks
  .map(
    (w, i) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">
  <span style="font-size:12px;font-weight:600;font-variant-numeric:tabular-nums">${w.n || ''}</span>
  <div style="width:100%;max-width:38px;height:${w.n ? Math.max(6, (w.n / max) * 100) : 2}px;border-radius:8px 8px 3px 3px;background:${i === weeks.length - 1 ? 'var(--frambuesa)' : 'var(--petalo)'}"></div>
  <span class="muted" style="font-size:11px">${fmt(w.week)}</span>
</div>`,
  )
  .join('')}
</div>`;
}

/** Frases de «qué hacer» a partir de los datos. */
export function insights({ variants, vendors, reasons, out }) {
  const tips = [];
  const top = variants[0];
  if (top) tips.push(`Lo más esperado es <b>${esc(top.product_title)}${top.variant_title ? ' ' + esc(top.variant_title) : ''}</b>: ${plural(top.n, 'clienta', 'clientas')} desde hace ${plural(top.days, 'día', 'días')}.`);
  const sum = (code) => variants.filter((v) => v.reason.code === code);
  const pierde = sum('pierde');
  if (pierde.length)
    tips.push(`${plural(pierde.length, 'tamaño pedido está agotado', 'tamaños pedidos están agotados')} porque <b>a PVP perderías dinero</b> (${plural(reasons.pierde, 'clienta espera', 'clientas esperan')}). Si quieres venderlos igual, ponles la etiqueta <code>precio-manual</code> y un precio a mano.`);
  const pocas = sum('pocas');
  if (pocas.length) tips.push(`${plural(pocas.length, 'tamaño tiene', 'tamaños tienen')} 1 o 2 unidades en BTS. Se quedan en 0 por la regla de «menos de 3»: es la decisión correcta para no vender lo que BTS quizá no tenga.`);
  const fuera = sum('sin-bts');
  if (fuera.length) tips.push(`${plural(fuera.length, 'producto pedido ya no lo vende', 'productos pedidos ya no los vende')} BTS. Busca una alternativa parecida o retíralos para no generar más esperas.`);
  const vuelve = sum('vuelve');
  if (vuelve.length) tips.push(`${plural(vuelve.length, 'tamaño ya tiene', 'tamaños ya tienen')} stock en BTS: las clientas recibirán el aviso en la próxima sincronización.`);
  const hot = variants.filter((v) => v.n7 >= 3);
  if (hot.length) tips.push(`Subiendo esta semana: ${hot.slice(0, 3).map((v) => `<b>${esc(v.product_title)}</b> (+${v.n7})`).join(', ')}.`);
  if (vendors[0] && vendors[0].name !== 'Sin dato') tips.push(`La marca más esperada es <b>${esc(vendors[0].name)}</b>: buena candidata para destacar cuando vuelva.`);
  if (out.enviados >= 5) tips.push(`De cada 10 avisos enviados, ${Math.round((out.compraron / out.enviados) * 10)} acaban en compra en 14 días.`);
  return tips;
}

export function avisosPage(d) {
  const { variants, vendors, categories, weeks, out, stats, reasons, potential, btsError, purchases, sent, lastRun, mailOk, dryRun, flash } = d;
  const empty = (n, t) => `<tr><td colspan="${n}"><div class="empty"><img src="/static/mariposa.svg" alt="">${t}</div></td></tr>`;
  const conv = out.enviados ? Math.round((out.compraron / out.enviados) * 100) : 0;

  const rows = variants
    .map(
      (v) => `<tr>
  <td><div class="prod">${esc(v.product_title || v.variant_id)}</div><div class="sub">${esc([v.variant_title, v.ean].filter(Boolean).join(' · '))}</div></td>
  <td>${esc(v.vendor || '')}<div class="sub">${esc(v.category || '')}</div></td>
  <td class="num"><b>${v.n}</b>${v.n7 ? `<div class="sub">+${v.n7} esta semana</div>` : ''}</td>
  <td class="num nw">${plural(v.days, 'día', 'días')}</td>
  <td class="num nw">${v.price != null ? eur(v.price) : ''}</td>
  <td>${reasonChip(v.reason)}${v.error ? `<div class="sub">${esc(v.error)}</div>` : ''}</td>
</tr>`,
    )
    .join('');
  const sentRows = sent
    .map(
      (s) => `<tr><td><div class="prod">${esc(s.product_title || '')}</div><div class="sub">${esc(s.variant_title || '')}</div></td><td class="nw">${fmtDate(s.created_at)}</td><td class="nw">${fmtDate(s.sent_at)}</td>
  <td>${s.purchased_at ? `<span class="chip ok">Compró ${eur(s.purchase_amount)}</span>` : '<span class="chip prueba">Aún no</span>'}</td></tr>`,
    )
    .join('');
  const reasonList = Object.entries(REASON)
    .filter(([k]) => reasons[k])
    .map(([k, [t, c]]) => `<span class="chip ${c}">${esc(t)} · ${reasons[k]}</span>`)
    .join(' ');
  const tips = insights(d);

  const status = !mailOk
    ? `<div class="alert">${icon('alert')}<div><b>Falta el correo.</b> Las solicitudes se guardan, pero no se envía nada hasta poner SMTP_HOST, SMTP_USER y SMTP_PASS (contraseña de aplicación de Google) en Railway.</div></div>`
    : dryRun
      ? `<div class="alert">${icon('alert')}<div><b>Modo prueba (DRY_RUN=true):</b> se guardan las solicitudes pero no se envían avisos.</div></div>`
      : '';
  const card = (title, body) => `<div class="card" style="display:grid;gap:14px;align-content:start"><h3 style="margin:0">${title}</h3>${body}</div>`;

  const body = `<div class="eyebrow">Clientas</div><h1>Avisos de stock</h1>
<p class="muted" style="margin:10px 0 22px;max-width:680px">Lo que tus clientas esperan que vuelva. Cuando un tamaño agotado vuelve a tener stock, cada clienta que pulsó «Avísame» recibe un único correo «¡Ha vuelto!» desde avisos@ninabeauty.es y su dirección se borra.</p>
${status}
${flash ? `<div class="card" style="background:${flash.ok ? 'var(--verde-bg);color:var(--verde)' : 'var(--rojo-bg);color:var(--rojo)'};margin-bottom:14px">${esc(flash.text)}</div>` : ''}
<div class="kpis">
 <div class="kpi"><div class="top"><span>Clientas esperando</span>${icon('clock', 34)}</div><b>${stats.pendientes}</b><span class="muted">${plural(variants.length, 'tamaño', 'tamaños distintos')}</span></div>
 <div class="kpi"><div class="top"><span>Ventas que esperan</span>${icon('euro', 34)}</div><b>${eur0(potential)}</b><span class="muted">si todo volviera y cada una comprara uno</span></div>
 <div class="kpi destacado"><div class="top"><span>Avisos enviados</span>${icon('bell', 34)}</div><b>${out.enviados}</b><span>${out.enviados ? `${out.compraron} compraron (${conv} %) · ${eur(out.ventas)}` : 'todavía ninguno'}</span></div>
 <div class="kpi"><div class="top"><span>Espera media</span>${icon('sync', 34)}</div><b>${out.enviados ? Math.round(out.espera_media) : '—'}</b><span class="muted">días desde que lo pide hasta que vuelve</span></div>
</div>
${tips.length ? `<div class="card" style="margin-top:18px;background:var(--petalo-2);border-color:var(--petalo)"><h3 style="margin:0 0 10px">Qué te dicen los avisos</h3><ul style="margin:0;padding-left:20px;display:grid;gap:8px">${tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>` : ''}
<div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 6px">
 <form method="post" action="/avisos/revisar"><button class="btn ghost" type="submit">${icon('sync', 18)} Revisar ahora</button></form>
 <a class="btn ghost" href="/avisos.csv">${icon('download', 18)} Descargar CSV</a>
 <a class="btn ghost" href="/avisos/ejemplo" target="_blank" rel="noopener">${icon('bell', 18)} Ver el correo</a>
 <form method="post" action="/avisos/prueba"><button class="btn ghost" type="submit"${mailOk ? '' : ' disabled'}>${icon('bell', 18)} Enviarme una prueba</button></form>
</div>

<h2>Lo que más esperan</h2>
${reasonList ? `<p style="margin:-4px 0 12px;display:flex;gap:6px;flex-wrap:wrap">${reasonList}</p>` : ''}
${btsError ? `<p class="muted">No se pudo consultar BTS ahora: ${esc(btsError)}</p>` : ''}
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Producto</th><th>Marca</th><th>Clientas</th><th>Esperando</th><th>Precio</th><th>Por qué está agotado</th></tr></thead><tbody>${rows || empty(6, 'Nadie está esperando ningún producto todavía.')}</tbody></table></div></div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:22px">
 ${card('Marcas más esperadas', vendors.length ? bars(vendors, { sub: (r) => `${plural(r.sizes, 'tamaño', 'tamaños')} · ${eur0(r.value)}` }) : '<p class="muted" style="margin:0">Sin datos todavía.</p>')}
 ${card('Por categoría', categories.length ? bars(categories, { sub: (r) => plural(r.sizes, 'tamaño', 'tamaños') }) : '<p class="muted" style="margin:0">Sin datos todavía.</p>')}
 ${card('Peticiones nuevas por semana', weekChart(weeks))}
</div>

<h2>Últimos avisos enviados</h2>
${purchases?.note ? `<p class="muted" style="margin-top:-6px">${esc(purchases.note)}</p>` : '<p class="muted" style="margin-top:-6px">«Compró» cuenta los pedidos de ese mismo tamaño en los 14 días siguientes al aviso.</p>'}
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Producto</th><th>Lo pidió</th><th>Avisada</th><th>Resultado</th></tr></thead><tbody>${sentRows || empty(4, 'Todavía no se ha enviado ninguno.')}</tbody></table></div></div>
<p class="muted">Última revisión: ${lastRun.at ? fmtDate(lastRun.at) : '—'} · ${esc(lastRun.note)}</p>

<h2>Borrar el correo de una clienta</h2>
<form class="card" method="post" action="/avisos/borrar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
 <input name="email" type="email" required placeholder="correo@ejemplo.com" style="flex:1;min-width:220px;padding:11px 14px;border:1px solid var(--linea);border-radius:12px;font:inherit">
 <button class="btn ghost" type="submit">Borrar sus avisos</button>
 <p class="muted" style="margin:0;flex-basis:100%">Si una clienta pide que borres sus datos, ponlo aquí y se eliminan todos sus avisos pendientes.</p>
</form>`;
  return shell('Avisos de stock', 'avisos', body);
}
