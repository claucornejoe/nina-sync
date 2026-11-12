// HTML del panel e informes, según el manual de marca de Nina Beauty:
// rosa #F72E75, rosa frambuesa #C92F60 (botones), rosa pétalo #FFCCD5, grafito #2B2B2B, gris #6E6E6E.
// Títulos en Cormorant Garamond, textos en Montserrat.
const TZ = process.env.DISPLAY_TZ || 'America/Santiago';
const OWNER = process.env.PANEL_NAME || 'Clau';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fmtDate(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
}
function fmtTime(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}
function relative(d) {
  if (!d) return '';
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
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

// Iconos de línea fina (24×24), en el color del texto.
const I = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  box: '<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  euro: '<path d="M17 6.5A6.5 6.5 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>',
  down: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
};
const icon = (n, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

const CSS = `
:root{--rosa:#F72E75;--frambuesa:#C92F60;--petalo:#FFCCD5;--petalo-2:#FFF1F4;--grafito:#2B2B2B;--gris:#6E6E6E;--linea:#F1E4E8;--fondo:#FCF8F9;--blanco:#fff;--verde:#1F7A4D;--verde-bg:#E8F5EE;--ambar:#8A5A00;--ambar-bg:#FFF4DB;--rojo:#A61B3A;--rojo-bg:#FDE9EE;
--serif:'Cormorant Garamond',Georgia,serif;--sans:Montserrat,system-ui,-apple-system,sans-serif;--r:18px;--sombra:0 1px 2px rgba(43,43,43,.04),0 8px 24px rgba(201,47,96,.06)}
*{box-sizing:border-box}html,body{margin:0}body{font-family:var(--sans);color:var(--grafito);background:var(--fondo);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--frambuesa);text-decoration:none}a:hover{text-decoration:underline}
.ic{flex:none;vertical-align:middle}
/* Estructura */
.app{display:grid;grid-template-columns:248px 1fr;min-height:100vh}
.side{background:var(--blanco);border-right:1px solid var(--linea);padding:28px 18px;position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:28px}
.side .brand img{width:150px;display:block;margin:0 auto}
.side .brand small{display:block;text-align:center;margin-top:6px;font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--gris)}
.nav{display:flex;flex-direction:column;gap:4px}
.nav a{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;color:var(--grafito);font-weight:500}
.nav a:hover{background:var(--petalo-2);text-decoration:none}
.nav a.on{background:var(--petalo);color:var(--frambuesa);font-weight:600}
.nav .spacer{flex:1}
.side .foot{margin-top:auto;font-size:12px;color:var(--gris);text-align:center}
.side .foot img{width:26px;opacity:.5;display:block;margin:0 auto 6px}
main{padding:36px 40px 60px;max-width:1180px;width:100%;min-width:0}
/* Tipografía */
h1,h2,h3{font-variant-numeric:lining-nums;font-family:var(--serif);font-weight:500;letter-spacing:.005em;margin:0}
h1{font-size:40px;line-height:1.1}h2{font-size:28px;margin:36px 0 14px}h3{font-size:22px}
.eyebrow{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--rosa);font-weight:600;margin-bottom:8px}
.muted{color:var(--gris);font-size:13px}
/* Hero */
.hero{position:relative;overflow:hidden;background:linear-gradient(120deg,var(--petalo) 0%,#FFE3EA 45%,#fff 100%);border-radius:24px;padding:34px 36px;display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap;box-shadow:var(--sombra)}
.hero .mariposa{position:absolute;right:-30px;top:-40px;width:230px;opacity:.13;pointer-events:none;transform:rotate(-8deg)}
.hero h1 em{font-style:italic;color:var(--frambuesa)}
.hero p{margin:10px 0 0;max-width:520px}
.hero .meta{display:flex;gap:22px;flex-wrap:wrap;margin-top:18px;font-size:13px}
.hero .meta span{display:flex;align-items:center;gap:8px;color:var(--grafito)}
.hero .meta .ic{color:var(--frambuesa)}
.hero form{position:relative;z-index:1}
/* Botones y chips */
.btn{display:inline-flex;align-items:center;gap:10px;background:var(--frambuesa);color:#fff;border:0;border-radius:999px;padding:14px 26px;font:600 15px var(--sans);cursor:pointer;box-shadow:0 8px 20px rgba(201,47,96,.28);transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(201,47,96,.34);text-decoration:none}
.btn[disabled]{opacity:.6;cursor:progress;transform:none}
.btn.ghost{background:#fff;color:var(--frambuesa);box-shadow:none;border:1px solid var(--petalo);padding:10px 18px;font-size:14px}
.spin{animation:spin 1.2s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:600;white-space:nowrap}
.chip::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.ok{background:var(--verde-bg);color:var(--verde)}.error{background:var(--rojo-bg);color:var(--rojo)}.running{background:var(--ambar-bg);color:var(--ambar)}
.prueba{background:#F2F2F2;color:var(--gris)}
.oferta{background:var(--rosa);color:#fff}.baja{background:var(--petalo);color:var(--frambuesa)}.nuevo{background:#FFF1F4;color:var(--rosa)}
/* Tarjetas */
.card{background:var(--blanco);border:1px solid var(--linea);border-radius:var(--r);padding:22px;box-shadow:var(--sombra)}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-top:22px}
.kpi{background:var(--blanco);border:1px solid var(--linea);border-radius:var(--r);padding:18px 20px;box-shadow:var(--sombra);display:flex;flex-direction:column;gap:6px}
.kpi .top{display:flex;align-items:center;justify-content:space-between;color:var(--gris);font-size:13px}
.kpi .top .ic{color:var(--rosa);background:var(--petalo-2);border-radius:10px;padding:7px;width:34px;height:34px}
.kpi b{font-variant-numeric:lining-nums;font-family:var(--serif);font-size:38px;font-weight:500;line-height:1}
.kpi.destacado{background:linear-gradient(140deg,var(--rosa),var(--frambuesa));color:#fff;border:0}
.kpi.destacado .top{color:rgba(255,255,255,.85)}.kpi.destacado .top .ic{background:rgba(255,255,255,.18);color:#fff}
/* Tablas */
.tablecard{background:var(--blanco);border:1px solid var(--linea);border-radius:var(--r);box-shadow:var(--sombra);overflow:hidden}
.tablewrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:14px 18px;border-bottom:1px solid var(--linea);vertical-align:middle}
th{white-space:nowrap;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gris);font-weight:600;background:#FFFBFC}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:#FFF8FA}
tr.destaca td{background:#FFF1F4}tr.destaca td:first-child{box-shadow:inset 3px 0 0 var(--rosa)}
td .prod{font-weight:600;min-width:190px}td.sub{min-width:230px}td .sub{color:var(--gris);font-size:12px}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}td.nw{white-space:nowrap}
.empty{padding:40px;text-align:center;color:var(--gris)}
.empty img{width:56px;opacity:.5;display:block;margin:0 auto 10px}
/* Filtros */
.pills{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0 14px;align-items:center}
.pills a{padding:8px 16px;border-radius:999px;border:1px solid var(--linea);background:#fff;color:var(--grafito);font-size:13px;font-weight:500}
.pills a:hover{border-color:var(--petalo);text-decoration:none}
.pills a.on{background:var(--grafito);color:#fff;border-color:var(--grafito)}
.pills .sep{flex:1}
.back{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--gris);margin-bottom:14px}
.alert{display:flex;gap:12px;align-items:flex-start;background:var(--rojo-bg);color:var(--rojo);border-radius:14px;padding:14px 18px;margin-top:18px}
/* Entrar */
.login{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 15% 20%,#fff 0,transparent 40%),linear-gradient(135deg,var(--petalo),#FFE6EC 60%,#fff);position:relative;overflow:hidden}
.login .m1{position:absolute;width:420px;right:-90px;bottom:-110px;opacity:.16;transform:rotate(-12deg)}
.login .m2{position:absolute;width:160px;left:6%;top:8%;opacity:.12;transform:rotate(14deg)}
.login .box{position:relative;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border-radius:28px;padding:42px 38px;width:100%;max-width:400px;box-shadow:0 24px 60px rgba(201,47,96,.18);text-align:center}
.login .box img{width:190px;margin:0 auto 6px;display:block}
.login .box .eyebrow{color:var(--gris);margin:4px 0 26px}
.login label{display:block;text-align:left;font-size:13px;font-weight:600}
.login input{width:100%;padding:14px 16px;border:1px solid var(--linea);border-radius:14px;font:inherit;margin:8px 0 18px;background:#fff;outline:none}
.login input:focus{border-color:var(--rosa);box-shadow:0 0 0 4px rgba(247,46,117,.12)}
.login .btn{width:100%;justify-content:center}
.login .err{background:var(--rojo-bg);color:var(--rojo);border-radius:12px;padding:10px;font-size:13px;margin-bottom:16px}
/* Móvil */
@media (max-width:860px){
 .app{grid-template-columns:1fr}
 .side{position:static;height:auto;flex-direction:row;align-items:center;justify-content:space-between;padding:14px 16px;gap:12px;border-right:0;border-bottom:1px solid var(--linea)}
 .side .brand img{width:104px}.side .brand small,.side .foot{display:none}
 .nav{flex-direction:row;gap:2px}.nav a{padding:9px}.nav a span{display:none}
 main{padding:22px 16px 48px}
 h1{font-size:32px}.hero{padding:26px 22px}.hero .btn{width:100%;justify-content:center}.hero form{width:100%}
 th,td{padding:12px 14px}
 .kpis{grid-template-columns:repeat(2,1fr);gap:10px}.kpi{padding:14px}.kpi b{font-size:32px}
}
`;

function shell(title, active, body, { refresh = false } = {}) {
  const link = (href, key, ic, label) => `<a href="${href}" class="${active === key ? 'on' : ''}">${icon(ic)}<span>${label}</span></a>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="15">' : ''}
<title>${esc(title)} · Nina Sync</title>
<link rel="icon" href="/static/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="app">
<aside class="side">
 <a class="brand" href="/"><img src="/static/logo.svg" alt="Nina Beauty"><small>Sync</small></a>
 <nav class="nav">
  ${link('/', 'panel', 'home', 'Panel')}
  ${link('/ofertas', 'ofertas', 'tag', 'Ofertas')}
  ${link('/recien-llegados', 'nuevos', 'spark', 'Recién llegados')}
  ${link('/salir', 'salir', 'out', 'Salir')}
 </nav>
 <div class="foot"><img src="/static/mariposa.svg" alt="">Stock y precios con BTS</div>
</aside>
<main>${body}</main>
</div></body></html>`;
}

// Compatibilidad: algunas rutas usan layout() directamente.
export const layout = (title, body) => shell(title, '', body);

export function loginPage(error) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Entrar · Nina Sync</title>
<link rel="icon" href="/static/favicon.png">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="login">
 <img class="m1" src="/static/mariposa.svg" alt=""><img class="m2" src="/static/mariposa.svg" alt="">
 <form class="box" method="post" action="/entrar">
  <img src="/static/logo.svg" alt="Nina Beauty">
  <div class="eyebrow">Panel de sincronización</div>
  ${error ? '<div class="err">Esa contraseña no es correcta. Prueba otra vez.</div>' : ''}
  <label for="pw">Contraseña</label>
  <input id="pw" type="password" name="password" autofocus required autocomplete="current-password">
  <button class="btn" type="submit">Entrar</button>
 </form>
</div></body></html>`;
}

function statusChip(run) {
  const label = { ok: 'Correcta', error: 'Error', running: 'En curso' }[run.status] || run.status;
  return `<span class="chip ${esc(run.status)}">${label}</span>${run.dry_run ? ' <span class="chip prueba">Prueba</span>' : ''}`;
}

function kpi(ic, label, value, cls = '') {
  return `<div class="kpi ${cls}"><div class="top"><span>${label}</span>${icon(ic, 20)}</div><b>${value ?? 0}</b></div>`;
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export function dashboard({ runs, running, nextRun, offers, newArrivals = 0, dryRun = false }) {
  const last = runs[0];
  const s = last?.summary || {};
  const rows = runs
    .map((r) => {
      const x = r.summary || {};
      return `<tr><td><a href="/sync/${r.id}"><span class="prod">#${r.id}</span></a></td><td class="nw">${fmtDate(r.started_at)}<div class="sub">${relative(r.started_at)}</div></td><td>${TRIGGER[r.trigger] || esc(r.trigger)}</td><td class="nw">${statusChip(r)}</td>
<td class="num">${x.stockChanges ?? '—'}</td><td class="num">${x.priceChanges ?? '—'}</td><td class="num">${x.newOffers ?? '—'}</td><td class="num">${x.newProducts ?? '—'}</td><td class="num">${duration(r)}</td><td class="nw"><a href="/sync/${r.id}">Ver informe →</a></td></tr>`;
    })
    .join('');

  const body = `
<section class="hero">
 <img class="mariposa" src="/static/mariposa.svg" alt="">
 <div>
  <div class="eyebrow">Nina Sync${dryRun ? ' · modo prueba' : ''}</div>
  <h1>${greeting()}, <em>${esc(OWNER)}</em></h1>
  <p>${last ? `La última sincronización fue ${relative(last.started_at)} y terminó ${last.status === 'ok' ? 'bien' : last.status === 'running' ? '… aún está en marcha' : 'con un error'}.` : 'Todavía no hay ninguna sincronización. Lanza la primera cuando quieras.'}</p>
  <div class="meta">
   <span>${icon('clock', 18)} Última: ${last ? fmtTime(last.started_at) : '—'}</span>
   <span>${icon('sync', 18)} Próxima automática: ${nextRun ? fmtTime(nextRun) : '—'}</span>
  </div>
 </div>
 <form method="post" action="/sync">
  <button class="btn" ${running ? 'disabled' : ''}>${icon('sync', 18).replace('class="ic"', running ? 'class="ic spin"' : 'class="ic"')} ${running ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
 </form>
</section>
${last?.status === 'error' ? `<div class="alert">${icon('alert')}<div><b>La última sincronización falló.</b><br>${esc(last.error || '')}</div></div>` : ''}

<div class="kpis">
 ${kpi('box', 'Cambios de stock', s.stockChanges)}
 ${kpi('euro', 'Cambios de precio', s.priceChanges)}
 ${kpi('tag', 'Ofertas activas', offers, 'destacado')}
 ${kpi('spark', 'Recién llegados activos', newArrivals)}
</div>

<h2>Historial de sincronizaciones</h2>
<div class="tablecard"><div class="tablewrap"><table>
<thead><tr><th>Nº</th><th>Fecha y hora</th><th>Tipo</th><th>Estado</th><th>Stock</th><th>Precios</th><th>Ofertas</th><th>Nuevos</th><th>Duración</th><th></th></tr></thead>
<tbody>${rows || `<tr><td colspan="10"><div class="empty"><img src="/static/mariposa.svg" alt="">Todavía no hay sincronizaciones.</div></td></tr>`}</tbody>
</table></div></div>`;
  return shell('Panel', 'panel', body, { refresh: running });
}

export function reportHtml({ run, changes }, { filter = '', baseUrl = '' } = {}) {
  const s = run.summary || {};
  const shown = filter ? changes.filter((c) => (filter === 'ofertas' ? c.on_sale || c.price_drop : c.kind === filter)) : changes;
  const count = (f) => (f === 'ofertas' ? changes.filter((c) => c.on_sale || c.price_drop).length : changes.filter((c) => c.kind === f).length);
  const rows = shown
    .map((c) => {
      const chips = [
        c.price_drop ? '<span class="chip baja">Baja de precio</span>' : '',
        c.on_sale ? '<span class="chip oferta">En oferta</span>' : '',
        c.kind === 'nuevo' ? '<span class="chip nuevo">Nuevo</span>' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const size = c.variant_title && c.variant_title !== 'Default Title' ? ` · ${esc(c.variant_title)}` : '';
      return `<tr class="${c.on_sale || c.price_drop ? 'destaca' : ''}"><td><div class="prod">${esc(c.product_title)}</div><div class="sub">${size ? size.slice(3) + ' · ' : ''}${esc(c.ean || '')}</div></td>
<td>${KIND[c.kind] || esc(c.kind)}</td><td class="num">${esc(c.old_value)}</td><td class="num"><b>${esc(c.new_value)}</b></td><td>${chips}</td><td class="sub">${esc(c.note || '')}</td></tr>`;
    })
    .join('');
  const pill = (f, label) => `<a class="${filter === f ? 'on' : ''}" href="${baseUrl}/sync/${run.id}${f ? `?ver=${f}` : ''}">${label}${f ? ` · ${count(f)}` : ` · ${changes.length}`}</a>`;

  const body = `
<a class="back" href="/">${icon('back', 16)} Volver al panel</a>
<div class="eyebrow">Informe de sincronización</div>
<h1>Sincronización #${run.id}</h1>
<p class="muted" style="margin-top:8px">${fmtDate(run.started_at)} · ${TRIGGER[run.trigger] || esc(run.trigger)} · duración ${duration(run)} &nbsp; ${statusChip(run)}</p>
${run.error ? `<div class="alert">${icon('alert')}<div><b>Error</b><br>${esc(run.error)}</div></div>` : ''}
<div class="kpis">
 ${kpi('box', 'Cambios de stock', s.stockChanges)}
 ${kpi('euro', 'Cambios de precio', s.priceChanges)}
 ${kpi('down', 'Bajadas de precio', s.priceDrops)}
 ${kpi('tag', 'A «Ofertas de la semana»', s.newOffers, 'destacado')}
 ${kpi('spark', 'Recién llegados creados', s.newProducts)}
 ${kpi('layers', 'Categorías corregidas', s.tagChanges)}
 ${kpi('alert', 'Ya no están en BTS', s.missingInBts)}
 ${kpi('alert', 'Retirados (pierden dinero)', s.losingMoney)}
</div>
<div class="pills">
 ${pill('', 'Todo')} ${pill('ofertas', 'Ofertas')} ${pill('precio', 'Precios')} ${pill('stock', 'Stock')} ${pill('etiquetas', 'Categorías')} ${pill('nuevo', 'Recién llegados')}
 <span class="sep"></span><a class="btn ghost" href="/sync/${run.id}.csv">${icon('download', 16)} Descargar CSV</a>
</div>
<div class="tablecard"><div class="tablewrap"><table>
<thead><tr><th>Producto</th><th>Qué cambia</th><th>Antes</th><th>Ahora</th><th>Oferta</th><th>Detalle</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6"><div class="empty"><img src="/static/mariposa.svg" alt="">Sin cambios en esta vista.</div></td></tr>`}</tbody>
</table></div></div>`;
  return shell(`Informe #${run.id}`, 'panel', body);
}

function listPage(active, eyebrow, title, intro, items) {
  const rows = items.map((o) => `<tr><td><div class="prod">${esc(o.product_title)}</div></td><td>${fmtDate(o.started_at)}</td><td>${fmtDate(o.until)}</td></tr>`).join('');
  return shell(
    title,
    active,
    `<div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="muted" style="margin:10px 0 22px;max-width:620px">${intro}</p>
<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Producto</th><th>Desde</th><th>Hasta</th></tr></thead>
<tbody>${rows || `<tr><td colspan="3"><div class="empty"><img src="/static/mariposa.svg" alt="">No hay ninguno ahora mismo.</div></td></tr>`}</tbody></table></div></div>`,
  );
}

export const offersPage = (offers) =>
  listPage('ofertas', 'Colección', 'Ofertas de la semana', 'Perfumes que han bajado de precio en los últimos 7 días. Llevan la etiqueta «oferta-semana» y salen solos de la colección al terminar la semana.', offers);

export const newArrivalsPage = (items) =>
  listPage('nuevos', 'Colección', 'Recién llegados', 'Novedades de BTS que la app ha creado en tu tienda. Llevan la etiqueta «recien-llegado» durante 30 días.', items);

export function changesCsv(changes) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Producto', 'Tamaño', 'EAN', 'Tipo', 'Antes', 'Ahora', 'Baja de precio', 'En oferta', 'Detalle'];
  const lines = changes.map((c) =>
    [c.product_title, c.variant_title, c.ean, KIND[c.kind] || c.kind, c.old_value, c.new_value, c.price_drop ? 'sí' : '', c.on_sale ? 'sí' : '', c.note].map(q).join(';'),
  );
  return '﻿' + [head.map(q).join(';'), ...lines].join('\n');
}
