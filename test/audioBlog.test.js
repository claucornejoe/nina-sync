import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, extractBlocks, splitSentences, buildScript, makeChunks, buildTimings, mp3Duration, scriptHash } from '../src/audioBlog/text.js';

const html = `<div class="nba-resumen"><p class="nba-resumen__titulo">En resumen</p><ul><li><strong>Uno:</strong> vainilla&nbsp;y café.</li><li>Dos</li></ul></div>
<h2>Vainilla: el aroma</h2><p>Si solo pudiéramos elegir una nota, sería la vainilla. Pero ojo, ¿sabes por qué? «Porque sí». Fin p. ej. aquí.</p>
<div class="nba-productos"><div class="nba-prod"><a class="nba-prod__img" aria-hidden="true"></a><div class="nba-prod__txt"><p class="nba-prod__marca">Lattafa</p><a class="nba-prod__nombre" href="/products/x">Asad</a></div></div></div>
<blockquote><p>Truco: no frotes.</p></blockquote><table><tr><td>No se lee</td></tr></table>
<div class="nba-cta"><p class="nba-cta__titulo">¿Ya sabes?</p><a class="nba-cta__btn" href="/c">Ver perfumes</a></div>
<p class="nba-fuentes"><em>Fuentes: X.</em></p><p class="nba-no-leer">Oculto</p><p>Línea<br>dos &amp; más &#8364;</p>`;

test('decodifica entidades', () => {
  assert.equal(decodeEntities('a&nbsp;b &amp; &laquo;c&raquo; &#8364; &#x20AC; &aacute;'), 'a b & «c» € € á');
});

test('saca solo el texto que se lee, en orden', () => {
  const b = extractBlocks(html).map((x) => (x.heading ? '# ' : '') + x.text);
  assert.deepEqual(b, ['En resumen', 'Uno: vainilla y café.', 'Dos', '# Vainilla: el aroma', 'Si solo pudiéramos elegir una nota, sería la vainilla. Pero ojo, ¿sabes por qué? «Porque sí». Fin p. ej. aquí.', 'Truco: no frotes.', '¿Ya sabes?', 'Línea dos & más €']);
});

test('corta frases sin romper abreviaturas', () => {
  assert.deepEqual(splitSentences('Hola. ¿Qué tal? ¡Bien! Uso p. ej. esto. Fin…'), ['Hola.', '¿Qué tal?', '¡Bien!', 'Uso p. ej. esto.', 'Fin…']);
  assert.deepEqual(splitSentences('Precio 19.000 búsquedas. Vale'), ['Precio 19.000 búsquedas.', 'Vale']);
});

test('guion: título, entradilla y cuerpo; los títulos llevan punto al leerse', () => {
  const s = buildScript({ title: 'Mi título', summary: '<p>Entradilla corta.</p>', html: '<h2>Apartado</h2><p>Texto uno. Texto dos.</p><p>Sin punto</p>' });
  assert.deepEqual(s.map((x) => x.t), ['Mi título', 'Entradilla corta.', 'Apartado', 'Texto uno.', 'Texto dos.', 'Sin punto']);
  const [c] = makeChunks(s);
  assert.equal(c.text, 'Mi título.\n\nEntradilla corta.\n\nApartado.\n\nTexto uno. Texto dos.\nSin punto.');
  const w = c.words.find((x) => x.si === 4 && x.wi === 1);
  assert.equal(c.text.slice(w.off, w.off + w.len), 'dos.');
  assert.notEqual(scriptHash(s), scriptHash(s.slice(1)));
});

test('reparte en trozos y junta los tiempos de toda la pista', () => {
  const s = buildScript({ title: 'Uno', summary: '', html: '<p>Dos tres.</p><p>Cuatro cinco.</p>' });
  const chunks = makeChunks(s, 12);
  assert.equal(chunks.length, 3);
  const results = chunks.map((c) => ({ duration: 2, alignment: { characters: [...c.text], character_start_times_seconds: [...c.text].map((_, i) => i * 0.1) } }));
  const { sentences, duration } = buildTimings(s, chunks, results);
  assert.equal(duration, 6);
  assert.deepEqual(sentences.map((x) => x.w), [[0], [2000, 2400], [4000, 4700]]);
  assert.equal(sentences[0].h, 1);
});

test('mide la duración de un MP3 por sus tramas', () => {
  // 10 tramas MPEG1 Layer III 128 kbps 44,1 kHz (418 bytes cada una, sin relleno).
  const frame = Buffer.alloc(417);
  frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x90; frame[3] = 0x00;
  const buf = Buffer.concat(Array(10).fill(frame));
  assert.ok(Math.abs(mp3Duration(buf) - (10 * 1152) / 44100) < 1e-9);
});
