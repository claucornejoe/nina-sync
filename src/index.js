import express from 'express';
import cron from 'node-cron';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import * as db from './db.js';
import { runSync, isRunning } from './sync.js';
import * as views from './views.js';
import * as progress from './progress.js';
import { mountSeo } from './seo/routes.js';

if (!config.panelPassword) throw new Error('Falta PANEL_PASSWORD');
await db.migrate();
await db.closeStaleRuns();

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public'), { maxAge: '7d' }));

// ---- Sesión: cookie firmada con la contraseña del panel ----
const COOKIE = 'nina_sync';
const sign = (v) => crypto.createHmac('sha256', config.panelPassword).update(v).digest('hex');
function readCookie(req) {
  const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [exp, sig] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function auth(req, res, next) {
  if (readCookie(req)) return next();
  res.redirect('/entrar');
}

app.get('/salud', (_req, res) => res.json({ ok: true, running: isRunning() }));

app.get('/entrar', (req, res) => res.send(views.loginPage(req.query.error)));
app.post('/entrar', (req, res) => {
  const given = Buffer.from(String(req.body.password || ''));
  const real = Buffer.from(config.panelPassword);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) return res.redirect('/entrar?error=1');
  const exp = String(Date.now() + 30 * 86400_000);
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(exp + '.' + sign(exp))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`);
  res.redirect('/');
});
app.get('/salir', (_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`);
  res.redirect('/entrar');
});

let task;
app.get('/', auth, async (_req, res) => {
  const runs = await db.listRuns(100);
  const offers = (await db.activeOffers()).length;
  const newArrivals = (await db.activeNewArrivals()).length;
  res.send(views.dashboard({ runs, running: isRunning(), nextRun: nextCronDate(), offers, newArrivals, dryRun: config.dryRun, progress: progress.get() }));
});

app.get('/progreso', auth, (_req, res) => res.json({ running: isRunning(), progress: progress.get() }));

app.post('/sync', auth, (_req, res) => {
  runSync('manual'); // en segundo plano
  setTimeout(() => res.redirect('/'), 800);
});

app.get('/sync/:id.csv', auth, async (req, res) => {
  const data = await db.getRun(Number(req.params.id));
  if (!data) return res.status(404).send('No existe');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="nina-sync-${data.run.id}.csv"`);
  res.send(views.changesCsv(data.changes));
});

app.get('/sync/:id', auth, async (req, res) => {
  const data = await db.getRun(Number(req.params.id));
  if (!data) return res.status(404).send(views.layout('No existe', '<h1>Esa sincronización no existe</h1>'));
  res.send(views.reportHtml(data, { filter: String(req.query.ver || '') }));
});

app.get('/ofertas', auth, async (_req, res) => res.send(views.offersPage(await db.activeOffers())));
await mountSeo(app, auth); // Google y descripciones (categoría + descripción con IA)
app.get('/recien-llegados', auth, async (_req, res) => res.send(views.newArrivalsPage(await db.activeNewArrivals())));

// ---- Automática cada 4 horas ----
task = cron.schedule(config.cron, () => runSync('cron'), { timezone: config.timezone });
function nextCronDate() {
  // Próxima hora múltiplo de 4 (para la expresión por defecto).
  if (config.cron !== '0 */4 * * *') return null;
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const add = 4 - (h % 4);
  const d = new Date(now.getTime() + add * 3600_000);
  d.setMinutes(0, 0, 0);
  return d;
}

app.listen(config.port, () => console.log(`Nina Sync escuchando en el puerto ${config.port} (${config.dryRun ? 'MODO PRUEBA' : 'modo real'})`));
