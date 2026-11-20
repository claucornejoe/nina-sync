// Rutas de la pestaña «Competencia».
import cron from 'node-cron';
import { config } from '../config.js';
import * as store from './store.js';
import { comp, classify } from './engine.js';
import { state, budget, runCheck, decorate, applyAdjustments, removeOverride } from './worker.js';
import { competitionPage, reviewPage, competitionCsv } from './views.js';
import { esc } from '../views.js';

const eans = (body) => [].concat(body?.ean || []).map(String).filter((e) => /^\d{6,14}$/.test(e));
const safe = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('Competencia:', e);
  res.status(500).send(`<p>Algo falló: ${esc(e.message)}</p><p><a href="/competencia">Volver</a></p>`);
});

let notice = null;

export async function mountCompetition(app, auth) {
  await store.migrate();
  const rows = async () => decorate(await store.rows(), config.rules, (p, m) => classify(p, m));

  app.get('/competencia', auth, safe(async (req, res) => {
    const n = notice;
    notice = null;
    res.send(competitionPage({ rows: await rows(), ver: String(req.query.ver || ''), budget: await budget(), state, notice: n, hasKey: !!comp.serpKey() }));
  }));

  app.get('/competencia.csv', auth, safe(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nina-competencia.csv"');
    res.send(competitionCsv(await rows()));
  }));

  app.post('/competencia/buscar', auth, safe(async (_req, res) => {
    runCheck({ limit: 25, trigger: 'manual' }).catch((e) => console.error('Competencia:', e.message));
    setTimeout(() => res.redirect('/competencia'), 800);
  }));

  // Paso 1: Clau revisa la lista. No cambia nada.
  app.post('/competencia/revisar', auth, safe(async (req, res) => {
    const want = new Set(eans(req.body));
    const items = (await rows()).filter((x) => want.has(x.ean) && x.suggestion?.newPrice);
    if (!items.length) {
      notice = 'No has marcado ningún producto que se pueda ajustar.';
      return res.redirect('/competencia');
    }
    res.send(reviewPage(items, { dryRun: config.dryRun }));
  }));

  // Paso 2: confirmado, se cambian los precios en Shopify.
  app.post('/competencia/aplicar', auth, safe(async (req, res) => {
    const out = await applyAdjustments(eans(req.body), config.rules);
    notice = `${out.dryRun ? '<b>Modo prueba:</b> se habrían ajustado' : 'Ajustados'} ${out.applied.length} precios.` +
      (out.skipped.length ? ` ${out.skipped.length} no se tocaron (${[...new Set(out.skipped.map((s) => s.why))].map(esc).join('; ')}).` : '');
    res.redirect('/competencia?ver=ajustados');
  }));

  app.post('/competencia/quitar', auth, safe(async (req, res) => {
    for (const e of eans(req.body)) await removeOverride(e);
    notice = 'Ajuste quitado: el precio vuelve a la fórmula en la próxima sincronización.';
    res.redirect('/competencia?ver=ajustados');
  }));

  // Cada día: gasta la parte del presupuesto del mes que le toca.
  cron.schedule(comp.cron, () => {
    if (comp.auto() && comp.serpKey()) runCheck({ trigger: 'cron' }).catch((e) => console.error('Competencia:', e.message));
  }, { timezone: config.timezone });
}
