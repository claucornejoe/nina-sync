// Rutas de «Escuchar artículo» (audio de Nina Blog con ElevenLabs).
import crypto from 'node:crypto';
import * as store from './store.js';
import * as el from './elevenlabs.js';
import * as sh from './shopify.js';
import { state, generate, estimate, remove } from './worker.js';
import { audioPage } from './views.js';
import { esc } from '../views.js';

let notice = null;
let sample = null; // { token, buf }
const safe = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('Audio blog:', e);
  notice = `<span class="err">Algo falló: ${esc(e.message)}</span>`;
  res.redirect('/audio-blog');
});
const isArticle = (id) => /^gid:\/\/shopify\/Article\/\d+$/.test(String(id || ''));

async function settings() {
  return {
    voiceId: (await store.get('voz')) || process.env.ELEVENLABS_VOICE_ID || '',
    voiceName: (await store.get('voz_nombre')) || '',
    model: (await store.get('modelo')) || el.defaultModel(),
  };
}

export async function mountAudioBlog(app, auth) {
  await store.migrate();

  app.get('/audio-blog', auth, safe(async (_req, res) => {
    const hasKey = !!el.elevenKey();
    const cfg = await settings();
    let voices = [];
    let voicesError = '';
    let sub = null;
    if (hasKey) {
      [voices, sub] = await Promise.all([el.voices().catch((e) => { voicesError = e.message; return []; }), el.subscription()]);
    }
    let articles = [];
    try {
      articles = (await sh.listArticles()).map((a) => ({ article: a, est: estimate(a, cfg.model) }));
    } catch (e) {
      notice = (notice ? notice + '<br>' : '') + `<span class="err">${esc(e.message)}</span>`;
    }
    const n = notice;
    notice = null;
    res.send(audioPage({ hasKey, voices, voicesError, voiceId: cfg.voiceId, model: cfg.model, sub, articles, state, notice: n, sampleUrl: sample ? `/audio-blog/muestra/${sample.token}` : '' }));
  }));

  app.post('/audio-blog/voz', auth, safe(async (req, res) => {
    const voz = String(req.body.voz || '').trim();
    const modelo = ['eleven_multilingual_v2', 'eleven_flash_v2_5'].includes(req.body.modelo) ? req.body.modelo : el.defaultModel();
    if (!/^[A-Za-z0-9]{8,40}$/.test(voz)) throw new Error('Esa voz no es válida');
    const voces = await el.voices();
    const v = voces.find((x) => x.id === voz);
    await store.set('voz', voz);
    await store.set('voz_nombre', v?.name || '');
    await store.set('modelo', modelo);
    if (req.body.accion === 'muestra') {
      const buf = await el.sample(voz, modelo);
      sample = { token: crypto.randomBytes(12).toString('hex'), buf };
      notice = `Muestra de ${esc(v?.name || 'la voz')} lista abajo. Voz guardada.`;
    } else {
      sample = null;
      notice = `Voz guardada: ${esc(v?.name || voz)}.`;
    }
    res.redirect('/audio-blog');
  }));

  app.get('/audio-blog/muestra/:token', auth, (req, res) => {
    if (!sample || sample.token !== req.params.token) return res.status(404).send('No existe');
    res.type('audio/mpeg').send(sample.buf);
  });

  app.post('/audio-blog/generar', auth, safe(async (req, res) => {
    if (!isArticle(req.body.id)) throw new Error('Artículo no válido');
    const cfg = await settings();
    generate(req.body.id, cfg).catch((e) => console.error('Audio blog:', e.message));
    setTimeout(() => res.redirect('/audio-blog'), 1200);
  }));

  app.post('/audio-blog/quitar', auth, safe(async (req, res) => {
    if (!isArticle(req.body.id)) throw new Error('Artículo no válido');
    await remove(req.body.id);
    notice = 'Audio quitado: el botón ya no sale en ese artículo.';
    res.redirect('/audio-blog');
  }));
}
