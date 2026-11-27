// Correo a Clau cuando hay mensajes del foro por revisar.
import { sendCustomerMail } from '../mail.js';

export async function sendMailTo(to, subject, n, url, tipo = 'revisar') {
  const frase =
    tipo === 'alerta'
      ? `Hay <b>${n}</b> ${n === 1 ? 'respuesta publicada' : 'respuestas publicadas'} en el foro con posibles palabrotas o insultos. Míralas y ocúltalas si hace falta.`
      : `Hay <b>${n}</b> ${n === 1 ? 'mensaje' : 'mensajes'} de clientas esperando tu revisión.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#2B2B2B">
<h2 style="color:#F72E75;font-family:Georgia,serif;font-weight:500">Foro Nina</h2>
<p>${frase}</p>
${url ? `<p><a href="${url}" style="background:#C92F60;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Revisar ahora</a></p>` : ''}
</div>`;
  return sendCustomerMail({ to, subject, html, text: `${frase.replace(/<[^>]+>/g, '')} ${url}` });
}
