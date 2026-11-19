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

// Cada acabado: opacidad (cuánto cubre), textura (cuánto se ven las líneas y sombras del labio),
// brillo (reflejos que siguen la luz real) y reflejo (brillo extra en el centro, solo gloss)
const ACABADOS = {
  mate:     { opacidad: 0.86, textura: 0.55, brillo: 0.05, reflejo: 0 },
  satinado: { opacidad: 0.80, textura: 0.75, brillo: 0.40, reflejo: 0.10 },
  brillo:   { opacidad: 0.66, textura: 0.90, brillo: 0.85, reflejo: 0.30 },
  tinte:    { opacidad: 0.46, textura: 1.00, brillo: 0.25, reflejo: 0 },
  lapiz:    { opacidad: 0.84, textura: 0.55, brillo: 0.05, reflejo: 0 },
};
const PUNTOS_LABIO = [...new Set([...LABIO_EXT, ...LABIO_INT, 61, 291, 0, 13, 14, 17])];
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
// Curva suave y cerrada que pasa por el centro de cada tramo (sin esquinas)
const curva = (c, pts) => {
  const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  c.beginPath();
  const m0 = mid(pts[n - 1], pts[0]); c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const p = pts[i], m = mid(p, pts[(i + 1) % n]); c.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
  c.closePath();
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
    this.marca = null; // ninguna marca elegida al principio: la lista empieza vacía
    this.busqueda = '';
    this.orden = 'vendidos';
    this.antes = false;
    this.fuente = null; // video o imagen
    this.landmarks = null;
    this.productos = new Map(); // handle -> datos de Shopify (stock real)
    // Stock que la sección ya trae renderizado desde Shopify: [[sku, código de barras, disponible], ...]
    this.stockTema = new Map();
    const caja = root.closest('.np-seccion') || root.parentElement || document;
    // Fuente principal: metacampo de la tienda nina.probador_stock {ean: unidades}. No depende del
    // país ni del mercado del visitante, así que todos ven lo mismo.
    const jm = caja.querySelector('script[data-np-stock-tienda]');
    let nTienda = 0;
    if (jm) {
      try {
        const m = JSON.parse(jm.textContent);
        if (m && typeof m === 'object') for (const [ean, u] of Object.entries(m)) {
          if (typeof u === 'number') { this.stockTema.set(String(ean), u > 0); nTienda++; }
        }
      } catch (e) { console.warn('[Nina probador] metacampo de stock ilegible', e); }
    }
    const js = nTienda ? null : caja.querySelector('script[data-np-stock]');
    if (js) {
      try {
        for (const fila of JSON.parse(js.textContent)) {
          if (!fila) continue;
          // [sku, código de barras, disponible, unidades, política, gestión]
          const [sku, barcode, , unidades, politica, gestion] = fila;
          // Se mira el inventario real y no «available», que depende del país desde el que se mira
          // la tienda (desde Chile Shopify da todo como no disponible). Solo se tacha si Shopify
          // controla el stock, no deja vender sin stock y quedan 0 unidades.
          const agotado = !!gestion && politica !== 'continue' && typeof unidades === 'number' && unidades <= 0;
          if (sku) this.stockTema.set(String(sku), !agotado);
          if (barcode) this.stockTema.set(String(barcode), !agotado);
        }
      } catch (e) { console.warn('[Nina probador] stock del tema ilegible', e); }
    }
    const n = [...this.stockTema.values()];
    console.info(`[Nina probador] stock (${nTienda ? 'metacampo' : 'colección'}): ${n.filter(Boolean).length} con stock, ${n.filter(x => !x).length} agotados; país ${caja.dataset ? caja.dataset.npPais : '?'}`);
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
      onclick: () => { this.marca = this.marca === m ? null : m; this.pintarMarcas(); this.pintarLista(); } }, m)));
  }

  filtrados() {
    const q = sinAcentos(this.busqueda.trim());
    if (!this.marca && !q) return [];
    let L = this.tonos.filter(t => (!this.marca || this.marca === 'Todas' || t.marca === this.marca) &&
      (!q || q.split(/\s+/).every(p => sinAcentos(`${t.marca} ${t.producto} ${t.tono} ${NOMBRE_ACABADO[t.acabado]}`).includes(p))));
    if (this.orden === 'precio') L = [...L].sort((a, b) => a.precio - b.precio);
    else if (this.orden === 'color') L = [...L].sort((a, b) => tonoHue(a.hex) - tonoHue(b.hex));
    return L;
  }

  pintarLista() {
    const L = this.filtrados();
    if (!this.marca && !this.busqueda.trim()) {
      this.cuenta.textContent = `${this.tonos.length} tonos`;
      this.lista.replaceChildren(el('p', { class: 'np-vacio np-pista' }, 'Elige una marca o busca un labial para ver sus tonos.'));
      return;
    }
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
    this.consultarStock([...new Set(L.map(t => t.handle).filter(Boolean))]);
    const frag = [];
    for (const [, tsOrden] of grupos) {
      // Los tonos agotados van al final del producto, tachados
      const ts = [...tsOrden].sort((a, b) => (a.disponible === false) - (b.disponible === false));
      const p = ts[0];
      frag.push(el('section', { class: 'np-grupo' },
        el('h3', { class: 'np-grupo-titulo' }, el('span', { class: 'np-grupo-marca' }, p.marca), ' ', p.producto),
        el('div', { class: 'np-muestras' }, ts.map(t => el('button', {
          type: 'button', class: 'np-muestra' + (t.disponible === false ? ' np-agotado' : ''), style: `--tono:${t.hex}`,
          'aria-pressed': String(this.tono === t),
          title: t.disponible === false ? `${t.tono} · Agotado` : `${t.tono} · ${euros(t.precio)}`,
          'aria-label': `${t.marca} ${t.producto}, tono ${t.tono}${t.disponible === false ? ', agotado' : ''}`,
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
    const agotado = t.disponible === false;
    this.btnCesta = el('button', { type: 'button', class: 'np-btn np-btn-primario', disabled: agotado, onclick: () => this.alCarrito(t) },
      agotado ? (t.enTienda === false ? 'Próximamente' : 'Agotado') : `Añadir a la cesta · ${euros(t.precio)}`);
    this.ficha.replaceChildren(
      el('div', { class: 'np-ficha-cab' },
        el('span', { class: 'np-ficha-muestra', style: `--tono:${t.hex}` }),
        el('div', {},
          el('p', { class: 'np-ficha-marca' }, t.marca),
          el('p', { class: 'np-ficha-prod' }, t.producto),
          el('p', { class: 'np-ficha-tono' }, `${t.tono} · ${NOMBRE_ACABADO[t.acabado]}`),
          agotado ? el('p', { class: 'np-ficha-agotado' }, t.enTienda === false ? 'Todavía no está en la tienda. Puedes probártelo igualmente.' : 'Sin stock ahora mismo. Puedes probártelo igualmente.') : null)),
      el('label', { class: 'np-int', for: this.rango.id }, 'Intensidad', this.rango),
      el('div', { class: 'np-ficha-botones' },
        this.cfg.carrito ? this.btnCesta : null,
        url && t.enTienda !== false ? el('a', { class: 'np-btn np-btn-secundario', href: url }, 'Ver producto') : null),
      el('p', { class: 'np-nota' }, 'El color en pantalla es orientativo y puede variar con la luz y tu pantalla.'));
  }

  /* ---------- Stock real de Shopify ---------- */
  producto(handle) {
    if (!this.productos.has(handle)) {
      const raiz = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
      this.productos.set(handle, fetch(`${raiz}products/${handle}.js`, { credentials: 'same-origin' })
        .then(r => {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(p => (p && p.product) ? p.product : p)
        .catch(e => { console.warn('[Nina probador] stock no disponible para', handle, e); return undefined; }));
    }
    return this.productos.get(handle);
  }

  consultarStock(handles) {
    // 1) Stock renderizado por el tema (fiable y sin peticiones)
    for (const t of this.tonos) {
      if (t.disponible === undefined && this.stockTema.has(t.ean)) { t.enTienda = true; t.disponible = this.stockTema.get(t.ean); }
    }
    // 2) Para lo que falte, se pregunta a la tienda
    handles = handles.filter(h => this.tonos.some(t => t.handle === h && t.disponible === undefined));
    const nuevos = handles.filter(h => !this.productos.has(h));
    if (!nuevos.length) return;
    Promise.all(nuevos.map(h => this.producto(h).then(p => {
      if (p === undefined) return; // sin conexión: no marcamos nada
      for (const t of this.tonos) {
        if (t.handle !== h) continue;
        const v = p && varianteDe(p, t);
        // Aquí «available» depende del país del visitante, así que no sirve para tachar:
        // solo se marca «Próximamente» cuando el producto no existe en la tienda.
        // Nunca se tacha por esto: un 404 puede deberse solo al país del visitante.
        if (v) t.enTienda = true;
      }
    }))).then(() => { this.pintarLista(); if (this.tono) this.pintarFicha(); });
  }

  async alCarrito(t) {
    const b = this.btnCesta;
    b.disabled = true; b.textContent = 'Añadiendo…';
    try {
      const p = await this.producto(t.handle);
      if (!p) throw new Error('cesta');
      const v = varianteDe(p, t);
      if (!v || t.disponible === false) throw new Error('agotado');
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
      this.estado.textContent = 'Cargando la foto…';
      // Las fotos del móvil son enormes (12–48 MP) y a veces vienen giradas: se pasan a un lienzo
      // de 1280 px como máximo, ya enderezado, que es lo que usan la detección y el dibujo.
      let src, w, h;
      try {
        src = await createImageBitmap(file, { imageOrientation: 'from-image' });
        w = src.width; h = src.height;
      } catch {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();
        src = img; w = img.naturalWidth; h = img.naturalHeight;
      }
      if (!w || !h) throw new Error('foto vacía');
      const esc = Math.min(1, 1280 / Math.max(w, h));
      const foto = document.createElement('canvas');
      foto.width = Math.round(w * esc); foto.height = Math.round(h * esc);
      foto.getContext('2d').drawImage(src, 0, 0, foto.width, foto.height);
      if (src.close) src.close();
      await this.detector();
      this.pararCamara();
      this.fuente = foto; this.espejo = false;
      this.empezar();
    } catch (e) {
      console.warn('[Nina probador]', e);
      this.estado.textContent = 'No se ha podido leer la foto. Prueba con otra imagen (JPG o PNG).';
    }
    this.inputFoto.value = '';
  }

  empezar() {
    const f = this.fuente;
    const w = f.videoWidth || f.naturalWidth || f.width, h = f.videoHeight || f.naturalHeight || f.height;
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
      this.landmarks = this.suavizar(r.faceLandmarks && r.faceLandmarks[0] || null);
    } catch (e) { console.warn('[Nina probador] detección', e); this.landmarks = null; }
    this.aviso.textContent = this.fuente === this.video
      ? 'No encuentro tu cara. Mira a la cámara con buena luz.'
      : 'No encuentro una cara en esta foto. Prueba con un selfie de frente y con buena luz.';
    this.aviso.hidden = !!this.landmarks;
  }

  // Filtro adaptativo: con la cara quieta promedia (no tiembla); con movimiento rápido sigue al instante
  suavizar(lm) {
    if (!lm) { this.previos = null; return null; }
    if (this.fuente !== this.video) { this.previos = null; return lm; }
    const ancho = Math.hypot(lm[61].x - lm[291].x, lm[61].y - lm[291].y) || 0.1;
    const prev = this.previos, sal = lm.slice();
    if (prev) {
      for (const i of PUNTOS_LABIO) {
        const a = lm[i], b = prev[i];
        const d = Math.hypot(a.x - b.x, a.y - b.y) / ancho;
        const k = Math.min(1, 0.28 + d * 9);
        sal[i] = { x: b.x + (a.x - b.x) * k, y: b.y + (a.y - b.y) * k, z: a.z };
      }
    }
    this.previos = sal;
    return sal;
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
    const { ctx, mask } = this, W = mask.width, H = mask.height;
    const a = ACABADOS[t.acabado] || ACABADOS.mate, k = this.intensidad;
    const P = i => [lm[i].x * W, lm[i].y * H];
    const izq = P(61), der = P(291);
    const anchoBoca = Math.hypot(izq[0] - der[0], izq[1] - der[1]);
    if (anchoBoca < 8) return;
    const cx = (izq[0] + der[0]) / 2, cy = (P(13)[1] + P(14)[1]) / 2;
    // El contorno de MediaPipe queda un pelín por dentro del borde del labio: se abre un 3 %
    const ext = LABIO_EXT.map(i => { const [x, y] = P(i); return [cx + (x - cx) * 1.03, cy + (y - cy) * 1.05]; });
    // El interior se abre un poco hacia fuera para no teñir dientes ni lengua
    const int = LABIO_INT.map(i => { const [x, y] = P(i); return [cx + (x - cx) * 1.04, cy + (y - cy) * 1.12]; });

    // Caja de trabajo alrededor de la boca (con margen para medir la piel)
    const pad = anchoBoca * 0.35;
    const xs = ext.map(p => p[0]), ys = ext.map(p => p[1]);
    const bx = Math.max(0, Math.floor(Math.min(...xs) - pad)), by = Math.max(0, Math.floor(Math.min(...ys) - pad));
    const bw = Math.min(W, Math.ceil(Math.max(...xs) + pad)) - bx, bh = Math.min(H, Math.ceil(Math.max(...ys) + pad)) - by;
    if (bw < 4 || bh < 4) return;

    // Máscara suave: exterior menos interior, con curvas y borde difuminado
    const m = mask.getContext('2d', { willReadFrequently: true });
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(bx, by, bw, bh);
    m.filter = `blur(${Math.max(1, anchoBoca * 0.02).toFixed(1)}px)`;
    m.fillStyle = '#000';
    curva(m, ext); m.fill();
    m.globalCompositeOperation = 'destination-out';
    curva(m, int); m.fill();
    m.globalCompositeOperation = 'source-over';
    m.filter = 'none';
    const alfa = m.getImageData(bx, by, bw, bh).data;

    // Píxeles originales de esa zona (sin espejo: mismas coordenadas que los puntos)
    const tr = this.trabajo || (this.trabajo = document.createElement('canvas'));
    if (tr.width < bw || tr.height < bh) { tr.width = Math.max(bw, tr.width); tr.height = Math.max(bh, tr.height); }
    const w = tr.getContext('2d', { willReadFrequently: true });
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.clearRect(0, 0, tr.width, tr.height);
    w.drawImage(this.fuente, -bx, -by, W, H);
    const img = w.getImageData(0, 0, bw, bh), d = img.data;
    // Copia desenfocada: quita el ruido de la cámara para que los reflejos no salgan a manchas
    const su = this.suaveCv || (this.suaveCv = document.createElement('canvas'));
    su.width = bw; su.height = bh;
    const sc = su.getContext('2d', { willReadFrequently: true });
    sc.filter = `blur(${Math.max(1, anchoBoca * 0.025).toFixed(1)}px)`;
    sc.drawImage(tr, 0, 0, bw, bh, 0, 0, bw, bh);
    sc.filter = 'none';
    const ds = sc.getImageData(0, 0, bw, bh).data;

    // Luz de la escena: brillo medio del labio y de la piel de alrededor
    let sl = 0, nl = 0, sp = 0, np = 0, pr = 0, pg = 0, pb = 0;
    for (let q = 0; q < d.length; q += 4) {
      const L = 0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2];
      const al = alfa[q + 3];
      if (al > 200) { sl += L; nl++; }
      else if (al === 0 && L > 40 && L < 245) { sp += L; np++; pr += d[q]; pg += d[q + 1]; pb += d[q + 2]; }
    }
    if (!nl) return;
    const Llab = sl / nl, Lpiel = np ? sp / np : 150;
    // Luz más tenue = labial más oscuro; y un toque del color de la luz (cálida o fría)
    const luz = Math.min(1.12, Math.max(0.5, Lpiel / 150));
    const tinte = np ? [pr / np, pg / np, pb / np].map(v => v / (Lpiel || 1)) : [1, 1, 1];
    const base = hexRGB(t.hex).map((v, i) => v * luz * (0.8 + 0.2 * Math.min(1.25, tinte[i])));
    const umbral = Math.max(Llab * 1.25, Llab + 22);

    for (let q = 0; q < d.length; q += 4) {
      const al = alfa[q + 3];
      if (!al) continue;
      const r = d[q], g = d[q + 1], b = d[q + 2];
      const Lf = 0.299 * r + 0.587 * g + 0.114 * b;
      const Ls = 0.299 * ds[q] + 0.587 * ds[q + 1] + 0.114 * ds[q + 2];
      const L = Ls * 0.65 + Lf * 0.35;
      // Textura: sombras y pliegues del labio se conservan sobre el color nuevo
      const rel = Math.min(1.7, Math.max(0.35, L / Llab));
      const sombra = 1 + (rel - 1) * a.textura;
      // Brillo real: donde el labio ya refleja luz, el reflejo atraviesa el labial
      const esp = Ls > umbral ? Math.pow(Math.min(1, (Ls - umbral) / (255 - umbral + 1)), 1.4) * a.brillo * 200 : 0;
      const op = (al / 255) * a.opacidad * k;
      for (let c = 0; c < 3; c++) {
        const nuevo = base[c] * sombra + esp;
        d[q + c] = d[q + c] * (1 - op) + Math.min(255, nuevo) * op;
      }
    }
    w.putImageData(img, 0, 0);
    // ctx puede estar en espejo: se dibuja en coordenadas de la imagen, igual que el vídeo
    ctx.drawImage(tr, 0, 0, bw, bh, bx, by, bw, bh);

    // Gloss: reflejo extra y suave en el centro del labio inferior
    if (a.reflejo > 0) {
      const [x1, y1] = P(14), [x2, y2] = P(17);
      const gx = (x1 + x2) / 2, gy = y1 + (y2 - y1) * 0.42;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, anchoBoca * 0.22);
      g.addColorStop(0, `rgba(255,255,255,${(a.reflejo * k).toFixed(2)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.beginPath(); curva(ctx, ext); ctx.clip('evenodd');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g; ctx.fillRect(gx - anchoBoca, gy - anchoBoca, anchoBoca * 2, anchoBoca * 2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

// Variante del tono: por SKU o código de barras (EAN); si el producto solo tiene una, esa
function varianteDe(p, t) {
  const vs = p.variants || [];
  return vs.find(v => v.sku === t.ean || v.barcode === t.ean) || (vs.length === 1 ? vs[0] : null);
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
