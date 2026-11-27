// Página «Pedidos BTS» del panel.
import { shell, esc, fmtDate, icon } from '../views.js';

const eur = (x) => (x == null ? '—' : `${Number(x).toFixed(2).replace('.', ',')} €`);
const STATUS = {
  pendiente: ['Listo para enviar', 'running'],
  enviando: ['Enviando…', 'running'],
  enviado: ['En BTS, sin seguimiento', 'ok'],
  transferencia: ['En BTS, falta pagar', 'running'],
  'en-camino': ['Enviado a la clienta', 'ok'],
  error: ['Hay que revisarlo', 'error'],
  revisar: ['Comprueba en BTS', 'error'],
  ignorado: ['No se envía a BTS', 'prueba'],
};
const chip = (s) => {
  const [t, c] = STATUS[s] || [s, 'prueba'];
  return `<span class="chip ${c}">${esc(t)}</span>`;
};
const num = (id) => String(id).split('/').pop();

function row(o, dryRun) {
  if (o.status === 'enviado' && o.payment === 'banktransfer') o = { ...o, status: 'transferencia' };
  const d = o.detail || {};
  const lines = (d.lines || []).map((l) => `${l.quantity} × ${esc(l.name)}`).join('<br>');
  const other = (d.other || []).length ? `<div class="muted" style="font-size:12px">No es de BTS: ${(d.other || []).map((l) => esc(l.name)).join(', ')}</div>` : '';
  const a = d.address || {};
  const where = [a.postal_code, a.city].filter(Boolean).map(esc).join(' ');
  const id = num(o.order_id);
  let action = '';
  if (o.status === 'pendiente' || o.status === 'error') {
    action = `<form method="post" action="/pedidos-bts/${id}/enviar" onsubmit="return confirm('¿Enviar ${esc(o.name)} a BTS? Es un pedido real y se paga del monedero de BTS.')"><button class="btn" type="submit"${dryRun ? ' disabled' : ''}>${icon('box', 18)} Enviar a BTS</button></form>
<form method="post" action="/pedidos-bts/${id}/ignorar" style="margin-top:6px"><button class="btn ghost" type="submit" style="padding:6px 10px;font-size:13px">No enviar</button></form>`;
  } else if (o.status === 'revisar') {
    action = `<form method="post" action="/pedidos-bts/${id}/reintentar" onsubmit="return confirm('Antes de reintentar, mira en el panel de BTS que ${esc(o.name)} no esté ya creado. ¿Seguro que no está?')"><button class="btn ghost" type="submit">No está en BTS: reintentar</button></form>`;
  } else if (o.status === 'ignorado') {
    action = `<form method="post" action="/pedidos-bts/${id}/recuperar"><button class="btn ghost" type="submit" style="padding:6px 10px;font-size:13px">Volver a la lista</button></form>`;
  }
  const transfer = o.status === 'transferencia'
    ? `<div style="margin-top:6px;padding:8px 10px;border-radius:10px;background:var(--petalo-2);font-size:12px;max-width:240px"><b>Pendiente de transferencia</b><br>Transfiere ${eur(o.bts_total)} a BTS con el concepto <b>${esc(o.bts_order_number)}</b>. Los datos bancarios están en tu panel de BTS, en el pedido.</div>`
    : '';
  const bts = o.bts_order_number
    ? `<b>${esc(o.bts_order_number)}</b><div class="muted" style="font-size:12px">${eur(o.bts_total)}${o.shipping_company ? ' · ' + esc(o.shipping_company) : ''}</div>${o.tracking ? `<div style="font-size:12px">Seguimiento: ${esc(o.tracking)}</div>` : ''}`
    : '—';
  return `<tr>
<td><b>${esc(o.name)}</b><div class="muted" style="font-size:12px">${o.created_at ? fmtDate(o.created_at) : ''}</div></td>
<td>${esc(o.customer || '')}<div class="muted" style="font-size:12px">${where}</div></td>
<td>${lines || '—'}${other}</td>
<td style="white-space:nowrap">${eur(o.total)}</td>
<td>${chip(o.status)}${o.error ? `<div style="font-size:12px;color:var(--rojo);margin-top:4px;max-width:260px">${esc(o.error)}</div>` : ''}</td>
<td>${bts}${transfer}</td>
<td>${action}</td></tr>`;
}

export function ordersPage({ orders, counts, last, flash, dryRun, paymentMethod }) {
  const pend = (counts.pendiente || 0) + (counts.error || 0) + (counts.revisar || 0);
  const body = `<div class="eyebrow">Pedidos</div><h1>Pedidos BTS</h1>
<p class="muted" style="margin:10px 0 22px;max-width:700px">Cada pedido pagado en la tienda aparece aquí. Al pulsar «Enviar a BTS» se crea el pedido en BTS en modo dropshipping (paquete sin marca de BTS) y se paga ${paymentMethod === 'wallet' ? 'con el monedero de BTS; si el monedero no tiene saldo, se crea igualmente pendiente de transferencia bancaria' : 'por ' + esc(paymentMethod)}. Cuando BTS lo entrega al transportista, Nina Sync pone el seguimiento en Shopify y la clienta recibe el correo de envío.</p>
${dryRun ? `<div class="alert">${icon('alert')}<div><b>Modo prueba (DRY_RUN=true):</b> se ven los pedidos, pero no se envían a BTS.</div></div>` : ''}
${flash ? `<div class="card" style="background:${flash.ok ? 'var(--verde-bg);color:var(--verde)' : 'var(--rojo-bg);color:var(--rojo)'};margin-bottom:14px">${esc(flash.text)}</div>` : ''}
<div class="kpis">
 <div class="kpi destacado"><div class="top"><span>Por enviar o revisar</span>${icon('box', 34)}</div><b>${pend}</b><span>${counts.error || counts.revisar ? `${(counts.error || 0) + (counts.revisar || 0)} necesitan que los mires` : 'pedidos pagados'}</span></div>
 <div class="kpi"><div class="top"><span>En BTS</span>${icon('clock', 34)}</div><b>${counts.enviado || 0}</b><span class="muted">esperando el seguimiento</span></div>
 <div class="kpi"><div class="top"><span>Enviados a la clienta</span>${icon('sync', 34)}</div><b>${counts['en-camino'] || 0}</b><span class="muted">con número de seguimiento</span></div>
</div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 6px;align-items:center">
 <form method="post" action="/pedidos-bts/revisar"><button class="btn ghost" type="submit">${icon('sync', 18)} Buscar pedidos nuevos</button></form>
 <span class="muted">Se buscan solos cada 15 minutos. Última vez: ${last.at ? fmtDate(last.at) : '—'}${last.error ? ' · error: ' + esc(last.error) : ''}</span>
</div>
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Pedido</th><th>Clienta</th><th>Productos</th><th>Total</th><th>Estado</th><th>Pedido BTS</th><th></th></tr></thead>
<tbody>${orders.map((o) => row(o, dryRun)).join('') || `<tr><td colspan="7" class="empty">Todavía no hay pedidos pagados desde que se activó esta función.</td></tr>`}</tbody></table></div></div>
<p class="muted" style="margin-top:14px">BTS no tiene modo de prueba: cada envío es un pedido real. Si un producto no tiene stock en BTS, BTS rechaza el pedido entero (no hace envíos parciales). Para anular un pedido ya enviado hay que escribir al gestor de cuenta de BTS.</p>`;
  return shell('Pedidos BTS', 'pedidosbts', body);
}
