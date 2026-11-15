// «Agotado · Avísame»: la tienda guarda aquí el correo de la clienta y el panel muestra las solicitudes.
import express from 'express';
import { config } from '../config.js';
import { gql } from '../shopify.js';
import { mailReady, sendCustomerMail } from '../mail.js';
import * as store from './store.js';
import { notifyRestocked, fetchVariants, emailFor, lastRun } from './notify.js';
import { avisosPage } from './views.js';

// Texto exacto que acepta la clienta en el formulario (se guarda con cada solicitud).
export const CONSENT_TEXT = 'Acepto que Nina Beauty use mi correo solo para avisarme una vez cuando este producto vuelva a estar disponible.';
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

/** Valida lo que envía el formulario. Devuelve { error } o { email, variantId }. */
export function parseAlertRequest(b = {}) {
  if (b.website) return { error: 'spam', silent: true }; // campo trampa invisible: lo rellenan los robots
  const email = String(b.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return { error: 'Revisa tu correo: parece que falta algo.' };
  if (!(b.consent === true || b.consent === 'true' || b.consent === 'on' || b.consent === '1')) return { error: 'Marca la casilla para que podamos avisarte.' };
  const num = String(b.variant_id || '').replace(/^gid:\/\/shopify\/ProductVariant\//, '');
  if (!/^\d{1,20}$/.test(num)) return { error: 'No encontramos ese producto.' };
  return { email, variantId: `gid://shopify/ProductVariant/${num}` };
}

// Límite sencillo por IP: 10 solicitudes por hora.
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3600_000)) hits.delete(k);
  return list.length > 10;
}

let flash = null;

// Express 4 no recoge los errores de funciones async: sin esto, un fallo de Shopify tumbaría el panel entero.
const safe = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error('Avisos de stock:', e);
    if (!res.headersSent) res.status(500).send('No se pudo cargar: ' + String(e.message || e).replace(/[<>&]/g, ''));
  });

export async function mountStockAlerts(app, auth) {
  await store.migrate();
  const r = config.stockAlerts;

  // ---- Público: lo llama el formulario de la tienda ----
  const cors = (req, res, next) => {
    const origin = req.get('Origin');
    if (origin && r.origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
  app.options('/api/avisame', cors);
  app.post('/api/avisame', cors, express.json({ limit: '4kb' }), async (req, res) => {
    const origin = req.get('Origin');
    if (origin && !r.origins.includes(origin)) return res.status(403).json({ ok: false, error: 'Origen no permitido' });
    if (tooMany(req.ip)) return res.status(429).json({ ok: false, error: 'Demasiados intentos. Prueba otra vez en un rato.' });
    const p = parseAlertRequest(req.body);
    if (p.silent) return res.json({ ok: true });
    if (p.error) return res.status(400).json({ ok: false, error: p.error });
    try {
      const v = (await fetchVariants([p.variantId])).get(p.variantId);
      if (!v || v.product.status !== 'ACTIVE') return res.status(404).json({ ok: false, error: 'No encontramos ese producto.' });
      if (v.inventoryQuantity > 0) return res.json({ ok: false, available: true, error: '¡Buenas noticias! Ya está disponible: recarga la página.' });
      if ((await store.pendingCount(p.email)) >= 20) return res.status(429).json({ ok: false, error: 'Ya tienes muchos avisos pendientes con este correo.' });
      await store.add({
        email: p.email,
        variantId: v.id,
        productId: v.product.id,
        productTitle: v.product.title,
        variantTitle: /default title/i.test(v.title) ? '' : v.title,
        consent: CONSENT_TEXT,
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('Avísame:', e.message);
      res.status(500).json({ ok: false, error: 'No hemos podido guardarlo. Prueba otra vez en un momento.' });
    }
  });

  // ---- Panel ----
  app.get('/avisos', auth, safe(async (_req, res) => {
    const [stats, pending, sent] = await Promise.all([store.stats(), store.pendingByVariant(), store.recentSent(30)]);
    res.send(avisosPage({ stats, pending, sent, lastRun, mailOk: mailReady(), dryRun: config.dryRun, flash }));
    flash = null;
  }));

  app.post('/avisos/revisar', auth, safe(async (_req, res) => {
    const out = await notifyRestocked({ dryRun: config.dryRun });
    flash = { ok: !/error|rechaz/i.test(out.note), text: out.note };
    res.redirect('/avisos');
  }));

  // Vista previa del correo con un producto real (el más pedido, o uno cualquiera).
  async function sampleVariant() {
    const top = (await store.pendingByVariant(1))[0];
    if (top) {
      const v = (await fetchVariants([top.variant_id])).get(top.variant_id);
      if (v) return v;
    }
    const d = await gql(`{ productVariants(first: 1, query: "product_status:active") { nodes { id } } }`);
    const id = d?.productVariants?.nodes?.[0]?.id;
    return id ? (await fetchVariants([id])).get(id) : null;
  }
  app.get('/avisos/ejemplo', auth, safe(async (_req, res) => {
    const v = await sampleVariant();
    if (!v) return res.send('No hay productos en la tienda para el ejemplo.');
    res.send(emailFor({ ...v, inventoryQuantity: Math.min(v.inventoryQuantity, 3) || 3 }).html);
  }));

  app.post('/avisos/prueba', auth, safe(async (_req, res) => {
    const to = config.mail.to || config.mail.user;
    try {
      const v = await sampleVariant();
      if (!v) throw new Error('No hay productos para el ejemplo');
      const m = emailFor({ ...v, inventoryQuantity: 3 });
      await sendCustomerMail({ to, ...m, subject: '[Prueba] ' + m.subject });
      flash = { ok: true, text: `Correo de prueba enviado a ${to}` };
    } catch (e) {
      flash = { ok: false, text: 'No se pudo enviar: ' + e.message };
    }
    res.redirect('/avisos');
  }));

  // Derecho de supresión: borrar un correo de todos los avisos pendientes.
  app.post('/avisos/borrar', auth, safe(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const n = email ? await store.forgetEmail(email) : 0;
    flash = { ok: true, text: n ? `Borrado: ${n} avisos de ${email}` : 'Ese correo no tenía avisos pendientes' };
    res.redirect('/avisos');
  }));
}
