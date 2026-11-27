// Rutas de NinaCash: avisos de Shopify (pedidos y clientas) y página del panel.
import express from 'express';
import cron from 'node-cron';
import { config } from '../config.js';
import { verifyHmac } from '../seo/routes.js';
import { publicBase } from '../seo/settings.js';
import * as store from './store.js';
import * as sh from './shopify.js';
import * as engine from './engine.js';
import * as rules from './rules.js';
import { ninacashPage } from './views.js';
import { migrate as expiryMigrate } from './expiry.js';

const WEBHOOK_PATH = '/webhooks/ninacash';
const TOPICS = ['ORDERS_PAID', 'ORDERS_CANCELLED', 'ORDERS_FULFILLED', 'REFUNDS_CREATE', 'CUSTOMERS_CREATE'];
const hooks = { estado: 'sin comprobar' };
let flash = null;

/** Lee los datos del formulario de cupón. Devuelve { error } o el cupón listo para crear. */
export function parseCouponForm(b, now = new Date()) {
  const code = rules.cleanCode(b.codigo);
  if (code.length < 4) return { error: 'El código necesita al menos 4 letras o números.' };
  const levels = [].concat(b.niveles || []).map(Number).filter((n) => n >= 1 && n <= 4);
  if (!levels.length) return { error: 'Marca al menos un nivel.' };
  const kind = b.tipo === 'euros' ? 'euros' : 'porcentaje';
  const value = Number(String(b.valor || '').replace(',', '.'));
  if (!(value > 0) || (kind === 'porcentaje' && value > 90)) return { error: 'El descuento no es válido (porcentaje entre 1 y 90, o euros mayor que 0).' };
  const minTotal = b.minimo ? Number(String(b.minimo).replace(',', '.')) : null;
  const day = (s, end) => (s ? new Date(`${s}T${end ? '23:59:59' : '00:00:00'}+01:00`) : null);
  const startsAt = day(b.desde) || now;
  const endsAt = day(b.hasta, true) || new Date(startsAt.getTime() + 7 * 86400_000);
  if (endsAt <= startsAt) return { error: 'La fecha de fin tiene que ser posterior a la de inicio.' };
  return { code, text: String(b.texto || '').trim().slice(0, 140), levels: [...new Set(levels)].sort(), kind, value, minTotal: minTotal > 0 ? minTotal : null, startsAt, endsAt };
}

export async function mountLoyalty(app, auth) {
  await store.migrate();
  await expiryMigrate();

  app.post(WEBHOOK_PATH, express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || config.shopify.clientSecret;
    if (!verifyHmac(req.body, req.get('X-Shopify-Hmac-Sha256'), secret)) return res.status(401).send('Firma no válida');
    if (req.get('X-Shopify-Shop-Domain') && req.get('X-Shopify-Shop-Domain') !== config.shopify.shop()) return res.status(200).send('Otra tienda');
    res.status(200).send('ok');
    let body;
    try {
      body = JSON.parse(req.body.toString('utf8'));
    } catch {
      return;
    }
    const topic = String(req.get('X-Shopify-Topic') || '');
    if (topic === 'customers/create') {
      const id = body.admin_graphql_api_id || `gid://shopify/Customer/${body.id}`;
      engine.serial(() => engine.newCustomer(id));
      return;
    }
    const orderId = topic === 'refunds/create' ? `gid://shopify/Order/${body.order_id}` : body.admin_graphql_api_id || `gid://shopify/Order/${body.id}`;
    // Deja a Shopify unos segundos para terminar de guardar el pedido.
    setTimeout(() => engine.serial(() => engine.processOrder(orderId)), 4000);
  });

  app.get('/ninacash', auth, async (_req, res) => {
    const f = flash;
    flash = null;
    res.send(
      ninacashPage({
        active: engine.active(),
        state: engine.state,
        hooks,
        totals: await store.totals(),
        customers: (await store.allCustomers()).slice(0, 100),
        coupons: await store.recentCoupons(30),
        gifts: await store.giftsOfMonth(rules.monthKey()),
        log: await store.recentLog(80),
        flash: f,
      }),
    );
  });

  app.post('/ninacash/repasar', auth, (req, res) => {
    const backfill = req.body.carga === '1';
    engine.serial(() => engine.dailyRun({ backfill }));
    flash = { ok: backfill ? 'Cargando los pedidos de los últimos 12 meses. Recarga la página en un minuto.' : 'Repaso en marcha. Recarga la página en un minuto.' };
    setTimeout(() => res.redirect('/ninacash'), 800);
  });

  app.post('/ninacash/puntos', auth, async (req, res) => {
    const id = String(req.body.cliente || '');
    if (!id.startsWith('gid://shopify/Customer/')) {
      flash = { error: 'Clienta no válida.' };
      return res.redirect('/ninacash#clientas');
    }
    try {
      const r = await engine.givePoints(id, String(req.body.motivo || ''), String(req.body.nota || '').slice(0, 80));
      flash = r.already ? { error: `Ya tenía los puntos de «${r.name}».` } : { ok: `+${r.points} puntos (${r.name}).` };
    } catch (e) {
      flash = { error: e.message.slice(0, 300) };
    }
    res.redirect('/ninacash#clientas');
  });

  app.post('/ninacash/cupon', auth, async (req, res) => {
    const c = parseCouponForm(req.body);
    if (c.error) {
      flash = { error: c.error, form: req.body };
      return res.redirect('/ninacash#cupones');
    }
    try {
      await engine.createCoupon(c);
      flash = { ok: `Cupón ${c.code} creado. Solo funciona para: ${c.levels.map((n) => rules.LEVELS[n - 1].name).join(', ')}.` };
    } catch (e) {
      flash = { error: e.message.replace(/^.*?: /, '').slice(0, 300), form: req.body };
    }
    res.redirect('/ninacash#cupones');
  });

  // Avisos de Shopify, segmentos y envío gratis Butterfly.
  if (publicBase()) {
    const uri = publicBase() + WEBHOOK_PATH;
    (async () => {
      const done = [];
      for (const t of TOPICS) done.push(`${t.toLowerCase().replace('_', '/')}: ${await sh.ensureWebhook(t, uri)}`);
      hooks.estado = 'activos';
      hooks.detalle = done.join(' · ');
    })().catch((e) => {
      hooks.estado = 'error: ' + e.message.slice(0, 300);
      console.error('NinaCash webhooks:', e.message);
    });
  } else hooks.estado = 'falta PUBLIC_URL';

  engine.setup().catch((e) => {
    engine.state.setup = 'error: ' + e.message.slice(0, 300);
    console.error('NinaCash setup:', e.message);
  });

  cron.schedule(process.env.NINACASH_CRON || '30 5 * * *', () => engine.serial(() => engine.dailyRun()), { timezone: config.timezone });
  cron.schedule('5 * * * *', () => engine.serial(() => engine.publishWeeklyCoupons()), { timezone: config.timezone });
}
