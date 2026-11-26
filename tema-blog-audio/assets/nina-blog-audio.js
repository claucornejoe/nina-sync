/* Nina Blog · «Escuchar artículo»: reproduce el audio de ElevenLabs y resalta la frase y la palabra que suenan.
   Los tiempos los genera Nina Sync (metacampo nina.audio). Las reglas de qué se lee coinciden con src/audioBlog/text.js. */
(function () {
  var caja = document.querySelector('[data-nba-audio]');
  if (!caja) return;
  var audio = caja.querySelector('audio');
  var btn = caja.querySelector('[data-nba-audio-play]');
  var barra = caja.querySelector('[data-nba-audio-barra]');
  var relleno = barra && barra.querySelector('i');
  var tiempo = caja.querySelector('[data-nba-audio-tiempo]');
  var vel = caja.querySelector('[data-nba-audio-vel]');
  var cerrar = caja.querySelector('[data-nba-audio-cerrar]');
  var sitio = caja.parentNode;
  var datos = null;
  var mapa = null; // texto continuo de la página + de qué nodo sale cada letra
  var palabras = []; // { ms, frase, a, b } a/b = posiciones en el texto continuo
  var frases = []; // { a, b, primera }
  var actual = -1;
  var fraseActual = -1;
  var tocado = 0; // última vez que la clienta movió la página a mano
  var hl = window.CSS && CSS.highlights && window.Highlight ? CSS.highlights : null;

  var SALTAR = '.nba-productos,.nba-prod,.nba-fuentes,.nba-cta__btn,.nba-indice,.nba-no-leer,.nba-audio,script,style,figure,table,button,iframe,video,audio,svg,select,form,noscript,template,[aria-hidden="true"],[hidden]';
  var BLOQUES = /^(H[1-6]|P|LI|BLOCKQUOTE|DT|DD|DIV|SECTION|ARTICLE|UL|OL|HEADER|FOOTER|ASIDE)$/;

  function construirMapa() {
    var txt = [];
    var nodos = [];
    var offs = [];
    var espacio = function () { if (txt.length && txt[txt.length - 1] !== ' ') { txt.push(' '); nodos.push(null); offs.push(0); } };
    var raices = [document.querySelector('.nba-titulo'), document.querySelector('.nba-entradilla'), document.querySelector('[data-nba-cuerpo]')];
    var recorrer = function (el) {
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          var s = n.nodeValue;
          for (var i = 0; i < s.length; i++) {
            var c = s[i];
            if (c === '\u00ad' || c === '\u200b' || c === '\u200c' || c === '\u200d') continue;
            if (/[\s\u00a0]/.test(c)) { if (txt.length && txt[txt.length - 1] !== ' ') { txt.push(' '); nodos.push(n); offs.push(i); } continue; }
            txt.push(c); nodos.push(n); offs.push(i);
          }
        } else if (n.nodeType === 1) {
          if (n.matches(SALTAR)) { if (BLOQUES.test(n.tagName)) espacio(); continue; }
          if (n.tagName === 'BR') { espacio(); continue; }
          var bloque = BLOQUES.test(n.tagName);
          if (bloque) espacio();
          recorrer(n);
          if (bloque) espacio();
        }
      }
    };
    raices.forEach(function (r) { if (r) { espacio(); recorrer(r); espacio(); } });
    return { texto: txt.join(''), nodos: nodos, offs: offs };
  }

  function preparar() {
    if (mapa) return;
    try { datos = JSON.parse(caja.querySelector('[data-nba-audio-datos]').textContent); } catch (e) { datos = null; }
    mapa = construirMapa();
    if (!datos || !datos.s) return;
    var cursor = 0;
    datos.s.forEach(function (f, fi) {
      var t = f.t;
      var idx = mapa.texto.indexOf(t, cursor);
      if (idx === -1 || idx - cursor > 4000) idx = -1;
      if (idx > -1) cursor = idx + t.length;
      var ws = t.split(' ').filter(Boolean);
      var pos = 0;
      var primera = palabras.length;
      ws.forEach(function (w, wi) {
        var at = t.indexOf(w, pos);
        pos = at + w.length;
        var ms = f.w && f.w[wi] != null ? f.w[wi] : null;
        if (ms == null) return;
        palabras.push({ ms: ms, frase: fi, a: idx > -1 ? idx + at : -1, b: idx > -1 ? idx + at + w.length : -1 });
      });
      frases[fi] = { a: idx, b: idx > -1 ? idx + t.length : -1, primera: primera };
    });
  }

  function rango(a, b) {
    if (a < 0 || b <= a) return null;
    while (a < b && !mapa.nodos[a]) a++;
    while (b > a && !mapa.nodos[b - 1]) b--;
    if (b <= a) return null;
    var r = document.createRange();
    try {
      r.setStart(mapa.nodos[a], mapa.offs[a]);
      r.setEnd(mapa.nodos[b - 1], mapa.offs[b - 1] + 1);
    } catch (e) { return null; }
    return r;
  }

  var bloqueMarcado = null;
  function marcar(i) {
    if (i === actual) return;
    actual = i;
    var p = palabras[i];
    if (!p) { limpiar(); return; }
    var f = frases[p.frase];
    var cambiaFrase = p.frase !== fraseActual;
    fraseActual = p.frase;
    var rf = f ? rango(f.a, f.b) : null;
    var rp = rango(p.a, p.b);
    if (hl) {
      if (cambiaFrase) { if (rf) hl.set('nina-frase', new Highlight(rf)); else hl.delete('nina-frase'); }
      if (rp) hl.set('nina-palabra', new Highlight(rp)); else hl.delete('nina-palabra');
    } else if (cambiaFrase) {
      // Navegadores antiguos: se marca el párrafo entero.
      if (bloqueMarcado) bloqueMarcado.classList.remove('nba-leyendo');
      bloqueMarcado = null;
      if (rf) {
        var el = rf.startContainer.parentElement;
        while (el && !BLOQUES.test(el.tagName)) el = el.parentElement;
        if (el) { el.classList.add('nba-leyendo'); bloqueMarcado = el; }
      }
    }
    if (cambiaFrase && rf && Date.now() - tocado > 4000) seguir(rf);
  }
  function limpiar() {
    actual = -1; fraseActual = -1;
    if (hl) { hl.delete('nina-frase'); hl.delete('nina-palabra'); }
    if (bloqueMarcado) { bloqueMarcado.classList.remove('nba-leyendo'); bloqueMarcado = null; }
  }
  function seguir(r) {
    var rect = r.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    var abajo = window.innerHeight - (caja.classList.contains('is-flotante') ? caja.offsetHeight + 40 : 40);
    if (rect.top < 90 || rect.bottom > abajo) {
      window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight * 0.3, behavior: 'smooth' });
    }
  }
  ['wheel', 'touchmove', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { tocado = Date.now(); }, { passive: true });
  });

  function buscar(ms) {
    var lo = 0, hi = palabras.length - 1, r = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (palabras[m].ms <= ms) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }

  var dur = parseFloat(caja.getAttribute('data-duracion')) || 0;
  var tiempoInicial = tiempo ? tiempo.textContent : '';
  var mmss = function (s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
  function pintar() {
    var d = audio.duration && isFinite(audio.duration) ? audio.duration : dur;
    if (relleno && d) relleno.style.width = Math.min(100, (audio.currentTime / d) * 100) + '%';
    if (barra && d) barra.setAttribute('aria-valuenow', Math.round(audio.currentTime));
    if (tiempo) tiempo.textContent = caja.classList.contains('is-activo') ? mmss(audio.currentTime) + ' / ' + mmss(d) : tiempoInicial;
  }

  var rafId = 0;
  function bucle() {
    marcar(buscar(audio.currentTime * 1000 + 60));
    pintar();
    if (!audio.paused) rafId = requestAnimationFrame(bucle);
  }

  btn.addEventListener('click', function () {
    preparar();
    if (audio.paused) { audio.play().catch(function () {}); } else audio.pause();
  });
  audio.addEventListener('play', function () {
    caja.classList.add('is-sonando');
    caja.classList.add('is-activo');
    btn.setAttribute('aria-label', 'Pausar');
    btn.setAttribute('aria-pressed', 'true');
    document.body.classList.add('nba-escuchando');
    cancelAnimationFrame(rafId); bucle();
    flotar();
  });
  audio.addEventListener('pause', function () {
    caja.classList.remove('is-sonando');
    btn.setAttribute('aria-label', 'Seguir escuchando');
    btn.setAttribute('aria-pressed', 'false');
    pintar();
  });
  audio.addEventListener('seeked', function () { actual = -2; marcar(buscar(audio.currentTime * 1000 + 60)); pintar(); });
  audio.addEventListener('ended', function () { limpiar(); caja.classList.remove('is-activo'); document.body.classList.remove('nba-escuchando'); flotar(); btn.setAttribute('aria-label', 'Escuchar otra vez'); });
  audio.addEventListener('loadedmetadata', pintar);

  if (barra) {
    var ir = function (x) {
      var r = barra.getBoundingClientRect();
      var d = audio.duration && isFinite(audio.duration) ? audio.duration : dur;
      if (!d) return;
      preparar();
      audio.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * d;
    };
    var arrastrando = false;
    barra.addEventListener('pointerdown', function (e) { arrastrando = true; barra.setPointerCapture(e.pointerId); ir(e.clientX); });
    barra.addEventListener('pointermove', function (e) { if (arrastrando) ir(e.clientX); });
    barra.addEventListener('pointerup', function () { arrastrando = false; });
    barra.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration || dur, audio.currentTime + 10); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 10); e.preventDefault(); }
    });
  }

  var VELS = [1, 1.25, 1.5, 0.75];
  var v = 1;
  try { v = parseFloat(localStorage.getItem('nina-blog-velocidad')) || 1; } catch (e) {}
  if (VELS.indexOf(v) === -1) v = 1;
  var ponerVel = function () { audio.playbackRate = v; audio.defaultPlaybackRate = v; if (vel) vel.textContent = String(v).replace('.', ',') + '×'; };
  ponerVel();
  if (vel) vel.addEventListener('click', function () {
    v = VELS[(VELS.indexOf(v) + 1) % VELS.length];
    ponerVel();
    try { localStorage.setItem('nina-blog-velocidad', String(v)); } catch (e) {}
  });
  var atras = caja.querySelector('[data-nba-audio-atras]');
  if (atras) atras.addEventListener('click', function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  if (cerrar) cerrar.addEventListener('click', function () {
    audio.pause(); audio.currentTime = 0; limpiar();
    caja.classList.remove('is-activo'); document.body.classList.remove('nba-escuchando'); flotar(); pintar();
  });

  // Tocar una frase del artículo mientras se escucha: el audio salta ahí.
  var cuerpo = document.querySelector('[data-nba-cuerpo]');
  if (cuerpo) cuerpo.addEventListener('click', function (e) {
    if (!caja.classList.contains('is-activo') || e.target.closest('a,button,input,textarea,label')) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length) return;
    var nodo, off;
    if (document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(e.clientX, e.clientY); if (cp) { nodo = cp.offsetNode; off = cp.offset; } }
    else if (document.caretRangeFromPoint) { var cr = document.caretRangeFromPoint(e.clientX, e.clientY); if (cr) { nodo = cr.startContainer; off = cr.startOffset; } }
    if (!nodo || nodo.nodeType !== 3) return;
    var idx = -1;
    for (var i = 0; i < mapa.nodos.length; i++) { if (mapa.nodos[i] === nodo && mapa.offs[i] >= off - 1) { idx = i; break; } }
    if (idx < 0) return;
    var elegida = null;
    for (var k = 0; k < palabras.length; k++) { if (palabras[k].a > -1 && palabras[k].a <= idx) elegida = palabras[k]; else if (palabras[k].a > idx) break; }
    if (!elegida) return;
    var f = frases[elegida.frase];
    audio.currentTime = (palabras[f.primera] || elegida).ms / 1000;
    tocado = 0;
    if (audio.paused) audio.play().catch(function () {});
  });

  // Mini reproductor abajo cuando el botón del principio ya no se ve.
  var visible = true;
  function flotar() {
    var on = caja.classList.contains('is-activo') && !visible;
    caja.classList.toggle('is-flotante', on);
  }
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; flotar(); }, { threshold: 0 }).observe(sitio);
  }

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: (document.querySelector('.nba-titulo') || {}).textContent || document.title,
        artist: 'Nina Blog · Nina Beauty',
        artwork: caja.getAttribute('data-portada') ? [{ src: caja.getAttribute('data-portada'), sizes: '512x512' }] : [],
      });
      navigator.mediaSession.setActionHandler('seekbackward', function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
      navigator.mediaSession.setActionHandler('seekforward', function () { audio.currentTime = audio.currentTime + 15; });
    } catch (e) {}
  }
  pintar();
})();
