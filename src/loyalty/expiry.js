// Avisos de NinaCash a punto de caducar: correo 30 y 7 días antes + aviso en Mi cuenta y en el carrito.
import { sendCustomerMail, mailReady } from '../mail.js';
import { pool } from '../db.js';
import { gql } from '../shopify.js';
import { esc } from '../views.js';
import * as store from './store.js';

const SHOP_URL = (process.env.SHOP_URL || 'https://www.ninabeauty.es').replace(/\/$/, '');
const send = sendCustomerMail; // remitente avisos@ninabeauty.es (MAIL_FROM), cuenta SMTP compartida

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS nc_reminders (
    customer_id TEXT NOT NULL, expires_on TEXT NOT NULL, stage INT NOT NULL, amount NUMERIC, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_id, expires_on, stage))`);
}

const eur = (x) => `${Number(x).toFixed(2).replace('.', ',')} €`;
const fecha = (iso) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(new Date(iso));

/** Saldos con fecha de caducidad que aún quedan, agrupados por día (el más próximo primero). */
export function groupExpiring(transactions, now = new Date(), withinDays = 30) {
  const limit = now.getTime() + withinDays * 86400_000;
  const byDay = new Map();
  for (const t of transactions) {
    if (!t?.expiresAt) continue;
    const left = Number(t.remainingAmount?.amount || 0);
    const at = new Date(t.expiresAt).getTime();
    if (left <= 0 || at <= now.getTime() || at > limit) continue;
    const day = t.expiresAt.slice(0, 10);
    byDay.set(day, Math.round(((byDay.get(day) || 0) + left) * 100) / 100);
  }
  return [...byDay].sort((a, b) => a[0].localeCompare(b[0])).map(([day, amount]) => ({ day, amount, days: Math.ceil((new Date(day + 'T23:59:59Z') - now) / 86400_000) }));
}

/** Qué aviso toca: 30 (entre 30 y 8 días) o 7 (7 días o menos). */
export const stageFor = (days) => (days <= 7 ? 7 : days <= 30 ? 30 : null);

async function getCredits(customerId) {
  const d = await gql(
    `query($id: ID!) { customer(id: $id) { id firstName defaultEmailAddress { emailAddress }
      storeCreditAccounts(first: 5) { nodes { balance { currencyCode } transactions(first: 100) { nodes {
        ... on StoreCreditAccountCreditTransaction { expiresAt remainingAmount { amount } } } } } } } }`,
    { id: customerId },
  );
  const c = d.customer;
  if (!c) return null;
  const tx = (c.storeCreditAccounts?.nodes || []).filter((a) => a.balance.currencyCode === 'EUR').flatMap((a) => a.transactions.nodes);
  return { email: c.defaultEmailAddress?.emailAddress, name: c.firstName, tx };
}

export function reminderEmail({ name, amount, day, stage }) {
  const hola = name ? `Hola, ${esc(name)}:` : 'Hola:';
  const subject = stage === 7 ? `Tus ${eur(amount)} de NinaCash caducan en unos días` : `Tienes ${eur(amount)} de NinaCash para gastar`;
  const line = stage === 7
    ? `Te quedan <b>${eur(amount)}</b> de NinaCash que caducan el <b>${fecha(day)}</b>. ¡Aún estás a tiempo!`
    : `Tienes <b>${eur(amount)}</b> de NinaCash que caducan el <b>${fecha(day)}</b>. Úsalos en tu próxima compra y date un capricho.`;
  const html = `<div style="background:#FFF1F4;padding:28px 12px;font-family:Montserrat,Arial,sans-serif;color:#2B2B2B">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:22px;padding:32px 28px;text-align:center">
 <div style="font-family:Georgia,serif;font-size:34px;color:#F72E75;margin:0 0 2px">Nina</div><div style="font-size:11px;letter-spacing:.4em;color:#6E6E6E;margin:0 0 22px">BEAUTY</div>
 <p style="font-size:15px;text-align:left;margin:0 0 12px">${hola}</p>
 <p style="font-size:15px;text-align:left;line-height:1.55;margin:0 0 22px">${line}</p>
 <div style="background:#FFCCD5;border-radius:16px;padding:18px;margin:0 0 22px"><div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#C92F60">Tu NinaCash</div><div style="font-family:Georgia,serif;font-size:36px;color:#C92F60">${eur(amount)}</div><div style="font-size:13px">caduca el ${fecha(day)}</div></div>
 <a href="${SHOP_URL}" style="display:inline-block;background:#C92F60;color:#fff;text-decoration:none;border-radius:999px;padding:14px 28px;font-weight:600">Ir a la tienda</a>
 <p style="font-size:12px;color:#6E6E6E;line-height:1.5;margin:22px 0 0">Para usarlo, inicia sesión con tu cuenta Nina y, al pagar, elige usar tu saldo NinaCash. <a href="${SHOP_URL}/pages/ninacash" style="color:#C92F60">Condiciones</a></p>
</div></div>`;
  const text = `${name ? `Hola, ${name}:` : 'Hola:'}\n\nTienes ${eur(amount)} de NinaCash que caducan el ${fecha(day)}. Inicia sesión en ${SHOP_URL} y, al pagar, elige usar tu saldo NinaCash.\n\nCondiciones: ${SHOP_URL}/pages/ninacash`;
  return { subject, html, text };
}

/** Repaso diario: aviso en Mi cuenta (metacampo nina.ninacash_caduca) y correos 30 y 7 días antes. */
export async function checkExpiring({ active, setMetafields, log }) {
  const r = { checked: 0, sent: 0, skipped: 0 };
  const customers = (await store.allCustomers()).filter((c) => Number(c.balance) > 0);
  for (const c of customers) {
    r.checked++;
    const info = await getCredits(c.customer_id);
    if (!info) continue;
    const soon = groupExpiring(info.tx);
    if (active) {
      const first = soon[0];
      await setMetafields([{ ownerId: c.customer_id, key: 'ninacash_caduca', type: 'json', value: JSON.stringify(first ? { importe: first.amount, fecha: first.day } : {}) }]);
    }
    for (const s of soon) {
      const stage = stageFor(s.days);
      const done = await pool.query('SELECT 1 FROM nc_reminders WHERE customer_id=$1 AND expires_on=$2 AND stage<=$3', [c.customer_id, s.day, stage]);
      if (done.rowCount) continue;
      if (!active || !mailReady() || !info.email) {
        r.skipped++;
        continue;
      }
      const mail = reminderEmail({ name: info.name, amount: s.amount, day: s.day, stage });
      await send({ to: info.email, ...mail });
      await pool.query('INSERT INTO nc_reminders(customer_id, expires_on, stage, amount) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [c.customer_id, s.day, stage, s.amount]);
      await log({ customerId: c.customer_id, kind: 'caduca', amount: s.amount, note: `Aviso ${stage} días antes: caduca el ${s.day}` });
      r.sent++;
    }
  }
  return r;
}
