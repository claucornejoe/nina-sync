// Página «Avisos de stock» del panel.
import { shell, esc, fmtDate, icon } from '../views.js';

export function avisosPage({ stats, pending, sent, lastRun, mailOk, dryRun, flash }) {
  const empty = (n, t) => `<tr><td colspan="${n}"><div class="empty"><img src="/static/mariposa.svg" alt="">${t}</div></td></tr>`;
  const pendRows = pending
    .map(
      (p) =>
        `<tr><td><div class="prod">${esc(p.product_title || p.variant_id)}</div><div class="sub">${esc(p.variant_title || '')}</div></td><td class="num"><b>${p.n}</b></td><td class="nw">${fmtDate(p.desde)}</td><td class="sub">${p.error ? esc(p.error) : ''}</td></tr>`,
    )
    .join('');
  const sentRows = sent
    .map((s) => `<tr><td><div class="prod">${esc(s.product_title || '')}</div><div class="sub">${esc(s.variant_title || '')}</div></td><td class="nw">${fmtDate(s.created_at)}</td><td class="nw">${fmtDate(s.sent_at)}</td></tr>`)
    .join('');
  const status = !mailOk
    ? `<div class="alert">${icon('alert')}<div><b>Falta el correo.</b> Las solicitudes se guardan, pero no se envía nada hasta poner SMTP_HOST, SMTP_USER y SMTP_PASS (contraseña de aplicación de Google) en Railway.</div></div>`
    : dryRun
      ? `<div class="alert">${icon('alert')}<div><b>Modo prueba (DRY_RUN=true):</b> se guardan las solicitudes pero no se envían avisos.</div></div>`
      : '';
  const body = `<div class="eyebrow">Clientas</div><h1>Avisos de stock</h1>
<p class="muted" style="margin:10px 0 22px;max-width:680px">Cuando un producto está agotado, la clienta deja su correo en «Avísame». Después de cada sincronización (cada 4 horas), si ese tamaño vuelve a tener stock, le llega un único correo «¡Ha vuelto!» y su dirección se borra. Las solicitudes sin reposición en 6 meses también se borran.</p>
${status}
${flash ? `<div class="card" style="background:${flash.ok ? 'var(--verde-bg);color:var(--verde)' : 'var(--rojo-bg);color:var(--rojo)'};margin-bottom:14px">${esc(flash.text)}</div>` : ''}
<div class="kpis">
 <div class="kpi"><div class="top"><span>Esperando stock</span>${icon('clock', 34)}</div><b>${stats.pendientes}</b><span class="muted">${pending.length === 1 ? "1 tamaño" : `${pending.length} tamaños distintos`}</span></div>
 <div class="kpi destacado"><div class="top"><span>Avisos enviados</span>${icon('bell', 34)}</div><b>${stats.enviados}</b><span>${stats.enviados30} en los últimos 30 días</span></div>
 <div class="kpi"><div class="top"><span>Última revisión</span>${icon('sync', 34)}</div><span style="font-weight:600">${lastRun.at ? fmtDate(lastRun.at) : '—'}</span><span class="muted">${esc(lastRun.note)}</span></div>
</div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 6px">
 <form method="post" action="/avisos/revisar"><button class="btn ghost" type="submit">${icon('sync', 18)} Revisar ahora</button></form>
 <a class="btn ghost" href="/avisos/ejemplo" target="_blank" rel="noopener">${icon('bell', 18)} Ver el correo</a>
 <form method="post" action="/avisos/prueba"><button class="btn ghost" type="submit"${mailOk ? '' : ' disabled'}>${icon('download', 18)} Enviarme una prueba</button></form>
</div>
<h2>Lo que más piden</h2>
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Producto</th><th>Clientas</th><th>Desde</th><th>Nota</th></tr></thead><tbody>${pendRows || empty(4, 'Nadie está esperando ningún producto.')}</tbody></table></div></div>
<h2>Últimos avisos enviados</h2>
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Producto</th><th>Lo pidió</th><th>Avisada</th></tr></thead><tbody>${sentRows || empty(3, 'Todavía no se ha enviado ninguno.')}</tbody></table></div></div>
<h2>Borrar el correo de una clienta</h2>
<form class="card" method="post" action="/avisos/borrar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
 <input name="email" type="email" required placeholder="correo@ejemplo.com" style="flex:1;min-width:220px;padding:11px 14px;border:1px solid var(--linea);border-radius:12px;font:inherit">
 <button class="btn ghost" type="submit">Borrar sus avisos</button>
 <p class="muted" style="margin:0;flex-basis:100%">Si una clienta pide que borres sus datos, ponlo aquí y se eliminan todos sus avisos pendientes.</p>
</form>`;
  return shell('Avisos de stock', 'avisos', body);
}
