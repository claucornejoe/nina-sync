// Página «Foro Nina» del panel: revisar, publicar, responder como Equipo Nina y destacar temas.
import { shell, esc, fmtDate, icon } from '../views.js';
import { CATEGORIAS, categoria, rutaTema } from './rules.js';
import { BASE } from './tienda.js';

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const nombreCat = (id) => categoria(id)?.nombre || id;
const corto = (s, n = 400) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));
const parr = (s) => esc(corto(s, 1500)).replace(/\n/g, '<br>');

const boton = (accion, campos, texto, clase = 'ghost', confirmar = '') =>
  `<form method="post" action="${accion}" style="display:inline"${confirmar ? ` onsubmit="return confirm('${esc(confirmar)}')"` : ''}>${Object.entries(campos)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`)
    .join('')}<button class="btn ${clase}" type="submit" style="padding:8px 16px;font-size:13px">${texto}</button></form>`;

function tarjetaRevisar(m, tipo) {
  const estado = { tipo, id: m.id };
  return `<div class="card" style="display:grid;gap:10px">
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <span class="chip running">${tipo === 'tema' ? 'Tema nuevo' : 'Respuesta'}</span>
    ${tipo === 'tema' ? `<span class="chip prueba">${esc(nombreCat(m.categoria))}</span>` : ''}
    ${m.motivo ? `<span class="chip error">${esc(m.motivo)}</span>` : ''}
    <span class="muted">${esc(m.autor)} · ${fmtDate(m.creado)}</span>
  </div>
  ${tipo === 'tema' ? `<h3 style="margin:0">${esc(m.titulo)}</h3>` : `<div class="muted">En «${esc(m.tema_titulo)}»</div>`}
  <div style="background:var(--fondo);border-radius:12px;padding:12px 14px">${parr(m.cuerpo)}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${boton('/foro/estado', { ...estado, estado: 'publicado' }, 'Publicar', '')}
    ${boton('/foro/estado', { ...estado, estado: 'rechazado' }, 'Rechazar')}
    ${boton('/foro/borrar', estado, 'Borrar', 'ghost', '¿Borrar este mensaje para siempre?')}
    ${m.cliente_id ? boton('/foro/bloquear', { cliente: m.cliente_id, si: '1' }, 'Bloquear a esta clienta', 'ghost', '¿Bloquear a esta clienta? No podrá publicar más en el foro.') : ''}
  </div>
  ${tipo === 'tema' ? formResponder(m, 'Publicar y responder como Equipo Nina') : ''}
</div>`;
}

function formResponder(t, texto = 'Responder como Equipo Nina') {
  return `<details><summary style="cursor:pointer;color:var(--frambuesa);font-weight:600">${texto}</summary>
<form method="post" action="/foro/responder" style="display:grid;gap:8px;margin-top:8px"><input type="hidden" name="tema" value="${t.id}">
<textarea name="cuerpo" rows="4" required style="width:100%;border:1px solid var(--petalo);border-radius:12px;padding:10px;font:14px var(--sans)" placeholder="Tu respuesta aparecerá con la etiqueta «Equipo Nina»."></textarea>
<div><button class="btn" type="submit" style="padding:10px 20px;font-size:14px">Publicar respuesta</button></div></form></details>`;
}

export function foroPage({ revisar, denuncias, recientes, cifras, ejemplos = 0, estado, ajustes, proxyUrl, tiendaUrl, flash }) {
  const pendientes = revisar.temas.length + revisar.respuestas.length;
  const conectado = !!estado.ultimaVisita;
  const config = conectado
    ? ''
    : `<div class="card" style="background:var(--ambar-bg);border-color:#F3D9A4;margin-bottom:18px"><h3 style="margin:0 0 8px">Falta un paso para que el foro aparezca en la tienda</h3>
<p style="margin:0 0 8px">El foro se ve en <b>${esc(tiendaUrl)}</b> gracias al «proxy de aplicación» de Shopify. Se activa una vez en la app Nina Sync del Dev Dashboard de Shopify, en <b>Configuración → Proxy de la aplicación</b>:</p>
<ul style="margin:0;padding-left:20px"><li>Prefijo de la subruta: <b>apps</b></li><li>Subruta: <b>foro</b></li><li>URL del proxy: <b>${esc(proxyUrl || 'PUBLIC_URL/proxy/foro')}</b></li></ul>
<p class="muted" style="margin:8px 0 0">Después hay que publicar una versión nueva de la app. Este aviso desaparece en cuanto alguien abre el foro desde la tienda.${estado.firmasMalas ? ` (${estado.firmasMalas} intentos con firma no válida desde que arrancó.)` : ''}</p></div>`;

  const revisarHtml = pendientes
    ? `<div style="display:grid;gap:14px">${revisar.temas.map((m) => tarjetaRevisar(m, 'tema')).join('')}${revisar.respuestas.map((m) => tarjetaRevisar(m, 'respuesta')).join('')}</div>`
    : `<div class="card"><div class="empty"><img src="/static/mariposa.svg" alt="">No hay nada por revisar. ¡Todo al día!</div></div>`;

  const denunciasHtml = denuncias.length
    ? `<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Mensaje</th><th>Avisos</th><th>Estado</th><th></th></tr></thead><tbody>${denuncias
        .map(
          (d) => `<tr><td><div class="prod">${esc(d.titulo || '')}</div><div class="sub">${esc(d.autor || '')}: ${esc(corto(d.cuerpo, 160))}</div></td>
<td><b>${d.n}</b><div class="sub">${esc(d.motivos || '')}</div></td><td>${esc(d.estado || 'borrado')}</td>
<td class="nw">${boton('/foro/estado', { tipo: d.tipo, id: d.objeto_id, estado: 'publicado' }, 'Está bien')} ${boton('/foro/borrar', { tipo: d.tipo, id: d.objeto_id }, 'Borrar', 'ghost', '¿Borrar este mensaje para siempre?')}</td></tr>`,
        )
        .join('')}</tbody></table></div></div>`
    : '<p class="muted">Ninguna clienta ha avisado de ningún problema.</p>';

  const recientesHtml = recientes.length
    ? `<div class="tablecard"><div class="tablewrap"><table><thead><tr><th>Tema</th><th>Respuestas</th><th>Actividad</th><th></th></tr></thead><tbody>${recientes
        .map(
          (t) => `<tr><td><div class="prod"><a href="${esc(tiendaUrl.replace(BASE, ''))}${BASE}/${rutaTema(t)}" target="_blank" rel="noopener">${esc(t.titulo)}</a>${t.fijado ? ' <span class="chip ok">Destacado</span>' : ''}</div><div class="sub">${esc(nombreCat(t.categoria))} · ${t.equipo ? 'Equipo Nina' : esc(t.autor)}</div>${formResponder(t)}</td>
<td class="num">${t.respuestas}</td><td class="nw">${fmtDate(t.actividad)}</td>
<td class="nw">${boton('/foro/fijar', { id: t.id, si: t.fijado ? '0' : '1' }, t.fijado ? 'Quitar destacado' : 'Destacar')} ${boton('/foro/estado', { tipo: 'tema', id: t.id, estado: 'rechazado' }, 'Ocultar')}</td></tr>`,
        )
        .join('')}</tbody></table></div></div>`
    : '<p class="muted">Todavía no hay temas publicados.</p>';

  const opts = CATEGORIAS.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  const body = `<div class="eyebrow">Comunidad</div><h1>Foro Nina</h1>
<p class="muted" style="margin:10px 0 22px;max-width:700px">Las preguntas y consejos de tus clientas en <a href="${esc(tiendaUrl)}" target="_blank" rel="noopener">${esc(tiendaUrl.replace(/^https?:\/\//, ''))}</a>. ${
    ajustes.modo === 'previa'
      ? 'Revisas cada mensaje antes de que se publique.'
      : `Las clientas con ${ajustes.minConfianza} mensajes aprobados publican directamente; el resto lo revisas tú.`
  } Con ${ajustes.umbral} avisos de clientas distintas, un mensaje se oculta hasta que lo revises.</p>
${config}
${flash ? `<div class="card" style="background:${flash.ok ? 'var(--verde-bg);color:var(--verde)' : 'var(--rojo-bg);color:var(--rojo)'};margin-bottom:14px">${esc(flash.text)}</div>` : ''}
<div class="kpis">
 <div class="kpi${pendientes ? ' destacado' : ''}"><div class="top"><span>Por revisar</span>${icon('bell', 34)}</div><b>${cifras.pendientes}</b><span${pendientes ? '' : ' class="muted"'}>${pendientes ? 'esperan tu visto bueno' : 'todo al día'}</span></div>
 <div class="kpi"><div class="top"><span>Temas publicados</span>${icon('chat', 34)}</div><b>${cifras.temas}</b><span class="muted">${plural(cifras.respuestas, 'respuesta', 'respuestas')}</span></div>
 <div class="kpi"><div class="top"><span>Clientas que escriben</span>${icon('heart', 34)}</div><b>${cifras.clientas}</b><span class="muted">han escrito al menos una vez</span></div>
 <div class="kpi"><div class="top"><span>Sin respuesta de Nina</span>${icon('clock', 34)}</div><b>${cifras.sin_respuesta_nina}</b><span class="muted">temas de clientas sin respuesta del equipo</span></div>
</div>
<h2>Por revisar</h2>${revisarHtml}
<h2>Avisos de clientas</h2>${denunciasHtml}
<h2>Nuevo tema del equipo</h2>
<div class="card"><form method="post" action="/foro/nuevo" style="display:grid;gap:10px;max-width:720px">
<label>Categoría<br><select name="categoria" required style="border:1px solid var(--petalo);border-radius:10px;padding:8px">${opts}</select></label>
<label>Título<br><input name="titulo" required maxlength="120" style="width:100%;border:1px solid var(--petalo);border-radius:10px;padding:10px" placeholder="Por ejemplo: Preséntate y cuéntanos tu rutina favorita"></label>
<label>Mensaje<br><textarea name="cuerpo" required rows="5" style="width:100%;border:1px solid var(--petalo);border-radius:10px;padding:10px;font:14px var(--sans)"></textarea></label>
<label><input type="checkbox" name="fijar" value="1"> Destacarlo arriba del foro</label>
<div><button class="btn" type="submit">Publicar como Equipo Nina</button></div></form></div>
<h2>Temas de ejemplo para arrancar</h2>
<div class="card"><p style="margin:0 0 10px">7 temas con respuestas (2 skincare, 3 perfumes, 1 maquillaje, 1 cabello y cuerpo). Salen firmados como «Nombre · ejemplo» y con la etiqueta «Tema de ejemplo». Bórralos cuando el foro tenga temas reales.</p>
${ejemplos ? `<p class="muted" style="margin:0 0 10px">Ahora hay ${ejemplos} publicados.</p>${boton('/foro/ejemplos', { accion: 'borrar' }, 'Borrar los temas de ejemplo', 'ghost', '¿Borrar todos los temas de ejemplo y sus respuestas?')}` : boton('/foro/ejemplos', { accion: 'crear' }, 'Publicar los temas de ejemplo', '')}</div>
<h2>Temas publicados</h2>${recientesHtml}`;
  return shell('Foro Nina', 'foro', body);
}
