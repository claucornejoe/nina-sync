// Genera el audio de un artículo: ElevenLabs (por trozos, con tiempos) → un MP3 en Shopify → metacampo nina.audio.
import { shopInfo } from '../shopify.js';
import * as el from './elevenlabs.js';
import * as sh from './shopify.js';
import { buildScript, scriptChars, scriptHash, makeChunks, mp3Duration, buildTimings } from './text.js';

export const state = { running: false, articleId: null, title: '', done: 0, total: 0, note: '', error: '', ok: '' };

export function scriptFor(article) {
  return buildScript({ title: article.title, summary: article.summary, html: article.body });
}

/** Lo que costará en créditos (aprox.). */
export function estimate(article, model = el.defaultModel()) {
  const s = scriptFor(article);
  const chars = scriptChars(s);
  return { chars, credits: Math.ceil(chars * el.creditsPerChar(model)), hash: scriptHash(s), minutes: Math.max(1, Math.round(chars / 900)) };
}

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

export async function generate(articleId, { voiceId, voiceName, model = el.defaultModel() }) {
  if (state.running) throw new Error('Ya se está generando otro audio. Espera a que termine.');
  if (!voiceId) throw new Error('Elige primero una voz.');
  Object.assign(state, { running: true, articleId, title: '', done: 0, total: 0, note: 'Preparando…', error: '', ok: '' });
  try {
    const shop = await shopInfo();
    if (!/ikwg4h-mk/.test(shop.myshopifyDomain)) throw new Error(`La tienda conectada es ${shop.myshopifyDomain}, no Nina Beauty. No se hace nada.`);
    const article = await sh.getArticle(articleId);
    if (!article) throw new Error('No encuentro ese artículo en Nina Blog');
    state.title = article.title;

    const sentences = scriptFor(article);
    if (!sentences.length) throw new Error('El artículo no tiene texto que leer');
    const est = estimate(article, model);
    const sub = await el.subscription();
    if (sub.limit != null && sub.limit - sub.used < est.credits) {
      throw new Error(`Hacen falta unos ${est.credits.toLocaleString('es-ES')} créditos y en ElevenLabs quedan ${(sub.limit - sub.used).toLocaleString('es-ES')} este mes.`);
    }

    const chunks = makeChunks(sentences);
    state.total = chunks.length;
    const results = [];
    const audios = [];
    for (let i = 0; i < chunks.length; i++) {
      state.note = `Leyendo la parte ${i + 1} de ${chunks.length} con ElevenLabs…`;
      const r = await el.speakWithTimestamps(chunks[i].text, {
        voiceId, model,
        previousText: i > 0 ? chunks[i - 1].text.slice(-400) : undefined,
        nextText: i < chunks.length - 1 ? chunks[i + 1].text.slice(0, 400) : undefined,
      });
      audios.push(r.audio);
      results.push({ alignment: r.alignment, duration: mp3Duration(r.audio) });
      state.done = i + 1;
    }
    const { sentences: timed, duration } = buildTimings(sentences, chunks, results);
    const mp3 = Buffer.concat(audios);

    state.note = 'Subiendo el audio a Shopify…';
    const file = await sh.uploadAudio(mp3, `nina-blog-${slug(article.handle)}.mp3`);
    const old = article.audio?.fileId;
    await sh.saveAudio(article.id, {
      v: 1, url: file.url, fileId: file.id, dur: duration,
      voz: voiceName || '', vozId: voiceId, modelo: model, hash: est.hash,
      fecha: new Date().toISOString(), s: timed,
    });
    if (old && old !== file.id) await sh.deleteFile(old);
    state.ok = `Audio listo para «${article.title}» (${Math.round(duration / 60)} min).`;
    state.note = '';
  } catch (e) {
    state.error = e.message;
    state.note = '';
    throw e;
  } finally {
    state.running = false;
  }
}

export async function remove(articleId) {
  const a = await sh.getArticle(articleId);
  if (!a) throw new Error('No encuentro ese artículo');
  await sh.removeAudio(a.id);
  if (a.audio?.fileId) await sh.deleteFile(a.audio.fileId);
}
