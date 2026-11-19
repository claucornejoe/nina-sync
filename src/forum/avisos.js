// Correo a Clau cuando hay mensajes del foro por revisar.
import { sendCustomerMail } from '../mail.js';

export async function sendMailTo(to, subject, n, url) {
  const html = `<div style="font-family:Arial,sans-serif;color:#2B2B2B">
<h2 style="color:#F72E75;font-family:Georgia,serif;font-weight:500">Foro Nina</h2>
<p>Hay <b>${n}</b> ${n === 1 ? 'mensaje' : 'mensajes'} de clientas esperando tu revisión.</p>
${url ? `<p><a href="${url}" style="background:#C92F60;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Revisar ahora</a></p>` : ''}
</div>`;
  return sendCustomerMail({ to, subject, html, text: `Hay ${n} mensajes del Foro Nina por revisar. ${url}` });
}
