// Rutas de «Google y descripciones»: webhook de Shopify y página del panel.
import express from 'express';
import crypto from 'node:crypto';
import cron from 'node-cron';
import { config } from '../config.js';
import { seo } from './settings.js';
import * as store from './store.js';
import * as sh from './shopify.js';
import { enqueue, sweep, processProduct, queueStatus, isSweeping } from './worker.js';
import { seoPage } from './views.js';
import { aiPaused } from './openai.js';

const WEBHOOK_PATH = '/webhooks/products-create';
const state = { webhook: 'sin comprobar', lastSweep: null, preview: null };

export function verifyHmac(raw, header, secret) {
  if (!header || !secret) return false;
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Lee «gid://shopify/Product/123», «123» o un enlace del admin. */
export function parseProductId(s) {
  const m = String(s || '').match(/(\d{6,})/);
  return m ? `gid://shopify/Product/${m[1]}` : null;
}

export async function mountSeo(app, auth) {
  await store.migrate();

  // Shopify avisa cada vez que se crea un producto (a mano, por CSV o desde Nina Sync).
  app.post(WEBHOOK_PATH, express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || config.shopify.clientSecret;
    if (!verifyHmac(req.body, req.get('X-Shopify-Hmac-Sha256'), secret)) return res.status(401).send('Firma no válida');
    if (req.get('X-Shopify-Shop-Domain') && req.get('X-Shopify-Shop-Domain') !== config.shopify.shop()) return res.status(200).send('Otra tienda');
    res.status(200).send('ok'); // Shopify necesita respuesta rápida
    if (!seo.auto) return;
    try {
      const body = JSON.parse(req.body.toString('utf8'));
      const id = body.admin_graphql_api_id || (body.id && `gid://shopify/Product/${body.id}`);
      if (id) setTimeout(() => enqueue(id, 'webhook'), 5000); // deja a Shopify terminar de guardar la ficha
    } catch (e) {
      console.error('Webhook de producto ilegible:', e.message);
    }
  });

  app.get('/seo', auth, async (_req, res) => {
    const preview = state.preview;
    state.preview = null;
    res.send(
      seoPage({
        rows: await store.recent(150),
        totals: await store.totals(),
        aiToday: await store.aiCallsToday(),
        queue: queueStatus(),
        sweeping: isSweeping(),
        state,
        settings: { aiPaused: aiPaused(), hasKey: !!seo.openaiKey(), model: seo.model, webSearch: seo.webSearch, auto: seo.auto, maxPerDay: seo.maxPerDay, publicUrl: config.publicUrl },
        preview,
      }),
    );
  });

  app.post('/seo/repasar', auth, (_req, res) => {
    sweep('manual')
      .then((r) => (state.lastSweep = { at: new Date(), ...r }))
      .catch((e) => (state.lastSweep = { at: new Date(), error: e.message }));
    setTimeout(() => res.redirect('/seo'), 1500);
  });

  // Un producto: «Ver sin guardar» o «Rehacer y guardar».
  app.post('/seo/producto', auth, async (req, res) => {
    const id = parseProductId(req.body.producto);
    const save = req.body.accion === 'guardar';
    if (!id) {
      state.preview = { error: 'Pega el enlace del producto del admin de Shopify o su número.' };
      return res.redirect('/seo');
    }
    const r = await processProduct(id, { origin: 'manual', preview: !save, forceDescription: true });
    state.preview = { ...r, saved: save };
    res.redirect('/seo');
  });

  if (seo.auto) {
    // Suscripción al webhook (necesita PUBLIC_URL).
    if (config.publicUrl) {
      const uri = config.publicUrl.replace(/\/+$/, '') + WEBHOOK_PATH;
      sh.ensureWebhook(uri)
        .then((r) => (state.webhook = r === 'creado' ? 'activo (recién creado)' : 'activo'))
        .catch((e) => {
          state.webhook = 'error: ' + e.message.slice(0, 200);
          console.error('No se pudo crear el webhook de productos:', e.message);
        });
    } else state.webhook = 'falta PUBLIC_URL';

    const run = (origin) =>
      sweep(origin)
        .then((r) => !r.already && (state.lastSweep = { at: new Date(), ...r }))
        .catch((e) => (state.lastSweep = { at: new Date(), error: e.message }));
    cron.schedule(seo.cron, () => run('repaso'), { timezone: config.timezone });
    setTimeout(() => run('repaso'), 60_000); // primer repaso al minuto de arrancar
  }
}
