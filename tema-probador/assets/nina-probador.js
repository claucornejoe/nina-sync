/* Nina Beauty · Probador virtual de maquillaje (labios)
 * Detecta la cara con MediaPipe Face Landmarker (en el navegador; la imagen no sale del dispositivo)
 * y pinta los labios con el tono elegido.
 * Uso: <div data-nina-probador data-tonos-url="...json" data-mp-url="..." data-wasm-url="..." data-model-url="..."></div>
 */
const MP_DEF = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const WASM_DEF = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_DEF = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Contornos de labios de MediaPipe Face Mesh
const LABIO_EXT = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const LABIO_INT = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const LABIO_INF_CENTRO = [14, 17]; // para el brillo

// Cómo se mezcla cada acabado: cubrir (normal), color (tono), multiplicar (profundidad), brillo
const ACABADOS = {
  mate:     { cubre: 0.42, color: 0.55, mult: 0.30, brillo: 0 },
  satinado: { cubre: 0.36, color: 0.55, mult: 0.25, brillo: 0.18 },
  brillo:   { cubre: 0.26, color: 0.50, mult: 0.18, brillo: 0.38 },
  tinte:    { cubre: 0.18, color: 0.45, mult: 0.22, brillo: 0.10 },
  lapiz:    { cubre: 0.40, color: 0.55, mult: 0.30, brillo: 0 },
};
const NOMBRE_ACABADO = { mate: 'Mate', satinado: 'Satinado', brillo: 'Brillo', tinte: 'Tinte', lapiz: 'Perfilador' };

const euros = n => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const sinAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const el = (tag, attrs = {}, ...hijos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h != null) e.append(h);
  return e;
};
const LUPA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

class Probador {
  constructor(root) {
    this.root = root;
    const d = root.dataset;
    this.cfg = {
      tonos: d.tonosUrl, mp: d.mpUrl || MP_DEF, wasm: d.wasmUrl || WASM_DEF, model: d.modelUrl || MODEL_DEF,
      carrito: d.carrito !== 'false',
    };
    this.tonos = [];
    this.tono = null;
    this.intensidad = 1;
    this.marca = 'Todas';
    this.busqueda = '';
    this.orden = 'vendidos';
    this.antes = false;
    this.fuente = null; // video o imagen
    this.landmarks = null;
    this.montar();
    this.cargarTonos();
  }

  /* ---------- Interfaz ---------- */
  montar() {
    const r = this.root;
    r.classList.add('np');
    this.canvas = el('canvas', { class: 'np-canvas', 'aria-label': 'Tu cara con el maquillaje aplicado' });
    this.video = el('video', { playsinline: true, muted: true, autoplay: true, class: 'np-video' });
    this.video.muted = true;
    this.inputFoto = el('input', { type: 'file', accept: 'image/*', id: 'np-foto-' + Math.random().toString(36).slice(2, 7), hidden: true, onchange: e => this.usarFoto(e.target.files[0]) });
    this.estado = el('p', { class: 'np-estado', role: 'status' });

    this.inicio = el('div', { class: 'np-inicio' },
      el('p', { class: 'np-inicio-titulo' }, 'Pruébatelo sin salir de casa'),
      el('p', { class: 'np-inicio-texto' }, 'Activa la cámara o sube un selfie y elige un tono. La imagen se procesa en tu dispositivo: no se guarda ni se envía.'),
      el('div', { class: 'np-inicio-botones' },
        el('button', { type: 'button', class: 'np-btn np-btn-primario', onclick: () => this.usarCamara() }, 'Activar cámara'),
        el('button', { type: 'button', class: 'np-btn np-btn-secundario', onclick: () => this.inputFoto.click() }, 'Subir una foto')),
      this.estado);

    this.btnAntes = el('button', { type: 'button', class: 'np-flotante np-antes', 'aria-pressed': 'false',
      onpointerdown: () => this.setAntes(true), onpointerup: () => this.setAntes(false), onpointerleave: () => this.setAntes(false),
      onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.setAntes(true); } },
      onkeyup: () => this.setAntes(false) }, 'Mantén para ver sin maquillaje');
    this.btnCerrar = el('button', { type: 'button', class: 'np-flotante np-cerrar', 'aria-label': 'Cerrar cámara', onclick: () => this.parar() }, '×');
    this.aviso = el('p', { class: 'np-aviso', hidden: true }, 'No encuentro tu cara. Mira a la cámara con buena luz.');

    this.escenario = el('div', { class: 'np-escenario' }, this.canvas, this.inicio, this.aviso, this.btnAntes, this.btnCerrar);
    this.btnAntes.hidden = this.btnCerrar.hidden = true;

    // zonas
    const zonas = el('div', { class: 'np-zonas', role: 'tablist', 'aria-label': 'Zona' },
      el('button', { type: 'button', role: 'tab', 'aria-selected': 'true', class: 'np-zona' }, 'Labios'),
      el('button', { type: 'button', role: 'tab', 'aria-selected': 'false', class: 'np-zona', disabled: true, title: 'Muy pronto' }, 'Ojos', el('small', {}, 'pronto')),
      el('button', { type: 'button', role: 'tab', 'aria-selected': 'false', class: 'np-zona', disabled: true, title: 'Muy pronto' }, 'Rostro', el('small', {}, 'pronto')));

    // buscador
    const idBusca = 'np-busca-' + Math.random().toString(36).slice(2, 7);
    this.busca = el('input', { type: 'search', id: idBusca, class: 'np-busca-input', placeholder: 'Busca un labial, marca o tono', autocomplete: 'off',
      oninput: e => { this.busqueda = e.target.value; this.pintarLista(); } });
    const lupa = el('span', { class: 'np-lupa' }); lupa.innerHTML = LUPA;
    const busca = el('label', { class: 'np-busca', for: idBusca }, lupa, el('span', { class: 'np-sr' }, 'Buscar producto'), this.busca);

    this.marcas = el('div', { class: 'np-marcas', role: 'group', 'aria-label': 'Marca' });
    this.selOrden = el('select', { class: 'np-orden', 'aria-label': 'Ordenar', id: 'np-orden-' + Math.random().toString(36).slice(2, 7),
      onchange: e => { this.orden = e.target.value; this.pintarLista(); } },
      el('option', { value: 'vendidos' }, 'Más vendidos'),
      el('option', { value: 'precio' }, 'Precio: de menor a mayor'),
      el('option', { value: 'color' }, 'Por color'));
    this.cuenta = el('span', { class: 'np-cuenta' });
    this.lista = el('div', { class: 'np-lista' });

    // ficha del tono elegido
    this.ficha = el('div', { class: 'np-ficha', hidden: true });
    this.rango = el('input', { type: 'range', min: '30', max: '100', value: '100', id: 'np-int-' + Math.random().toString(36).slice(2, 7),
      oninput: e => { this.intensidad = e.target.value / 100; this.dibujar(); } });

    const panel = el('div', { class: 'np-panel' }, zonas, busca, this.marcas,
      el('div', { class: 'np-barra' }, this.cuenta, this.selOrden), this.lista, this.ficha);
    r.replaceChildren(el('div', { class: 'np-rejilla' }, this.escenario, panel), this.inputFoto, this.video);
    this.video.hidden = true;
    this.ctx = this.canvas.getContext('2d');
    this.mask = document.createElement('canvas');
    this.capa = document.createElement('canvas');
    this.canvas.width = 720; this.canvas.height = 900;
    this.pintarVacio();
  }

  async cargarTonos() {
    try {
      const res = await fetch(this.cfg.tonos);
      this.tonos = await res.json();
    } catch (e) {
      this.lista.replaceChildren(el('p', { class: 'np-vacio' }, 'No se han podido cargar los tonos. Recarga la página.'));
      return;
    }
    const cuenta = {};
    for (const t of this.tonos) cuenta[t.marca] = (cuenta[t.marca] || 0) + t.stock;
    this.listaMarcas = ['Todas', ...Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])];
    this.pintarMarcas();
    this.pintarLista();
  }

  pintarMarcas() {
    this.marcas.replaceChildren(...this.listaMarcas.map(m => el('button', {
      type: 'button', class: 'np-chip', 'aria-pressed': String(m === this.marca),
      onclick: () => { this.marca = m; this.pintarMarcas(); this.pintarLista(); } }, m)));
  }

  filtrados() {
    const q = sinAcentos(this.busqueda.trim());
    let L = this.tonos.filter(t => (this.marca === 'Todas' || t.marca === this.marca) &&
      (!q || q.split(/\s+/).every(p => sinAcentos(`${t.marca} ${t.producto} ${t.tono} ${NOMBRE_ACABADO[t.acabado]}`).includes(p))));
    if (this.orden === 'precio') L = [...L].sort((a, b) => a.precio - b.precio);
    else if (this.orden === 'color') L = [...L].sort((a, b) => tonoHue(a.hex) - tonoHue(b.hex));
    return L;
  }

  pintarLista() {
    const L = this.filtrados();
    this.cuenta.textContent = `${L.length} ${L.length === 1 ? 'tono' : 'tonos'}`;
    if (!L.length) {
      this.lista.replaceChildren(el('p', { class: 'np-vacio' }, 'No hay tonos con esa búsqueda. Prueba con otra marca o color.'));
      return;
    }
    // Agrupa por producto, respetando el orden
    const grupos = new Map();
    for (const t of L) {
      const k = t.marca + '|' + t.producto;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(t);
    }
    const frag = [];
    for (const [, ts] of grupos) {
      const p = ts[0];
      frag.push(el('section', { class: 'np-grupo' },
        el('h3', { class: 'np-grupo-titulo' }, el('span', { class: 'np-grupo-marca' }, p.marca), ' ', p.producto),
        el('div', { class: 'np-muestras' }, ts.map(t => el('button', {
          type: 'button', class: 'np-muestra', style: `--tono:${t.hex}`,
          'aria-pressed': String(this.tono === t), title: `${t.tono} · ${euros(t.precio)}`,
          'aria-label': `${t.marca} ${t.producto}, tono ${t.tono}`,
          onclick: () => this.elegir(t) }, el('span', { class: 'np-sr' }, t.tono))))));
    }
    this.lista.replaceChildren(...frag);
  }

  elegir(t) {
    this.tono = this.tono === t ? null : t;
    this.pintarLista();
    this.pintarFicha();
    this.dibujar();
    if (this.tono && !this.fuente) this.estado.textContent = 'Activa la cámara o sube una foto para verlo puesto.';
  }

  pintarFicha() {
    const t = this.tono;
    this.ficha.hidden = !t;
    if (!t) return;
    const url = t.handle ? `/products/${t.handle}` : null;
    this.btnCesta = el('button', { type: 'button', class: 'np-btn np-btn-primario', onclick: () => this.alCarrito(t) }, `Añadir a la cesta · ${euros(t.precio)}`);
    this.ficha.replaceChildren(
      el('div', { class: 'np-ficha-cab' },
        el('span', { class: 'np-ficha-muestra', style: `--tono:${t.hex}` }),
        el('div', {},
          el('p', { class: 'np-ficha-marca' }, t.marca),
          el('p', { class: 'np-ficha-prod' }, t.producto),
          el('p', { class: 'np-ficha-tono' }, `${t.tono} · ${NOMBRE_ACABADO[t.acabado]}`))),
      el('label', { class: 'np-int', for: this.rango.id }, 'Intensidad', this.rango),
      el('div', { class: 'np-ficha-botones' },
        this.cfg.carrito ? this.btnCesta : null,
        url ? el('a', { class: 'np-btn np-btn-secundario', href: url }, 'Ver producto') : null),
      el('p', { class: 'np-nota' }, 'El color en pantalla es orientativo y puede variar con la luz y tu pantalla.'));
  }

  async alCarrito(t) {
    const b = this.btnCesta;
    b.disabled = true; b.textContent = 'Añadiendo…';
    try {
      const p = await (await fetch(`/products/${t.handle}.js`)).json();
      const v = p.variants.find(v => v.sku === t.ean || v.barcode === t.ean) || p.variants[0];
      if (!v || !v.available) throw new Error('agotado');
      const r = await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: v.id, quantity: 1 }] }) });
      if (!r.ok) throw new Error('cesta');
      b.textContent = 'Añadido a la cesta ✓';
      document.dispatchEvent(new CustomEvent('cart:update', { bubbles: true }));
      document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    } catch (e) {
      b.textContent = e.message === 'agotado' ? 'Agotado por ahora' : 'No disponible todavía';
    }
    setTimeout(() => { b.disabled = false; b.textContent = `Añadir a la cesta · ${euros(t.precio)}`; }, 2500);
  }

  setAntes(v) { this.antes = v; this.btnAntes.setAttribute('aria-pressed', String(v)); this.dibujar(); }

  /* ---------- Cámara / foto ---------- */
  async detector() {
    if (this._det) return this._det;
    this.estado.textContent = 'Preparando el probador…';
    this._det = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(this.cfg.mp);
      const files = await FilesetResolver.forVisionTasks(this.cfg.wasm);
      const crear = delegate => FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: this.cfg.model, delegate }, runningMode: 'VIDEO', numFaces: 1 });
      try { return await crear('GPU'); } catch { return await crear('CPU'); }
    })();
    try { return await this._det; } catch (e) { this._det = null; throw e; }
  }

  async usarCamara() {
    try {
      this.estado.textContent = 'Pidiendo permiso para la cámara…';
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      await this.detector();
      this.pararCamara();
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      this.fuente = this.video; this.espejo = true;
      this.empezar();
    } catch (e) {
      console.warn('[Nina probador]', e);
      this.estado.textContent = e && e.name === 'NotAllowedError'
        ? 'No tenemos permiso para usar la cámara. Puedes activarlo en tu navegador o subir una foto.'
        : 'No se ha podido abrir la cámara. Prueba a subir una foto.';
    }
  }

  async usarFoto(file) {
    if (!file) return;
    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();
      await this.detector();
      this.pararCamara();
      this.fuente = img; this.espejo = false;
      this.empezar();
    } catch (e) {
      console.warn('[Nina probador]', e);
      this.estado.textContent = 'No se ha podido leer la foto. Prueba con otra imagen (JPG o PNG).';
    }
    this.inputFoto.value = '';
  }

  empezar() {
    const f = this.fuente;
    const w = f.videoWidth || f.naturalWidth, h = f.videoHeight || f.naturalHeight;
    const esc = Math.min(1, 1280 / Math.max(w, h));
    this.canvas.width = Math.round(w * esc); this.canvas.height = Math.round(h * esc);
    this.mask.width = this.capa.width = this.canvas.width;
    this.mask.height = this.capa.height = this.canvas.height;
    this.inicio.hidden = true;
    this.btnAntes.hidden = this.btnCerrar.hidden = false;
    this.escenario.classList.add('np-activo');
    this.estado.textContent = '';
    this.ts = 0;
    if (f === this.video) this.bucle();
    else { this.detectar(performance.now()); this.dibujar(); }
  }

  bucle() {
    if (this.fuente !== this.video) return;
    const ahora = performance.now();
    if (this.video.readyState >= 2) { this.detectar(ahora); this.dibujar(); }
    this.raf = requestAnimationFrame(() => this.bucle());
  }

  detectar(ahora) {
    const ts = Math.max(ahora, this.ts + 1); this.ts = ts;
    try {
      const r = this._detSync.detectForVideo(this.fuente, ts);
      this.landmarks = r.faceLandmarks && r.faceLandmarks[0] || null;
    } catch (e) { this.landmarks = null; }
    this.aviso.hidden = !!this.landmarks;
  }

  pararCamara() {
    cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  parar() {
    this.pararCamara();
    this.fuente = null; this.landmarks = null;
    this.inicio.hidden = false;
    this.btnAntes.hidden = this.btnCerrar.hidden = true;
    this.aviso.hidden = true;
    this.escenario.classList.remove('np-activo');
    this.pintarVacio();
  }

  /* ---------- Dibujo ---------- */
  pintarVacio() {
    const { ctx, canvas } = this;
    canvas.width = 720; canvas.height = 900;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  dibujar() {
    const f = this.fuente;
    if (!f) return;
    const { ctx, canvas } = this, W = canvas.width, H = canvas.height;
    ctx.save();
    if (this.espejo) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(f, 0, 0, W, H);
    if (this.tono && this.landmarks && !this.antes) this.labios(this.landmarks, this.tono);
    ctx.restore();
  }

  labios(lm, t) {
    const { ctx, mask, capa } = this, W = mask.width, H = mask.height;
    const a = ACABADOS[t.acabado] || ACABADOS.mate, k = this.intensidad;
    const P = i => [lm[i].x * W, lm[i].y * H];
    const anchoBoca = Math.hypot(P(61)[0] - P(291)[0], P(61)[1] - P(291)[1]);
    const camino = (c, idx) => { c.beginPath(); idx.forEach((i, n) => { const [x, y] = P(i); n ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };

    // Máscara suave de los labios (exterior menos interior)
    const m = mask.getContext('2d');
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, W, H);
    m.filter = `blur(${Math.max(1, anchoBoca * 0.018).toFixed(1)}px)`;
    m.fillStyle = '#000';
    camino(m, LABIO_EXT); m.fill();
    m.globalCompositeOperation = 'destination-out';
    camino(m, LABIO_INT); m.fill();
    m.globalCompositeOperation = 'source-over';
    m.filter = 'none';

    // Capa de color recortada a la máscara
    const c = capa.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, W, H);
    c.fillStyle = t.hex; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(mask, 0, 0);

    const pasada = (modo, alfa) => { if (alfa <= 0) return; ctx.globalCompositeOperation = modo; ctx.globalAlpha = Math.min(1, alfa * k); ctx.drawImage(capa, 0, 0); };
    // ctx ya puede estar en espejo: la capa está en coordenadas de la imagen, igual que el dibujo
    pasada('source-over', a.cubre);
    pasada('color', a.color);
    pasada('multiply', a.mult);

    // Brillo: reflejo suave en el centro del labio inferior y superior
    if (a.brillo > 0) {
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, W, H);
      const [x1, y1] = P(LABIO_INF_CENTRO[0]), [x2, y2] = P(LABIO_INF_CENTRO[1]);
      const cx = (x1 + x2) / 2, cy = y1 + (y2 - y1) * 0.45;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, anchoBoca * 0.32);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const [sx, sy] = P(0), [ix, iy] = P(13);
      const g2 = c.createRadialGradient(sx, (sy + iy) / 2, 0, sx, (sy + iy) / 2, anchoBoca * 0.18);
      g2.addColorStop(0, 'rgba(255,255,255,0.6)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g2; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(mask, 0, 0);
      pasada('soft-light', a.brillo * 1.6);
      pasada('screen', a.brillo * 0.5);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

function tonoHue(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  // Ordena de claros (nudes) a oscuros, agrupando por tono
  let h = 0;
  if (max !== min) { const d = max - min; h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; }
  h = (h * 60 + 360 + 40) % 360; // rojos y rosas juntos
  return Math.round(h / 30) * 10 - l;
}

// La detección necesita el detector ya creado de forma síncrona en el bucle
const _detector = Probador.prototype.detector;
Probador.prototype.detector = async function () { this._detSync = await _detector.call(this); return this._detSync; };

function iniciar() {
  document.querySelectorAll('[data-nina-probador]:not(.np)').forEach(r => new Probador(r));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
document.addEventListener('shopify:section:load', iniciar);
export { Probador };
