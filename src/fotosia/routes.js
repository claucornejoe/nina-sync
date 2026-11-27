// Rutas de «Fotos con IA».
import * as store from './store.js';
import { state, runBatch, redo, upload, refs } from './worker.js';
import { fotosPage } from './views.js';
import { magnificKey } from './magnific.js';
import { serpKey } from './source.js';
import { esc } from '../views.js';

const idOf = (s) => { const m = String(s || '').match(/(\d{6,})/); return m ? `gid://shopify/Product/${m[1]}` : null; };
let notice = null;
const safe = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('Fotos IA:', e);
  notice = `<span class="err">Algo falló: ${esc(e.message)}</span>`;
  res.redirect('/fotos-ia');
});

export async function mountFotosIa(app, auth) {
  await store.migrate();

  // Foto de partida servida a Magnific (sin contraseña, con token aleatorio y solo 15 minutos).
  app.get('/fotos-ia/ref/:token', (req, res) => {
    const r = refs.get(req.params.token);
    if (!r) return res.status(404).send('No existe');
    res.type(r.type).send(r.buf);
  });

  app.get('/fotos-ia', auth, safe(async (_req, res) => {
    const n = notice;
    notice = null;
    res.send(fotosPage({ rows: await store.all(), counts: await store.counts(), state, hasKeys: { magnific: !!magnificKey(), serp: !!serpKey() }, notice: n }));
  }));

  app.post('/fotos-ia/probar', auth, safe(async (req, res) => {
    const ids = String(req.body.ids || '').split(/[\s,]+/).map(idOf).filter(Boolean);
    const limit = Math.max(1, Math.min(50, Number(req.body.n) || 10));
    runBatch({ limit, ids }).catch((e) => console.error('Fotos IA:', e.message));
    setTimeout(() => res.redirect('/fotos-ia'), 1500);
  }));

  app.post('/fotos-ia/repetir', auth, safe(async (req, res) => {
    const id = idOf(req.body.id);
    const fuente = /^https?:\/\//.test(req.body.fuente || '') ? req.body.fuente.trim() : '';
    redo(id, fuente).catch((e) => console.error('Fotos IA:', e.message));
    notice = 'Repitiendo la foto. Recarga en un minuto.';
    setTimeout(() => res.redirect('/fotos-ia'), 1500);
  }));

  app.post('/fotos-ia/subir', auth, safe(async (req, res) => {
    await upload(idOf(req.body.id));
    notice = 'Foto subida a Shopify y logo quitado de ese producto.';
    res.redirect('/fotos-ia');
  }));

  app.post('/fotos-ia/subir-todas', auth, safe(async (_req, res) => {
    const ready = (await store.all()).filter((r) => r.status === 'lista');
    let ok = 0;
    const fail = [];
    for (const r of ready) {
      try { await upload(r.product_id); ok++; } catch (e) { fail.push(`${r.title}: ${e.message}`); }
    }
    notice = `Subidas ${ok} fotos.` + (fail.length ? ` <span class="err">${fail.length} fallaron: ${esc(fail.join(' · '))}</span>` : '');
    res.redirect('/fotos-ia');
  }));

  app.post('/fotos-ia/descartar', auth, safe(async (req, res) => {
    await store.set(idOf(req.body.id), { status: 'descartada' });
    res.redirect('/fotos-ia');
  }));
}
