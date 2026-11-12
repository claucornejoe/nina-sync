// Página «Google y descripciones» del panel, con el mismo diseño de Nina Sync.
import { shell, esc, fmtDate, icon } from '../views.js';

const ORIGIN = { webhook: 'Producto nuevo', repaso: 'Repaso automático', manual: 'Manual' };

const kpi = (ic, label, value, cls = '') =>
  `<div class="kpi ${cls}"><div class="top">${esc(label)} ${icon(ic, 34)}</div><b>${value ?? '—'}</b></div>`;

function check(ok, label, detail) {
  return `<li style="display:flex;gap:10px;align-items:flex-start;padding:8px 0"><span class="chip ${ok ? 'ok' : 'error'}">${ok ? 'Listo' : 'Falta'}</span><div><b>${esc(label)}</b>${detail ? `<div class="muted">${detail}</div>` : ''}</div></li>`;
}

function previewBox(p) {
  if (!p) return '';
  if (p.error && !p.title) return `<div class="alert">${icon('alert')}<div>${esc(p.error)}</div></div>`;
  return `<div class="card" style="margin-top:18px">
 <div class="eyebrow">${p.saved ? 'Guardado en Shopify' : 'Vista previa · no se ha guardado'}</div>
 <h3>${esc(p.title)}</h3>
 ${p.error ? `<div class="alert">${icon('alert')}<div>${esc(p.error)}</div></div>` : ''}
 ${p.category ? `<p><b>Categoría:</b> ${esc(p.category)}</p>` : ''}
 ${p.note ? `<p class="muted">${esc(p.note)}</p>` : ''}
 ${p.descriptionHtml ? `<div style="border:1px dashed var(--petalo);border-radius:14px;padding:6px 18px;margin-top:10px">${p.descriptionHtml}</div>` : ''}
</div>`;
}

function icecatSection(ic) {
  if (!ic) return '';
  const s = ic.summary || {};
  const st = ic.status;
  const busy = st && !st.finished;
  const progress = st ? `${st.adding ? 'Añadiendo' : 'Comprobando'}: ${st.done} de ${st.total || '…'}${st.finished ? ' · terminado' : ''}` : '';
  const thumbs = (ic.samples || [])
    .map((r) => `<div class="card" style="padding:12px"><div class="prod" style="font-size:13px">${esc(r.product_title)}</div><div class="muted">${r.pics} fotos</div>
<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${(r.urls || []).slice(0, 4).map((u) => `<img src="${esc(u.url)}" alt="" loading="lazy" style="width:64px;height:64px;object-fit:contain;background:#fff;border:1px solid var(--linea);border-radius:8px">`).join('')}</div></div>`)
    .join('');
  return `<h2 id="fotos">Fotos extra (Icecat)</h2>
<div class="card">
 <p style="margin-top:0">Icecat es el catálogo donde las marcas dejan sus fotos oficiales para las tiendas. Primero se <b>comprueba</b> cuántas fotos hay por producto (no cambia nada). Después, si te convence, se <b>añaden</b> hasta 3 fotos más por producto, sin repetirlas por tamaño. Si un producto tiene el logo provisional, la foto oficial lo sustituye.</p>
 ${s.checked ? `<p><b>${s.any}</b> de ${s.checked} productos tienen fotos en Icecat · <b>${s.two}</b> con 2 o más · <b>${s.four}</b> con 4 o más · ya añadidas en <b>${s.added}</b>.${s.errors ? ` <span class="chip error">${s.errors} ${s.errors === 1 ? "error" : "errores"}</span> <span class="muted">${esc(s.last_error || '')}</span>` : ''}</p>` : ''}
 ${progress ? `<p class="muted">${esc(progress)}</p>` : ''}
 <div style="display:flex;gap:12px;flex-wrap:wrap">
  <form method="post" action="/seo/icecat/comprobar"><button class="btn ghost" ${busy ? 'disabled' : ''}>Comprobar fotos en Icecat</button></form>
  ${s.any ? `<form method="post" action="/seo/icecat/anadir" onsubmit="return confirm('¿Añadir las fotos de Icecat a ${s.any - s.added} productos?')"><button class="btn" ${busy ? 'disabled' : ''}>Añadir fotos a ${s.any - s.added} productos</button></form>` : ''}
 </div>
</div>
${thumbs ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:12px">${thumbs}</div>` : ''}`;
}

export function seoPage({ rows, totals, aiToday, queue, sweeping, state, settings, preview, icecat }) {
  const busy = sweeping || queue.pending > 0 || queue.active > 0;
  const table = rows
    .map(
      (r) => `<tr class="${r.error ? '' : r.description ? 'destaca' : ''}"><td class="nw">${fmtDate(r.at)}</td>
<td><div class="prod"><a href="https://admin.shopify.com/store/ikwg4h-mk/products/${esc(String(r.product_id).split('/').pop())}" target="_blank" rel="noopener">${esc(r.product_title || r.product_id)}</a></div></td>
<td class="sub">${esc(r.category || '')}</td>
<td class="nw">${r.description ? '<span class="chip ok">Escrita</span>' : ''}</td>
<td class="nw">${esc(ORIGIN[r.origin] || r.origin || '')}</td>
<td class="sub">${r.error ? `<span class="chip error">Error</span> ${esc(r.error)}` : esc(r.note || '')}</td></tr>`,
    )
    .join('');

  const sweepText = state.lastSweep
    ? state.lastSweep.error
      ? `El último repaso falló: ${esc(state.lastSweep.error)}`
      : `Último repaso ${fmtDate(state.lastSweep.at)}: ${state.lastSweep.missing} de ${state.lastSweep.total} productos tenían algo pendiente.`
    : 'El repaso automático corre cada hora.';

  const body = `
<section class="hero">
 <img class="mariposa" src="/static/mariposa.svg" alt="">
 <div>
  <div class="eyebrow">Google y descripciones</div>
  <h1>Fichas listas para <em>Google</em></h1>
  <p>Cada producto nuevo recibe solo su categoría de Google y una descripción breve escrita con IA, sin precios ni envíos, como pide Google. Las etiquetas y las colecciones no se tocan.</p>
  <div class="meta"><span>${icon('clock', 18)} ${sweepText}</span><span>${icon('layers', 18)} En cola: ${queue.pending + queue.active}</span></div>
 </div>
 <form method="post" action="/seo/repasar"><button class="btn" ${busy ? 'disabled' : ''}>${icon('sync', 18).replace('class="ic"', busy ? 'class="ic spin"' : 'class="ic"')} ${busy ? 'Trabajando…' : 'Repasar todos ahora'}</button></form>
</section>

${settings.aiPaused ? `<div class="alert">${icon('alert')}<div><b>Las descripciones están en pausa una hora:</b> ${esc(settings.aiPaused)}.</div></div>` : ''}
<div class="kpis">
 ${kpi('layers', 'Categorías puestas', totals.categories)}
 ${kpi('spark', 'Descripciones escritas', totals.descriptions, 'destacado')}
 ${kpi('sync', 'Consultas a la IA (24 h)', `${aiToday}<small style="font-size:14px;color:inherit"> / ${settings.maxPerDay}</small>`)}
 ${kpi('alert', 'Errores (24 h)', totals.errors24)}
</div>

<h2>Probar con un producto</h2>
<form class="card" method="post" action="/seo/producto" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
 <input name="producto" placeholder="Enlace del producto en el admin de Shopify o su número" style="flex:1;min-width:240px;padding:12px 14px;border:1px solid var(--linea);border-radius:12px;font:inherit">
 <button class="btn ghost" name="accion" value="ver">Ver sin guardar</button>
 <button class="btn" name="accion" value="guardar">Rehacer y guardar</button>
</form>
${previewBox(preview)}

<h2>Puesta en marcha</h2>
<ul class="card" style="list-style:none;margin:0">
 ${check(settings.hasKey, 'Clave de OpenAI', settings.hasKey ? `Modelo ${esc(settings.model)}${settings.webSearch ? ', con búsqueda en internet si no conoce las notas' : ''}.` : 'Añade OPENAI_API_KEY en Railway &gt; Variables. Sin ella se ponen las categorías, pero no las descripciones.')}
 ${check(String(state.webhook).startsWith('activo'), 'Aviso de productos nuevos', settings.auto ? esc(state.webhook) : 'Desactivado con SEO_AUTO=false.')}
</ul>

${icecatSection(icecat)}

<h2>Últimos productos</h2>
<div class="tablecard"><div class="tablewrap"><table>
<thead><tr><th>Fecha</th><th>Producto</th><th>Categoría</th><th>Descripción</th><th>Origen</th><th>Detalle</th></tr></thead>
<tbody>${table || `<tr><td colspan="6"><div class="empty"><img src="/static/mariposa.svg" alt="">Todavía no se ha procesado ningún producto.</div></td></tr>`}</tbody>
</table></div></div>`;
  return shell('Google y descripciones', 'seo', body, { refresh: busy || (icecat?.status && !icecat.status.finished) });
}
