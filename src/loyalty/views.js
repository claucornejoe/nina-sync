// Página «NinaCash y niveles» del panel, con el diseño de Nina Sync.
import { shell, esc, fmtDate, icon } from '../views.js';
import { LEVELS } from './rules.js';

const eur = (x) => `${Number(x || 0).toFixed(2).replace('.', ',')} €`;
const COLORS = { 1: '#FFB3C6', 2: '#F7A1BC', 3: '#F72E75', 4: '#C92F60' };
const KIND = {
  pendiente: ['Pendiente', 'running'],
  sumado: ['Sumado', 'ok'],
  restado: ['Restado', 'error'],
  nivel: ['Cambio de nivel', 'baja'],
  'envio-glam': ['Envío gratis Glam', 'nuevo'],
  obsequio: ['Obsequio', 'oferta'],
  cupon: ['Cupón', 'nuevo'],
  error: ['Error', 'error'],
};
const chip = (k) => {
  const [t, c] = KIND[k] || [k, 'prueba'];
  return `<span class="chip ${c}">${esc(t)}</span>`;
};
const lvlChip = (n) => `<span class="chip" style="background:${COLORS[n]}22;color:${n > 2 ? COLORS[n] : '#8A3B57'}">${esc(LEVELS[n - 1]?.name || n)}</span>`;

function statusCard({ active, state, hooks }) {
  const row = (ok, label, detail) =>
    `<li style="display:flex;gap:10px;align-items:flex-start;padding:7px 0"><span class="chip ${ok ? 'ok' : 'running'}">${ok ? 'Listo' : 'Ojo'}</span><div><b>${esc(label)}</b>${detail ? `<div class="muted">${esc(detail)}</div>` : ''}</div></li>`;
  return `<div class="card"><ul style="list-style:none;margin:0;padding:0">
 ${row(active, active ? 'NinaCash activo' : 'Modo prueba', active ? 'Suma saldo, cambia etiquetas de nivel y crea los códigos en Shopify.' : 'Calcula y apunta todo aquí, pero no cambia nada en Shopify. Para activarlo: NINACASH_ACTIVO=true en Railway.')}
 ${row(hooks.estado === 'activos', 'Avisos de pedidos y cuentas nuevas', hooks.estado === 'activos' ? hooks.detalle : hooks.estado)}
 ${row(state.setup === 'listo', 'Segmentos por nivel y envío gratis Butterfly', state.setup)}
 ${row(!!state.lastRun, 'Último repaso', state.lastRun ? `${fmtDate(state.lastRun.at)} · ${state.lastRun.orders} pedidos, ${state.lastRun.customers} clientas${state.lastRun.newSparkle ? `, ${state.lastRun.newSparkle} cuentas nuevas a Sparkle` : ''}${state.lastRun.errors ? ` · ${state.lastRun.errors} errores` : ''}` : 'Cada día a las 5:30 (hora de Madrid)')}
</ul>
<form method="post" action="/ninacash/repasar" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
 <button class="btn ghost" type="submit">${icon('sync', 18)} Repasar ahora</button>
 <button class="btn ghost" type="submit" name="carga" value="1">${icon('download', 18)} Cargar pedidos de los últimos 12 meses</button>
</form></div>`;
}

function couponForm(form = {}) {
  const v = (k) => esc(form[k] || '');
  const lv = [].concat(form.niveles || []).map(String);
  const checks = LEVELS.map(
    (l) => `<label style="display:inline-flex;gap:6px;align-items:center;margin-right:14px"><input type="checkbox" name="niveles" value="${l.n}"${lv.includes(String(l.n)) ? ' checked' : ''}> ${esc(l.name)}</label>`,
  ).join('');
  const field = (label, html) => `<label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600">${label}${html}</label>`;
  const input = (name, type = 'text', extra = '') =>
    `<input name="${name}" type="${type}" value="${v(name)}" ${extra} style="padding:11px 14px;border:1px solid var(--linea);border-radius:12px;font:inherit;font-weight:400">`;
  return `<form class="card" method="post" action="/ninacash/cupon" style="display:grid;gap:14px">
 <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">
  ${field('Código', input('codigo', 'text', 'required placeholder="GLAM15" style="text-transform:uppercase"'))}
  ${field('Descuento', `<div style="display:flex;gap:8px">${input('valor', 'text', 'required placeholder="15" inputmode="decimal"')}<select name="tipo" style="padding:11px;border:1px solid var(--linea);border-radius:12px;font:inherit"><option value="porcentaje"${form.tipo !== 'euros' ? ' selected' : ''}>%</option><option value="euros"${form.tipo === 'euros' ? ' selected' : ''}>€</option></select></div>`)}
  ${field('Compra mínima (opcional, €)', input('minimo', 'text', 'placeholder="30" inputmode="decimal"'))}
  ${field('Desde', input('desde', 'date'))}
  ${field('Hasta', input('hasta', 'date'))}
 </div>
 ${field('Texto que ve la clienta en Mi cuenta', input('texto', 'text', 'placeholder="15 % en todo el maquillaje esta semana"'))}
 <div><div style="font-size:13px;font-weight:600;margin-bottom:6px">Solo para estos niveles</div>${checks}</div>
 <p class="muted" style="margin:0">Shopify solo acepta el código si la clienta ha iniciado sesión y tiene la etiqueta del nivel. Una vez por clienta, no se suma a otros cupones. Si no pones fechas, dura 7 días desde hoy.</p>
 <div><button class="btn" type="submit">${icon('tag', 18)} Crear cupón</button></div>
</form>`;
}

export function ninacashPage({ active, state, hooks, totals, customers, coupons, gifts, log, flash }) {
  const lvlKpis = LEVELS.map(
    (l) => `<div class="kpi"><div class="top"><span>${esc(l.name)} · desde ${l.from} €</span><span style="width:14px;height:14px;border-radius:50%;background:${COLORS[l.n]}"></span></div><b>${totals.byLevel[l.n] || 0}</b><span class="muted">${l.rate} % NinaCash</span></div>`,
  ).join('');
  const custRows = customers
    .map((c) => `<tr><td><div class="prod">${esc(c.name || c.customer_id)}</div></td><td>${lvlChip(c.level)}</td><td class="num">${eur(c.spent_12m)}</td><td class="num">${eur(c.balance)}</td><td class="num">${eur(c.pending)}</td></tr>`)
    .join('');
  const now = Date.now();
  const coupRows = coupons
    .map((c) => {
      const live = new Date(c.starts_at) <= now && new Date(c.ends_at) > now;
      const st = new Date(c.ends_at) <= now ? '<span class="chip prueba">Caducado</span>' : live ? '<span class="chip ok">Activo</span>' : '<span class="chip running">Programado</span>';
      return `<tr><td><b>${esc(c.code)}</b><div class="sub">${esc(c.text || '')}</div></td><td>${c.levels.map(lvlChip).join(' ')}</td><td class="num">${c.kind === 'porcentaje' ? `${Number(c.value)} %` : eur(c.value)}${c.min_total ? `<div class="sub">desde ${eur(c.min_total)}</div>` : ''}</td><td class="nw">${fmtDate(c.starts_at)} → ${fmtDate(c.ends_at)}</td><td>${st}</td></tr>`;
    })
    .join('');
  const giftRows = gifts.map((g) => `<tr><td><b>${esc(g.order_name)}</b></td><td>${esc(g.customer_name || '')}</td></tr>`).join('');
  const logRows = log
    .map(
      (r) => `<tr><td class="nw">${fmtDate(r.at)}</td><td>${chip(r.kind)}${r.dry_run ? ' <span class="chip prueba">Prueba</span>' : ''}</td><td>${esc(r.customer_name || '')}${r.order_name ? `<div class="sub">${esc(r.order_name)}</div>` : ''}</td><td class="num">${r.amount != null ? eur(r.amount) : ''}</td><td class="sub">${esc(r.note || '')}</td></tr>`,
    )
    .join('');
  const empty = (n, t) => `<tr><td colspan="${n}"><div class="empty"><img src="/static/mariposa.svg" alt="">${t}</div></td></tr>`;

  const body = `<div class="eyebrow">Fidelidad</div><h1>NinaCash y niveles</h1>
<p class="muted" style="margin:10px 0 22px;max-width:680px">Cada compra pagada suma NinaCash (1 %, 1,5 % o 2 % según el nivel). Se suma al saldo de la clienta al momento de pagar, como crédito en tienda de Shopify, y se resta si el pedido se cancela o se devuelve: lo ve en su cuenta y lo usa al pagar. El nivel sale de lo comprado en los últimos 12 meses.</p>
${flash?.error ? `<div class="alert">${icon('alert')}<div>${esc(flash.error)}</div></div>` : ''}
${flash?.ok ? `<div class="card" style="background:var(--verde-bg);color:var(--verde);margin-bottom:14px">${esc(flash.ok)}</div>` : ''}
${statusCard({ active, state, hooks })}
<div class="kpis">${lvlKpis}
 <div class="kpi"><div class="top"><span>NinaCash pendiente</span>${icon('clock', 34)}</div><b>${eur(totals.pending)}</b></div>
 <div class="kpi destacado"><div class="top"><span>NinaCash sumado</span>${icon('euro', 34)}</div><b>${eur(totals.credited)}</b></div>
</div>
<h2 id="cupones">Cupones por nivel</h2>
${couponForm(flash?.form)}
<div class="tablecard" style="margin-top:14px"><div class="tablewrap"><table><thead><tr><th>Código</th><th>Niveles</th><th>Descuento</th><th>Fechas</th><th>Estado</th></tr></thead><tbody>${coupRows || empty(5, 'Aún no hay cupones por nivel.')}</tbody></table></div></div>
<h2>Obsequios Butterfly de este mes</h2>
<p class="muted" style="margin-top:-6px">Estos pedidos llevan la etiqueta «obsequio-butterfly»: añade una muestra o un mini al prepararlos.</p>
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Pedido</th><th>Clienta</th></tr></thead><tbody>${giftRows || empty(2, 'Ninguno este mes.')}</tbody></table></div></div>
<h2>Clientas</h2>
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Clienta</th><th>Nivel</th><th>Últimos 12 meses</th><th>Saldo</th><th>Pendiente</th></tr></thead><tbody>${custRows || empty(5, 'Todavía no hay compras con cuenta.')}</tbody></table></div></div>
<h2>Movimientos</h2>
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Clienta</th><th>Importe</th><th>Detalle</th></tr></thead><tbody>${logRows || empty(5, 'Sin movimientos todavía.')}</tbody></table></div></div>`;
  return shell('NinaCash', 'ninacash', body);
}
