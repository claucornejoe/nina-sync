// Foro Nina: páginas públicas (vía proxy de aplicación de Shopify en /apps/foro) y moderación en el panel.
import express from 'express';
import { config } from '../config.js';
import { gql } from '../shopify.js';
import { mailReady } from '../mail.js';
import { sendMailTo } from './avisos.js';
import * as store from './store.js';
import * as rules from './rules.js';
import * as tienda from './tienda.js';
import { foroPage } from './panel.js';
import { EJEMPLOS } from './ejemplos.js';

const { BASE } = tienda;
const PROXY = '/proxy/foro';
export const ajustes = {
  modo: () => (process.env.FORO_MODERACION === 'confianza' ? 'confianza' : 'previa'),
  minConfianza: () => Number(process.env.FORO_CONFIANZA_MIN || 2),
  umbralDenuncias: () => Number(process.env.FORO_DENUNCIAS_OCULTAR || 3),
  porPagina: 15,
  maxTemasDia: 5,
  maxRespuestasDia: 30,
};
const estado = { ultimaVisita: null, firmasMalas: 0 };
const secreto = () => process.env.SHOPIFY_PROXY_SECRET || config.shopify.clientSecret || '';
let flash = null;

const safe = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error('Foro:', e);
    if (res.headersSent) return;
    if (req.originalUrl.startsWith(PROXY)) return liquid(res, tienda.noEncontrado(), 500);
    res.status(500).send('No se pudo cargar: ' + String(e.message || e).replace(/[<>&]/g, ''));
  });
function liquid(res, html, status = 200) {
  res.status(status).set('Content-Type', 'application/liquid; charset=utf-8').set('Cache-Control', 'no-store').send(html);
}
const ir = (res, ruta) => res.redirect(303, ruta);

// Nombre de la clienta en Shopify (para proponer «Laura M.»), en memoria una hora.
const nombres = new Map();
async function nombreSugerido(clienteId) {
  const c = nombres.get(clienteId);
  if (c && c.hasta > Date.now()) return c.v;
  let v = '';
  try {
    const d = await gql(`query($id: ID!) { customer(id: $id) { firstName lastName } }`, { id: `gid://shopify/Customer/${clienteId}` });
    v = rules.apodoPorDefecto(d?.customer?.firstName, d?.customer?.lastName);
  } catch (e) {
    console.error('Foro: no se pudo leer el nombre de la clienta:', e.message);
  }
  nombres.set(clienteId, { v, hasta: Date.now() + 3600_000 });
  return v;
}

// Aviso por correo a Clau cuando hay mensajes por revisar (como mucho uno cada 30 minutos).
let ultimoAviso = 0;
async function avisarPendientes() {
  if (!mailReady() || !config.mail.to || Date.now() - ultimoAviso < 30 * 60_000) return;
  ultimoAviso = Date.now();
  const { pendientes } = await store.cifras();
  if (!pendientes) return;
  const url = config.publicUrl ? `${config.publicUrl.replace(/\/$/, '')}/foro` : '';
  await sendMailTo(config.mail.to, `Foro Nina: ${pendientes} ${pendientes === 1 ? 'mensaje' : 'mensajes'} por revisar`, pendientes, url).catch((e) => console.error('Foro: correo de aviso:', e.message));
}

/** Datos comunes de la clienta conectada (o null si no ha iniciado sesión). */
async function sesionDe(req) {
  const id = req.clienteId;
  if (!id) return { sesion: false, perfil: null, sugerido: '', token: '' };
  const [perfil, sugerido] = await Promise.all([store.perfil(id), nombreSugerido(id)]);
  return { sesion: true, perfil, sugerido, token: rules.tokenForm(id, secreto()) };
}

/** Comprueba sesión, token, trampa y bloqueo antes de guardar. Devuelve un código de error o null. */
async function puedeEscribir(req, ses) {
  if (req.body.web) return 'trampa';
  if (!ses.sesion) return 'sesion';
  if (!rules.tokenValido(req.body.token, req.clienteId, secreto())) return 'sesion';
  if (ses.perfil?.bloqueada) return 'bloqueada';
  return null;
}
/** Guarda o actualiza el apodo y la aceptación de normas. Devuelve { error } o { apodo }. */
async function perfilDesdeForm(req, ses) {
  const a = rules.validarApodo(req.body.apodo || ses.perfil?.apodo || ses.sugerido);
  if (a.error) return a;
  const acepta = req.body.acepto === '1' || req.body.acepto === 'on';
  if (!ses.perfil?.acepto_normas_at && !acepta) return { error: 'Marca la casilla de las normas y la privacidad para poder publicar.' };
  await store.guardarPerfil(req.clienteId, a.apodo, acepta);
  return a;
}

export async function mountForum(app, auth) {
  await store.migrate();

  // ---------- Público (lo sirve Shopify en /apps/foro) ----------
  const proxy = express.Router();
  proxy.use((req, res, next) => {
    const q = rules.leerQuery(req.originalUrl.split('?')[1]);
    if (!rules.verificarProxy(q, secreto())) {
      estado.firmasMalas++;
      return res.status(401).send('Esta página solo se puede ver desde la tienda de Nina Beauty.');
    }
    if (q.shop && q.shop !== config.shopify.shop()) return res.status(403).send('Otra tienda');
    estado.ultimaVisita = new Date();
    const id = String(q.logged_in_customer_id || '');
    req.clienteId = /^\d{1,20}$/.test(id) ? id : null;
    next();
  });
  proxy.use(express.urlencoded({ extended: false, limit: '20kb' }));

  async function verPortada(req, res, extra = {}) {
    const cat = rules.categoria(String(req.query.c || ''))?.id || null;
    const pagina = Math.max(1, Math.min(500, Number(req.query.p) || 1));
    const buscar = rules.limpiar(req.query.q, 80).replace(/\n/g, ' ');
    const [{ temas, total }, ses] = await Promise.all([
      store.temasPublicados({ categoria: cat, limite: ajustes.porPagina, offset: (pagina - 1) * ajustes.porPagina, buscar }),
      sesionDe(req),
    ]);
    liquid(res, tienda.portada({ temas, total, pagina, porPagina: ajustes.porPagina, catActual: cat, buscar, ...ses, ok: req.query.ok, ...extra }));
  }
  async function verTema(req, res, id, extra = {}) {
    const tema = await store.tema(id);
    if (!tema || tema.estado !== 'publicado') return liquid(res, tienda.noEncontrado(), 404);
    const [respuestas, ses] = await Promise.all([store.respuestasPublicadas(tema.id), sesionDe(req)]);
    const url = `${config.stockAlerts.storeUrl}${BASE}/${rules.rutaTema(tema)}`;
    liquid(res, tienda.paginaTema({ tema, respuestas, ...ses, ok: req.query.ok, url, ...extra }));
  }

  proxy.get('/', safe((req, res) => verPortada(req, res)));
  proxy.get('/normas', safe(async (_req, res) => liquid(res, tienda.normas())));
  proxy.get('/t/:ruta', safe((req, res) => {
    const id = rules.idDeRuta(req.params.ruta);
    return id ? verTema(req, res, id) : liquid(res, tienda.noEncontrado(), 404);
  }));
  // Últimos temas en JSON, para el Nina Blog (fetch desde la propia tienda).
  proxy.get('/ultimos.json', safe(async (_req, res) => {
    const { temas } = await store.temasPublicados({ limite: 6 });
    res.set('Cache-Control', 'public, max-age=300').json({
      temas: temas.map((x) => ({
        titulo: x.titulo,
        url: `${BASE}/${rules.rutaTema(x)}`,
        categoria: rules.categoria(x.categoria)?.nombre || x.categoria,
        autor: x.equipo ? 'Equipo Nina' : x.ejemplo ? `${x.autor} · ejemplo` : x.autor,
        ejemplo: x.ejemplo,
        equipo: x.equipo,
        respuestas: x.respuestas,
        extracto: x.cuerpo.slice(0, 180),
      })),
    });
  }));

  proxy.post('/nuevo', safe(async (req, res) => {
    const ses = await sesionDe(req);
    const no = await puedeEscribir(req, ses);
    if (no === 'trampa') return ir(res, `${BASE}?ok=enviado`);
    if (no) return verPortada(req, res, { ok: no });
    const v = rules.validarTema(req.body);
    const valores = { categoria: req.body.categoria, titulo: req.body.titulo, cuerpo: req.body.cuerpo };
    if (v.error) return verPortada(req, res, { error: v.error, valores });
    const p = await perfilDesdeForm(req, ses);
    if (p.error) return verPortada(req, res, { error: p.error, valores });
    if ((await store.enviadosHoy(req.clienteId)).temas >= ajustes.maxTemasDia) return verPortada(req, res, { ok: 'limite' });
    const d = rules.decidirEstado({ texto: `${v.titulo}\n${v.cuerpo}`, modo: ajustes.modo(), aprobados: await store.publicadosDe(req.clienteId), minConfianza: ajustes.minConfianza() });
    const tema = await store.crearTema({ ...v, clienteId: req.clienteId, autor: p.apodo, estado: d.estado, motivo: d.motivo });
    if (d.estado === 'publicado') return ir(res, `${BASE}/${rules.rutaTema(tema)}?ok=publicado`);
    avisarPendientes();
    ir(res, `${BASE}?ok=enviado`);
  }));

  proxy.post('/responder', safe(async (req, res) => {
    const id = Number(req.body.tema);
    const tema = Number.isInteger(id) ? await store.tema(id) : null;
    if (!tema || tema.estado !== 'publicado') return liquid(res, tienda.noEncontrado(), 404);
    const ses = await sesionDe(req);
    const no = await puedeEscribir(req, ses);
    const volver = `${BASE}/${rules.rutaTema(tema)}`;
    if (no === 'trampa') return ir(res, `${volver}?ok=respuesta`);
    if (no) return verTema(req, res, tema.id, { ok: no });
    const v = rules.validarRespuesta(req.body);
    if (v.error) return verTema(req, res, tema.id, { error: v.error, valores: { cuerpo: req.body.cuerpo } });
    const p = await perfilDesdeForm(req, ses);
    if (p.error) return verTema(req, res, tema.id, { error: p.error, valores: { cuerpo: req.body.cuerpo } });
    if ((await store.enviadosHoy(req.clienteId)).respuestas >= ajustes.maxRespuestasDia) return verTema(req, res, tema.id, { ok: 'limite' });
    const d = rules.decidirEstado({ texto: v.cuerpo, modo: ajustes.modo(), aprobados: await store.publicadosDe(req.clienteId), minConfianza: ajustes.minConfianza() });
    const r = await store.crearRespuesta({ temaId: tema.id, cuerpo: v.cuerpo, clienteId: req.clienteId, autor: p.apodo, estado: d.estado, motivo: d.motivo });
    if (d.estado === 'publicado') return ir(res, `${volver}?ok=respondido#r${r.id}`);
    avisarPendientes();
    ir(res, `${volver}?ok=respuesta#responder`);
  }));

  const volverSeguro = (s) => (typeof s === 'string' && s.startsWith(`${BASE}/`) && !s.includes('//', 1) ? s : BASE);
  proxy.post('/ayuda', safe(async (req, res) => {
    const ses = await sesionDe(req);
    const tipo = req.body.tipo === 'respuesta' ? 'respuesta' : 'tema';
    const id = Number(req.body.id);
    if (!(await puedeEscribir(req, ses)) && Number.isInteger(id)) await store.votar(tipo, id, req.clienteId);
    ir(res, `${volverSeguro(req.body.volver)}${tipo === 'respuesta' ? `#r${id}` : ''}`);
  }));
  proxy.post('/denunciar', safe(async (req, res) => {
    const ses = await sesionDe(req);
    const tipo = req.body.tipo === 'respuesta' ? 'respuesta' : 'tema';
    const id = Number(req.body.id);
    const motivo = rules.limpiar(req.body.motivo, 60);
    if (!(await puedeEscribir(req, ses)) && Number.isInteger(id)) {
      await store.denunciar(tipo, id, req.clienteId, motivo, ajustes.umbralDenuncias());
      avisarPendientes();
    }
    const v = volverSeguro(req.body.volver);
    ir(res, `${v}?ok=denuncia`);
  }));
  app.use(PROXY, proxy);

  // ---------- Panel: moderación ----------
  app.get('/foro', auth, safe(async (_req, res) => {
    const [revisar, denuncias, recientes, cifras, ejemplos] = await Promise.all([store.porRevisar(), store.denunciados(), store.recientes(40), store.cifras(), store.hayEjemplos()]);
    res.send(foroPage({ revisar, denuncias, recientes, cifras, ejemplos, estado, ajustes: { modo: ajustes.modo(), minConfianza: ajustes.minConfianza(), umbral: ajustes.umbralDenuncias() }, proxyUrl: config.publicUrl ? `${config.publicUrl.replace(/\/$/, '')}${PROXY}` : '', tiendaUrl: `${config.stockAlerts.storeUrl}${BASE}`, flash }));
    flash = null;
  }));
  const tipoDe = (s) => (s === 'respuesta' ? 'respuesta' : 'tema');
  app.post('/foro/estado', auth, safe(async (req, res) => {
    const est = ['publicado', 'rechazado', 'pendiente'].includes(req.body.estado) ? req.body.estado : 'pendiente';
    const row = await store.cambiarEstado(tipoDe(req.body.tipo), Number(req.body.id), est);
    flash = row ? { ok: true, text: est === 'publicado' ? 'Publicado.' : est === 'rechazado' ? 'Rechazado: no se mostrará en el foro.' : 'Vuelto a revisión.' } : { ok: false, text: 'No se encontró el mensaje.' };
    res.redirect('/foro');
  }));
  app.post('/foro/borrar', auth, safe(async (req, res) => {
    const row = await store.borrar(tipoDe(req.body.tipo), Number(req.body.id));
    flash = row ? { ok: true, text: 'Borrado para siempre.' } : { ok: false, text: 'No se encontró el mensaje.' };
    res.redirect('/foro');
  }));
  app.post('/foro/fijar', auth, safe(async (req, res) => {
    await store.fijar(Number(req.body.id), req.body.si === '1');
    flash = { ok: true, text: req.body.si === '1' ? 'Tema destacado arriba del foro.' : 'Tema ya no destacado.' };
    res.redirect('/foro');
  }));
  app.post('/foro/bloquear', auth, safe(async (req, res) => {
    if (/^\d{1,20}$/.test(String(req.body.cliente || ''))) await store.bloquear(req.body.cliente, req.body.si !== '0');
    flash = { ok: true, text: req.body.si !== '0' ? 'Clienta bloqueada: ya no puede publicar.' : 'Clienta desbloqueada.' };
    res.redirect('/foro');
  }));
  app.post('/foro/responder', auth, safe(async (req, res) => {
    const tema = await store.tema(Number(req.body.tema));
    const v = rules.validarRespuesta(req.body);
    if (!tema || v.error) {
      flash = { ok: false, text: v.error || 'No se encontró el tema.' };
      return res.redirect('/foro');
    }
    if (tema.estado === 'pendiente') await store.cambiarEstado('tema', tema.id, 'publicado');
    await store.crearRespuesta({ temaId: tema.id, cuerpo: v.cuerpo, autor: 'Equipo Nina', equipo: true, estado: 'publicado' });
    flash = { ok: true, text: `Respuesta publicada como Equipo Nina en «${tema.titulo}».` };
    res.redirect('/foro');
  }));
  app.post('/foro/ejemplos', auth, safe(async (req, res) => {
    if (req.body.accion === 'borrar') {
      const n = await store.borrarEjemplos();
      flash = { ok: true, text: n ? `Borrados ${n} temas de ejemplo con sus respuestas.` : 'No había temas de ejemplo.' };
    } else {
      const n = await store.crearEjemplos(EJEMPLOS);
      flash = n ? { ok: true, text: `Publicados ${n} temas de ejemplo con sus respuestas.` } : { ok: false, text: 'Los temas de ejemplo ya estaban publicados.' };
    }
    res.redirect('/foro');
  }));
  app.post('/foro/nuevo', auth, safe(async (req, res) => {
    const v = rules.validarTema(req.body);
    if (v.error) {
      flash = { ok: false, text: v.error };
      return res.redirect('/foro');
    }
    const tema = await store.crearTema({ ...v, autor: 'Equipo Nina', equipo: true, estado: 'publicado' });
    if (req.body.fijar === '1') await store.fijar(tema.id, true);
    flash = { ok: true, text: `Tema «${tema.titulo}» publicado como Equipo Nina.` };
    res.redirect('/foro');
  }));
}
