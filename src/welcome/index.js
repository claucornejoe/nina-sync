// Correo de bienvenida automático: cada 15 minutos busca clientas recién suscritas al correo y les envía
// el correo de bienvenida (cupón BIENVENIDA3, Nina Blog, foro y NinaCash) desde avisos@ninabeauty.es.
// La primera vez solo apunta a las suscriptoras que ya había, sin escribirles (para no mandar el correo a las antiguas).
// BIENVENIDA_ACTIVO=false lo apaga.
import cron from 'node-cron';
import { config } from '../config.js';
import { pool } from '../db.js';
import { gql } from '../shopify.js';
import { sendCustomerMail, mailReady } from '../mail.js';
import { renderWelcomeEmail } from './email.js';

export const active = () => process.env.BIENVENIDA_ACTIVO !== 'false';
export const lastRun = { at: null, sent: 0, note: 'Todavía no se ha revisado' };

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS welcome_sent (
    customer_id TEXT PRIMARY KEY,
    email TEXT,
    sent BOOLEAN NOT NULL DEFAULT false,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

const Q = `query($q: String!, $after: String) {
  customers(first: 100, after: $after, query: $q, sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes { id firstName numberOfOrders
      defaultEmailAddress { emailAddress marketingState marketingUnsubscribeUrl } }
  }
}`;

/** Suscritas de verdad (Shopify a veces devuelve en la búsqueda clientas que ya no lo están). */
export const isSubscribed = (c) => c.defaultEmailAddress?.marketingState === 'SUBSCRIBED' && !!c.defaultEmailAddress.emailAddress;

async function subscribers(sinceIso) {
  const q = `email_subscription_status:SUBSCRIBED${sinceIso ? ` AND updated_at:>'${sinceIso}'` : ''}`;
  const out = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const d = await gql(Q, { q, after });
    out.push(...d.customers.nodes.filter(isSubscribed));
    if (!d.customers.pageInfo.hasNextPage) break;
    after = d.customers.pageInfo.endCursor;
  }
  return out;
}

/** Decide a quién escribir: nuevas (no vistas) y sin pedidos, porque el cupón es solo para la primera compra. */
export function pickNew(customers, seenIds) {
  const seen = new Set(seenIds);
  return customers.filter((c) => !seen.has(c.id));
}

export async function run({ dryRun = config.dryRun } = {}) {
  const res = { at: new Date(), sent: 0, note: '' };
  try {
    if (!active()) return Object.assign(lastRun, res, { note: 'Apagado (BIENVENIDA_ACTIVO=false)' });
    if (!mailReady()) return Object.assign(lastRun, res, { note: 'Falta configurar el correo (SMTP)' });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM welcome_sent');
    const first = rows[0].n === 0;
    const since = first ? null : new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 19) + 'Z';
    const list = await subscribers(since);
    if (first) {
      // Punto de partida: las suscriptoras de hoy quedan apuntadas sin correo.
      for (const c of list) await pool.query('INSERT INTO welcome_sent(customer_id, email, sent) VALUES ($1,$2,false) ON CONFLICT DO NOTHING', [c.id, c.defaultEmailAddress.emailAddress]);
      if (!list.length) await pool.query("INSERT INTO welcome_sent(customer_id, email, sent) VALUES ('inicio', null, false) ON CONFLICT DO NOTHING");
      return Object.assign(lastRun, res, { note: `Punto de partida: ${list.length} suscriptoras antiguas apuntadas sin correo` });
    }
    const seen = (await pool.query('SELECT customer_id FROM welcome_sent WHERE customer_id = ANY($1)', [list.map((c) => c.id)])).rows.map((r) => r.customer_id);
    for (const c of pickNew(list, seen)) {
      const email = c.defaultEmailAddress.emailAddress;
      const withCoupon = Number(c.numberOfOrders || 0) === 0;
      if (withCoupon && !dryRun) {
        const m = renderWelcomeEmail({
          firstName: c.firstName || '',
          storeUrl: config.stockAlerts.storeUrl,
          logoUrl: `${(config.publicUrl || '').replace(/\/$/, '')}/static/logo-correo.png`,
          unsubscribeUrl: c.defaultEmailAddress.marketingUnsubscribeUrl,
        });
        await sendCustomerMail({ to: email, ...m });
        res.sent++;
      }
      // Se apunta también a quien ya había comprado (no se le escribe: el cupón no le valdría).
      if (!dryRun) await pool.query('INSERT INTO welcome_sent(customer_id, email, sent) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [c.id, email, withCoupon]);
    }
    res.note = res.sent ? `Enviados ${res.sent} correos de bienvenida` : 'Sin suscriptoras nuevas';
  } catch (e) {
    res.note = 'Error: ' + e.message;
    console.error('Bienvenida:', e.message);
  }
  return Object.assign(lastRun, res);
}

let busy = false;
export function schedule() {
  cron.schedule(process.env.BIENVENIDA_CRON || '*/15 * * * *', async () => {
    if (busy) return;
    busy = true;
    try { await run(); } finally { busy = false; }
  }, { timezone: config.timezone });
}

export async function mountWelcome(app, auth) {
  await migrate();
  schedule();
  app.get('/bienvenida', auth, (_req, res) => {
    const { html } = renderWelcomeEmail({ firstName: 'Lucía', storeUrl: config.stockAlerts.storeUrl, logoUrl: '/static/logo-correo.png', unsubscribeUrl: '#' });
    const estado = `<div style="font-family:Arial,sans-serif;font-size:13px;padding:10px 16px;background:#2B2B2B;color:#fff">Vista previa del correo de bienvenida · ${active() ? 'activo' : 'apagado'} · última revisión: ${lastRun.at ? lastRun.at.toLocaleString('es-ES', { timeZone: config.timezone }) : '—'} · ${String(lastRun.note).replace(/[<>&]/g, '')}</div>`;
    res.send(html.replace(/(<body[^>]*>)/, `$1${estado}`));
  });
}
