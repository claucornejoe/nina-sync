// Rutas de «Fotos con IA».
import * as store from './store.js';
import { state, runBatch, redo, upload, discard, refs, stop, countPending, repairUploaded } from './worker.js';
import { fotosPage, doubtfulCsv, toReview } from './views.js';
import { magnificKey, currentModel } from './magnific.js';
import { searchProvider } from './source.js';
import { esc } from '../views.js';

const idOf = (s) => { const m = String(s || '').match(/(\d{6,})/); return m ? `gid://shopify/Product/${m[1]}` : null; };
let notice = null;
const safe = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('Fotos IA:', e);
  notice = `<span class="err">Algo falló: ${esc(e.message)}</span>`;
  res.redirect('/fotos-ia');
});
const later = (res, to = '/fotos-ia') => setTimeout(() => res.redirect(to), 1500);

export async function mountFotosIa(app, auth) {
  await store.migrate();
  const cut = await store.failInterrupted();
  if (cut) console.log(`Fotos IA: ${cut} fotos se quedaron a medias por un reinicio; quedan como «Error» para repetirlas.`);
  setTimeout(() => repairUploaded().catch((e) => console.error('Fotos IA (repaso de subidas):', e.message)), 30_000).unref?.();

  // Foto de partida servida a Magnific (sin contraseña, con token aleatorio y solo 15 minutos).
  app.get('/fotos-ia/ref/:token', (req, res) => {
    const r = refs.get(req.params.token);
    if (!r) return res.status(404).send('No existe');
    res.type(r.type).send(r.buf);
  });

  app.get('/fotos-ia', auth, safe(async (req, res) => {
    const n = notice;
    notice = null;
    const ver = ['lista', 'dudosa', 'error', 'subida'].includes(req.query.ver) ? req.query.ver : '';
    res.send(fotosPage({
      rows: await store.all(ver), ver, counts: await store.counts(), models: await store.byModel(), state, notice: n,
      keys: { magnific: !!magnificKey(), search: searchProvider() }, model: currentModel(),
    }));
  }));

  app.get('/fotos-ia/dudosas.csv', auth, safe(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nina-fotos-dudosas.csv"');
    res.send(doubtfulCsv(await store.byStatus('dudosa')));
  }));

  app.get('/fotos-ia/revisar.csv', auth, safe(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nina-fotos-subidas-para-mirar.csv"');
    res.send(doubtfulCsv(toReview(await store.byStatus('subida'))));
  }));

  app.post('/fotos-ia/probar', auth, safe(async (req, res) => {
    const ids = String(req.body.ids || '').split(/[\s,]+/).map(idOf).filter(Boolean);
    const limit = Math.max(1, Math.min(50, Number(req.body.n) || 10));
    runBatch({ limit, ids }).catch((e) => console.error('Fotos IA:', e.message));
    later(res);
  }));

  // Todos los que quedan con logo. Con «subir solas» las seguras se suben sin pasar por revisión.
  app.post('/fotos-ia/todos', auth, safe(async (req, res) => {
    runBatch({ limit: Infinity, autoUpload: req.body.subir === 'si' }).catch((e) => console.error('Fotos IA:', e.message));
    later(res);
  }));

  app.post('/fotos-ia/parar', auth, safe(async (_req, res) => {
    stop();
    notice = 'Parando: termina las fotos que ya están en marcha y se detiene.';
    res.redirect('/fotos-ia');
  }));

  app.post('/fotos-ia/contar', auth, safe(async (_req, res) => {
    countPending().catch((e) => console.error('Fotos IA:', e.message));
    notice = 'Contando los productos con logo (tarda un minuto). Recarga la página.';
    later(res);
  }));

  app.post('/fotos-ia/repetir', auth, safe(async (req, res) => {
    const id = idOf(req.body.id);
    const fuente = /^https?:\/\//.test(req.body.fuente || '') ? req.body.fuente.trim() : '';
    redo(id, fuente, { force: req.body.forzar === 'si' }).catch((e) => console.error('Fotos IA:', e.message));
    notice = 'Haciendo la foto. Recarga en un minuto.';
    later(res, '/fotos-ia' + (req.body.ver ? `?ver=${encodeURIComponent(req.body.ver)}` : ''));
  }));

  app.post('/fotos-ia/subir', auth, safe(async (req, res) => {
    await upload(idOf(req.body.id));
    notice = 'Foto subida a Shopify con el nombre del producto, y logo quitado de ese producto.';
    res.redirect('/fotos-ia');
  }));

  app.post('/fotos-ia/subir-todas', auth, safe(async (_req, res) => {
    const ready = await store.byStatus('lista');
    let ok = 0;
    const fail = [];
    for (const r of ready) {
      try { await upload(r.product_id); ok++; } catch (e) { fail.push(`${r.title}: ${e.message}`); }
    }
    notice = `Subidas ${ok} fotos.` + (fail.length ? ` <span class="err">${fail.length} fallaron: ${esc(fail.join(' · '))}</span>` : '');
    res.redirect('/fotos-ia');
  }));

  app.post('/fotos-ia/descartar', auth, safe(async (req, res) => {
    await discard(idOf(req.body.id));
    res.redirect('/fotos-ia' + (req.body.ver ? `?ver=${encodeURIComponent(req.body.ver)}` : ''));
  }));
}
