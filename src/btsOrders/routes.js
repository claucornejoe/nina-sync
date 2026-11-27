// Panel «Pedidos BTS»: lista de pedidos pagados y botón «Enviar a BTS».
import express from 'express';
import cron from 'node-cron';
import { config } from '../config.js';
import * as store from './store.js';
import { refreshOrders, sendOrder, syncTrackings, lastRefreshInfo } from './engine.js';
import { ordersPage } from './views.js';

let flash = null;
const gid = (n) => `gid://shopify/Order/${String(n).replace(/\D/g, '')}`;
const safe = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error('Pedidos BTS:', e);
    if (!res.headersSent) res.status(500).send('No se pudo cargar: ' + String(e.message || e).replace(/[<>&]/g, ''));
  });

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await refreshOrders();
    await syncTrackings();
  } catch (e) {
    console.error('Pedidos BTS (revisión automática):', e.message);
  } finally {
    busy = false;
  }
}

export async function mountBtsOrders(app, auth) {
  await store.migrate();
  const form = express.urlencoded({ extended: false });

  app.get('/pedidos-bts', auth, safe(async (_req, res) => {
    const [orders, counts] = await Promise.all([store.list(), store.counts()]);
    res.send(ordersPage({ orders, counts, last: lastRefreshInfo(), flash, dryRun: config.dryRun, paymentMethod: config.btsOrders.paymentMethod }));
    flash = null;
  }));

  app.post('/pedidos-bts/revisar', auth, form, safe(async (_req, res) => {
    try {
      const r = await refreshOrders();
      const t = await syncTrackings();
      flash = { ok: true, text: `Revisado: ${r.found} pedidos pagados sin enviar${t.fulfilled ? ` · ${t.fulfilled} con seguimiento nuevo` : ''}.` };
    } catch (e) {
      flash = { ok: false, text: 'No se pudo revisar: ' + e.message };
    }
    res.redirect('/pedidos-bts');
  }));

  app.post('/pedidos-bts/:id/enviar', auth, form, safe(async (req, res) => {
    const id = gid(req.params.id);
    try {
      const r = await sendOrder(id);
      flash = r.payment === 'banktransfer'
        ? { ok: true, text: `Creado en BTS: pedido ${r.order_number} (${r.order_total} €). El monedero no tenía saldo, así que queda pendiente de transferencia: BTS no lo envía hasta recibir el pago.` }
        : { ok: true, text: `Enviado a BTS: pedido ${r.order_number} (${r.order_total} €), pagado con el monedero.` };
    } catch (e) {
      flash = { ok: false, text: e.message };
    }
    res.redirect('/pedidos-bts');
  }));

  app.post('/pedidos-bts/:id/ignorar', auth, form, safe(async (req, res) => {
    const row = await store.get(gid(req.params.id));
    if (row && ['pendiente', 'error'].includes(row.status)) await store.setStatus(row.order_id, 'ignorado');
    res.redirect('/pedidos-bts');
  }));

  app.post('/pedidos-bts/:id/recuperar', auth, form, safe(async (req, res) => {
    const row = await store.get(gid(req.params.id));
    if (row?.status === 'ignorado') await store.setStatus(row.order_id, 'pendiente');
    res.redirect('/pedidos-bts');
  }));

  // Tras un corte de red: Clau comprueba en BTS que el pedido no existe y lo vuelve a dejar listo.
  app.post('/pedidos-bts/:id/reintentar', auth, form, safe(async (req, res) => {
    const row = await store.get(gid(req.params.id));
    if (row?.status === 'revisar') await store.setStatus(row.order_id, 'error');
    res.redirect('/pedidos-bts');
  }));

  cron.schedule(config.btsOrders.cron, tick, { timezone: config.timezone });
  setTimeout(tick, 20_000);
}
