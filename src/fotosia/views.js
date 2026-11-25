// Página «Fotos con IA» del panel.
import { shell, esc, icon } from '../views.js';

const STATUS = {
  pendiente: ['En cola', 'prueba'],
  generando: ['Generando…', 'running'],
  lista: ['Lista para revisar', 'nuevo'],
  error: ['Error', 'error'],
  subida: ['Subida a Shopify', 'ok'],
};
const img = (url, alt) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy"></a>` : '<div class="vacio">—</div>');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function row(r) {
  const [label, cls] = STATUS[r.status] || [r.status, 'prueba'];
  const id = esc(r.product_id);
  const num = r.product_id.split('/').pop();
  const acciones = r.status === 'subida' ? '' : `
    ${r.status === 'lista' ? `<form method="post" action="/fotos-ia/subir"><input type="hidden" name="id" value="${id}"><button class="btn">${icon('check', 16)} Subir a Shopify</button></form>` : ''}
    <form method="post" action="/fotos-ia/repetir" class="otra"><input type="hidden" name="id" value="${id}">
      <input name="fuente" placeholder="Otra foto de partida (enlace, opcional)"><button class="btn ghost">Repetir</button></form>
    <form method="post" action="/fotos-ia/descartar"><input type="hidden" name="id" value="${id}"><button class="btn ghost">Descartar</button></form>`;
  return `<div class="card foto">
  <div class="cab"><div><b>${esc(r.title)}</b><div class="sub">EAN ${esc(r.ean || '—')} · <a href="https://admin.shopify.com/store/ikwg4h-mk/products/${esc(num)}" target="_blank" rel="noopener">abrir en Shopify</a></div></div><span class="chip ${cls}">${label}</span></div>
  <div class="tres">
    <figure>${img(r.before_url, 'Antes')}<figcaption>Ahora en la tienda</figcaption></figure>
    <figure>${img(r.source_url, 'Foto encontrada')}<figcaption>Foto encontrada${r.source_page ? ` · <a href="${esc(r.source_page)}" target="_blank" rel="noopener">${esc(host(r.source_page))}</a>` : ''}</figcaption></figure>
    <figure>${img(r.result_url, 'Nueva con Nano Banana')}<figcaption>Nueva con Nano Banana</figcaption></figure>
  </div>
  ${r.filename ? `<div class="sub">Nombre del archivo: <code>${esc(r.filename)}</code></div>` : ''}
  ${r.error ? `<div class="sub err">${esc(r.error)}</div>` : ''}
  <div class="acc">${acciones}</div>
</div>`;
}

export function fotosPage({ rows, counts, state, hasKeys, notice }) {
  const css = `<style>
.foto{margin-top:18px}.foto .cab{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.tres{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:16px 0 10px}
.tres figure{margin:0}.tres img,.tres .vacio{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--linea);border-radius:14px;display:flex;align-items:center;justify-content:center;color:var(--gris)}
.tres figcaption{font-size:12px;color:var(--gris);margin-top:6px;text-align:center}
.acc{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;align-items:center}.acc form{margin:0}
.otra{display:flex;gap:8px;flex:1;min-width:260px}.otra input,.lote input{flex:1;border:1px solid var(--petalo);border-radius:999px;padding:10px 16px;font:14px var(--sans)}
.lote{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}.lote input[type=number]{max-width:90px;flex:none}
.err{color:var(--rojo)}.sub{font-size:13px;color:var(--gris)}
@media(max-width:720px){.tres{grid-template-columns:1fr 1fr}.tres figure:first-child{display:none}}
</style>`;
  const c = (k) => counts[k] || 0;
  const body = `${css}
<h1>Fotos con IA</h1>
<p class="sub">Para los productos que solo tienen el logo: busca su foto por EAN en Google Imágenes, Nano Banana 2 a 1K (Magnific) la convierte en foto de tienda con fondo blanco sin tocar el frasco ni la etiqueta, y tú decides cuáles se suben. Cada foto gasta créditos de Magnific y una búsqueda de SerpApi.</p>
${notice ? `<div class="card" style="margin-top:14px">${notice}</div>` : ''}
${!hasKeys.magnific || !hasKeys.serp ? `<div class="card" style="margin-top:14px">Falta ${[!hasKeys.magnific && '<code>MAGNIFIC_API_KEY</code>', !hasKeys.serp && '<code>SERPAPI_KEY</code>'].filter(Boolean).join(' y ')} en Railway → Variables (y después pulsa <b>Deploy</b>).</div>` : ''}
<div class="card" style="margin-top:14px">
  <b>${c('lista')}</b> por revisar · <b>${c('subida')}</b> subidas · <b>${c('error')}</b> con error
  ${state.running ? `<p>${icon('spark', 16)} Trabajando: ${state.done} de ${state.total || '…'} ${state.note ? '· ' + esc(state.note) : ''}. Recarga en un minuto.</p>` : ''}
  ${state.stopped ? `<p class="err">Se paró: ${esc(state.stopped)}</p>` : ''}
  <form method="post" action="/fotos-ia/probar" class="lote">
    <span>Probar con</span><input type="number" name="n" value="10" min="1" max="50"><span>productos sin foto</span>
    <button class="btn" ${state.running || !hasKeys.magnific ? 'disabled' : ''}>Empezar</button>
  </form>
  <form method="post" action="/fotos-ia/probar" class="lote">
    <input name="ids" placeholder="O pega enlaces/números de productos concretos, separados por espacios">
    <button class="btn ghost" ${state.running || !hasKeys.magnific ? 'disabled' : ''}>Hacer estos</button>
  </form>
  ${c('lista') > 1 ? `<form method="post" action="/fotos-ia/subir-todas" class="lote"><button class="btn ghost">Subir las ${c('lista')} que están listas</button></form>` : ''}
</div>
${rows.map(row).join('') || '<p class="sub" style="margin-top:18px">Aún no hay fotos. Pulsa «Empezar».</p>'}`;
  return shell('Fotos con IA', 'fotosia', body, { refresh: state.running });
}
