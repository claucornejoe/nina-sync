// Página «Escuchar artículo» del panel: voz, créditos de ElevenLabs y audio de cada artículo de Nina Blog.
import { shell, esc, icon } from '../views.js';

const MODELS = [
  ['eleven_multilingual_v2', 'Multilingual v2 · más natural'],
  ['eleven_flash_v2_5', 'Flash v2.5 · mitad de créditos'],
];
const n = (x) => Number(x || 0).toLocaleString('es-ES');
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }) : '');
const isSpanish = (v) => /spanish|español|castilian|spain|peninsular|madrid/i.test(`${v.accent} ${v.language} ${v.name} ${v.description}`) || /^es\b/i.test(v.language);

function voiceOptions(voices, current) {
  const es = voices.filter(isSpanish);
  const rest = voices.filter((v) => !isSpanish(v));
  const opt = (v) => `<option value="${esc(v.id)}" data-nombre="${esc(v.name)}" ${v.id === current ? 'selected' : ''}>${esc(v.name)}${v.accent ? ' · ' + esc(v.accent) : ''}${v.gender ? ' · ' + esc(v.gender === 'female' ? 'mujer' : v.gender === 'male' ? 'hombre' : v.gender) : ''}</option>`;
  return (es.length ? `<optgroup label="En español">${es.map(opt).join('')}</optgroup>` : '') + (rest.length ? `<optgroup label="Otras voces">${rest.map(opt).join('')}</optgroup>` : '');
}

function articleCard(a, { est, running, hasVoice, current }) {
  const num = a.id.split('/').pop();
  const au = a.audio;
  let chip = '<span class="chip prueba">Sin audio</span>';
  if (au && !au.roto) chip = au.hash === est.hash ? '<span class="chip ok">Con audio</span>' : '<span class="chip error">El texto ha cambiado</span>';
  const busy = running && current === a.id;
  return `<div class="card art">
  <div class="cab"><div><b>${esc(a.title)}</b>
    <div class="sub">${a.isPublished ? 'Publicado' : 'Borrador'} · unos ${n(est.chars)} caracteres · ~${est.minutes} min de audio · <a href="https://admin.shopify.com/store/ikwg4h-mk/content/articles/${esc(num)}" target="_blank" rel="noopener">abrir en Shopify</a></div></div>${busy ? '<span class="chip running">Generando…</span>' : chip}</div>
  ${au && au.url ? `<audio controls preload="none" src="${esc(au.url)}"></audio>
  <div class="sub">Voz ${esc(au.voz || au.vozId || '')} · ${esc(au.modelo || '')} · ${fecha(au.fecha)} · ${n(au.frases)} frases con tiempos</div>
  ${au.hash !== est.hash ? '<div class="sub err">Has cambiado el texto desde que se generó: lo que cambió no se resaltará bien. Vuelve a generarlo cuando lo tengas definitivo.</div>' : ''}` : ''}
  <div class="acc">
    <form method="post" action="/audio-blog/generar"><input type="hidden" name="id" value="${esc(a.id)}">
      <button class="btn" ${running || !hasVoice ? 'disabled' : ''}>${icon('sound', 16)} ${au ? 'Volver a generar' : 'Generar audio'} · ~${n(est.credits)} créditos</button></form>
    ${au ? `<form method="post" action="/audio-blog/quitar"><input type="hidden" name="id" value="${esc(a.id)}"><button class="btn ghost" ${running ? 'disabled' : ''}>Quitar audio</button></form>` : ''}
  </div>
</div>`;
}

export function audioPage({ hasKey, voices, voicesError, voiceId, model, sub, articles, state, notice, sampleUrl }) {
  const css = `<style>
.art{margin-top:16px}.art .cab{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.art audio{width:100%;margin:14px 0 6px}
.acc{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;align-items:center}.acc form{margin:0}
.voz{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}.voz select{flex:1;min-width:240px;border:1px solid var(--petalo);border-radius:999px;padding:11px 16px;font:14px var(--sans);background:#fff}
.err{color:var(--rojo)}.sub{font-size:13px;color:var(--gris)}
.barra{height:8px;border-radius:99px;background:var(--petalo-2);overflow:hidden;margin-top:10px}.barra i{display:block;height:100%;background:var(--frambuesa)}
ol.pasos{margin:10px 0 0 18px;padding:0}ol.pasos li{margin:4px 0}
</style>`;
  const left = sub && sub.limit != null ? sub.limit - sub.used : null;
  const credits = sub?.error ? `<p class="sub">No pude leer tus créditos (${esc(sub.error.slice(0, 160))}). Si creaste la clave con permisos limitados, activa también «User → Read».</p>`
    : sub && sub.limit != null ? `<p>Este mes has gastado <b>${n(sub.used)}</b> de <b>${n(sub.limit)}</b> créditos · te quedan <b>${n(left)}</b>${sub.reset ? ` · se renuevan el ${fecha(sub.reset)}` : ''}${sub.tier ? ` · plan ${esc(sub.tier)}` : ''}.</p>
       <div class="barra"><i style="width:${Math.min(100, Math.round((sub.used / Math.max(1, sub.limit)) * 100))}%"></i></div>` : '';
  const body = `${css}
<h1>Escuchar artículo</h1>
<p class="sub">Cada artículo de Nina Blog puede tener su audio con una voz de ElevenLabs. En la tienda sale el botón «Escuchar artículo» y, mientras suena, se resalta en el texto la frase y la palabra que se está leyendo. El audio se genera una sola vez por artículo (gasta créditos solo al pulsar «Generar»); las tarjetas de productos y las fuentes no se leen.</p>
${notice ? `<div class="card" style="margin-top:14px">${notice}</div>` : ''}
${!hasKey ? `<div class="card" style="margin-top:14px"><b>Falta la clave de ElevenLabs.</b><ol class="pasos">
  <li>En ElevenLabs: Developers → API Keys → Create API key (nombre «Nina Sync»).</li>
  <li>En Railway → servicio nina-sync → Variables: añade <code>ELEVENLABS_API_KEY</code> con esa clave.</li>
  <li>Pulsa <b>Deploy</b> en Railway.</li></ol></div>` : ''}
${state.running ? `<div class="card" style="margin-top:14px">${icon('spark', 16)} ${esc(state.title)}: ${esc(state.note)} ${state.total ? `(${state.done} de ${state.total})` : ''} Recarga en un minuto.</div>` : ''}
${!state.running && state.error ? `<div class="card err" style="margin-top:14px">Último intento: ${esc(state.error)}</div>` : ''}
${!state.running && state.ok ? `<div class="card" style="margin-top:14px">${icon('check', 16)} ${esc(state.ok)}</div>` : ''}
${hasKey ? `<div class="card" style="margin-top:14px">
  <b>Voz de Nina Blog</b>
  ${credits}
  ${voicesError ? `<p class="err">No pude leer tus voces: ${esc(voicesError)}</p>` : ''}
  ${voices.length ? `<form method="post" action="/audio-blog/voz" class="voz">
    <select name="voz" aria-label="Voz">${voiceOptions(voices, voiceId)}</select>
    <select name="modelo" aria-label="Modelo">${MODELS.map(([v, l]) => `<option value="${v}" ${v === model ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="btn ghost" name="accion" value="guardar">Guardar</button>
    <button class="btn ghost" name="accion" value="muestra" ${state.running ? 'disabled' : ''}>Escuchar muestra · ~105 créditos</button>
  </form>
  ${sampleUrl ? `<audio controls autoplay src="${esc(sampleUrl)}" style="width:100%;margin-top:12px"></audio>` : ''}
  <p class="sub">Para una voz con acento de España: en ElevenLabs → Voices → Explore, filtra por idioma «Spanish» y acento «Peninsular / Spain», pulsa «Add to my voices» y recarga esta página. ${!voiceId ? '<b>Aún no has elegido voz.</b>' : ''}</p>` : !voicesError ? '<p class="sub">Tu cuenta aún no tiene voces.</p>' : ''}
</div>` : ''}
<h2 style="margin-top:26px">Artículos de Nina Blog</h2>
${articles.length ? articles.map((a) => articleCard(a.article, { est: a.est, running: state.running, hasVoice: hasKey && !!voiceId, current: state.articleId })).join('') : '<p class="sub">No hay artículos.</p>'}`;
  return shell('Escuchar artículo', 'audioblog', body, { refresh: state.running });
}
