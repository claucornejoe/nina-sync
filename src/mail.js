import nodemailer from 'nodemailer';
import { config } from './config.js';
import * as db from './db.js';
import { fmtDate, esc } from './views.js';

/** Envía por correo el resumen de una sincronización (solo si hay SMTP configurado y hubo cambios o error). */
export async function sendReport(runId) {
  const m = config.mail;
  if (!m.host || !m.user || !m.pass || !m.to) return;
  const data = await db.getRun(runId);
  if (!data) return;
  const { run, changes } = data;
  if (run.status === 'ok' && changes.length === 0) return;

  const s = run.summary || {};
  const offers = changes.filter((c) => c.on_sale || c.price_drop).slice(0, 30);
  const url = config.publicUrl ? `${config.publicUrl.replace(/\/$/, '')}/sync/${run.id}` : '';
  const subject =
    run.status === 'error'
      ? `Nina Sync: error en la sincronización #${run.id}`
      : `Nina Sync #${run.id}: ${s.stockChanges} stock, ${s.priceChanges} precios, ${s.newOffers} ofertas nuevas`;
  const html = `<div style="font-family:Arial,sans-serif;color:#2B2B2B">
<h2 style="color:#F72E75">Sincronización #${run.id}</h2>
<p>${fmtDate(run.started_at)} · ${run.trigger === 'cron' ? 'automática' : 'manual'}${run.dry_run ? ' · prueba (no se cambió nada)' : ''}</p>
${run.error ? `<p><b>Error:</b> ${esc(run.error)}</p>` : ''}
<ul><li>Cambios de stock: <b>${s.stockChanges ?? 0}</b></li><li>Cambios de precio: <b>${s.priceChanges ?? 0}</b> (bajadas: ${s.priceDrops ?? 0})</li>
<li>Nuevas en «Ofertas de la semana»: <b>${s.newOffers ?? 0}</b></li><li>Retirados por perder dinero: ${s.losingMoney ?? 0}</li></ul>
${offers.length ? `<h3>Ofertas</h3><ul>${offers.map((c) => `<li>${esc(c.product_title)} ${esc(c.variant_title || '')}: ${esc(c.old_value)} → <b>${esc(c.new_value)}</b></li>`).join('')}</ul>` : ''}
${url ? `<p><a href="${url}" style="background:#C92F60;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Ver el informe completo</a></p>` : ''}
</div>`;

  const t = nodemailer.createTransport({ host: m.host, port: m.port, secure: m.port === 465, auth: { user: m.user, pass: m.pass } });
  await t.sendMail({ from: m.from, to: m.to, subject, html });
}
