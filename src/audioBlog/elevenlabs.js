// ElevenLabs: voz para «Escuchar artículo» (texto a voz con tiempos por carácter).
// La clave va en Railway → Variables → ELEVENLABS_API_KEY (nunca en GitHub ni en el chat).
const API = 'https://api.elevenlabs.io';

export const elevenKey = () => process.env.ELEVENLABS_API_KEY || '';
export const defaultModel = () => process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
// Créditos que gasta cada carácter según el modelo (Flash/Turbo cuestan la mitad).
export const creditsPerChar = (model) => (/flash|turbo/i.test(model) ? 0.5 : 1);

async function call(path, { method = 'GET', body, raw = false } = {}, attempt = 0) {
  const key = elevenKey();
  if (!key) throw new Error('Falta ELEVENLABS_API_KEY en Railway → Variables');
  const res = await fetch(API + path, {
    method,
    headers: { 'xi-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}), Accept: raw ? 'audio/mpeg' : 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    return call(path, { method, body, raw }, attempt + 1);
  }
  if (!res.ok) {
    const txt = await res.text();
    let msg = txt.slice(0, 300);
    try {
      const j = JSON.parse(txt);
      msg = j.detail?.message || j.detail?.status || (typeof j.detail === 'string' ? j.detail : msg);
    } catch { /* texto plano */ }
    if (res.status === 401) msg = 'ElevenLabs no acepta la clave (revisa ELEVENLABS_API_KEY y sus permisos): ' + msg;
    if (/quota|credits/i.test(msg)) msg = 'No quedan créditos suficientes en ElevenLabs este mes: ' + msg;
    throw new Error(`ElevenLabs ${res.status}: ${msg}`);
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

/** Voces de la cuenta (las de «Mis voces», incluidas las añadidas desde la biblioteca). */
export async function voices() {
  const j = await call('/v1/voices');
  return (j.voices || []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category,
    accent: v.labels?.accent || '',
    language: v.labels?.language || v.fine_tuning?.language || '',
    gender: v.labels?.gender || '',
    description: v.labels?.description || v.description || '',
    preview: v.preview_url || '',
  }));
}

/** Créditos del mes (si la clave tiene permiso de lectura de usuario). */
export async function subscription() {
  try {
    const j = await call('/v1/user/subscription');
    return { used: j.character_count, limit: j.character_limit, reset: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000) : null, tier: j.tier };
  } catch (e) {
    return { error: e.message };
  }
}

const langFor = (model) => (/multilingual_v2/.test(model) ? {} : { language_code: 'es' });

/** Un trozo de texto → MP3 + tiempos de cada carácter. */
export async function speakWithTimestamps(text, { voiceId, model = defaultModel(), previousText, nextText }) {
  const j = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    body: {
      text,
      model_id: model,
      ...langFor(model),
      ...(previousText ? { previous_text: previousText } : {}),
      ...(nextText ? { next_text: nextText } : {}),
    },
  });
  if (!j.audio_base64) throw new Error('ElevenLabs no devolvió audio');
  return { audio: Buffer.from(j.audio_base64, 'base64'), alignment: j.alignment || j.normalized_alignment || null };
}

/** Muestra corta para elegir voz en el panel. */
export function sample(voiceId, model = defaultModel()) {
  const text = 'Hola, soy la voz de Nina Blog. Te leo los artículos mientras te preparas o vas de camino. ¿Empezamos?';
  return call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST', raw: true, body: { text, model_id: model, ...langFor(model) },
  });
}
export const SAMPLE_CHARS = 105;
