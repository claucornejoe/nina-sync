// Nina Beauty · ficha de producto
// - Refresca los bloques Nina (ahorro, envío gratis, NinaCash) al cambiar de tamaño o la cesta.
// - Calcula los NinaCash según las unidades y pone el precio dentro del botón de añadir.
// - Pone las fechas de «pídelo hoy y recíbelo entre el … y el …».
// - Los tamaños a escala de la banda rosa eligen el tamaño en el selector de arriba.
// - Las miniaturas de la izquierda enseñan esa foto en la galería.

const LIVE = '[data-nina-live]';

function sep(n, dec, th) {
  const parts = Math.abs(n).toFixed(2).split('.');
  const ent = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, th);
  return (n < 0 ? '-' : '') + ent + dec + parts[1];
}

function money(cents, fmt) {
  const n = cents / 100;
  const f = fmt && fmt.indexOf('{{') !== -1 ? fmt : '{{amount_with_comma_separator}} €';
  return f
    .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, sep(n, ',', '.'))
    .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/, String(Math.round(n)))
    .replace(/\{\{\s*amount_no_decimals\s*\}\}/, String(Math.round(n)))
    .replace(/\{\{\s*amount\s*\}\}/, sep(n, '.', ','));
}

function getQty(scope) {
  const input = scope.querySelector('input[name="quantity"]');
  const q = parseInt(input ? input.value : '1', 10);
  return q > 0 ? q : 1;
}

function updateCash() {
  document.querySelectorAll('[data-nina-cash]').forEach((el) => {
    const scope = el.closest('.shopify-section') || document;
    const qty = getQty(scope);
    const price = parseInt(el.dataset.price || '0', 10) || 0;
    const pct = parseFloat(el.dataset.pct || '1') || 0;
    const fmt = el.dataset.moneyFormat;
    const out = el.querySelector('[data-nina-cash-valor]');
    if (out) out.textContent = money(Math.round((price * qty * pct) / 100), fmt);

    if (el.dataset.btnPrecio === 'true') {
      const btn = scope.querySelector('[id^="BuyButtons-ProductSubmitButton-"]');
      const holder = btn && btn.querySelector('.add-to-cart-text__content');
      if (!btn || !holder) return;
      let tag = holder.querySelector('.nina-btn-precio');
      if (btn.disabled) {
        if (tag) tag.remove();
        return;
      }
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'nina-btn-precio';
        holder.appendChild(tag);
      }
      tag.textContent = ' · ' + money(price * qty, fmt);
    }
  });
}

// --- Fecha de entrega estimada (días laborables, hora de España) ---
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function horaEspana() {
  try {
    const partes = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const v = {};
    partes.forEach((p) => (v[p.type] = p.value));
    return { fecha: new Date(Number(v.year), Number(v.month) - 1, Number(v.day)), hora: Number(v.hour) };
  } catch (e) {
    const d = new Date();
    return { fecha: new Date(d.getFullYear(), d.getMonth(), d.getDate()), hora: d.getHours() };
  }
}

function sumarLaborables(fecha, n) {
  const r = new Date(fecha);
  let quedan = n;
  while (quedan > 0) {
    r.setDate(r.getDate() + 1);
    if (r.getDay() !== 0 && r.getDay() !== 6) quedan--;
  }
  return r;
}

function diaTexto(d, conMes) {
  return DIAS[d.getDay()] + ' ' + d.getDate() + (conMes ? ' de ' + MESES[d.getMonth()] + '.' : '');
}

function updateEntrega() {
  document.querySelectorAll('[data-nina-entrega]').forEach((el) => {
    const min = parseInt(el.dataset.min || '0', 10);
    const max = parseInt(el.dataset.max || '0', 10);
    if (!(max > 0)) return;
    const corte = parseInt(el.dataset.corte || '14', 10);
    const ahora = horaEspana();
    let inicio = ahora.fecha;
    const finde = inicio.getDay() === 0 || inicio.getDay() === 6;
    if (ahora.hora >= corte || finde) {
      // el pedido sale el siguiente día laborable
      inicio = sumarLaborables(inicio, 1);
    }
    const d1 = sumarLaborables(inicio, Math.max(min, 1));
    const d2 = sumarLaborables(inicio, Math.max(max, min, 1));
    const out = el.querySelector('[data-nina-entrega-texto]');
    if (!out) return;
    if (d1.getTime() === d2.getTime()) {
      out.textContent = 'el ' + diaTexto(d2, true);
    } else if (d1.getMonth() === d2.getMonth()) {
      out.textContent = 'entre el ' + diaTexto(d1, false) + ' y el ' + diaTexto(d2, true);
    } else {
      out.textContent = 'entre el ' + diaTexto(d1, true) + ' y el ' + diaTexto(d2, true);
    }
  });
}

// --- Tamaños a escala: eligen el tamaño en el selector de la ficha ---
function mainScope() {
  const marca = document.querySelector('[data-nina-section]');
  return (marca && marca.closest('.shopify-section')) || document;
}

function onTallaClick(event) {
  const link = event.target instanceof Element ? event.target.closest('[data-nina-talla]') : null;
  if (!link) return;
  const valor = link.getAttribute('data-nina-talla');
  const scope = mainScope();
  const inputs = scope.querySelectorAll('variant-picker input[type="radio"], .variant-picker input[type="radio"]');
  const input = Array.from(inputs).find((i) => i.value === valor);
  if (!input) return; // sin selector: se sigue el enlace normal
  event.preventDefault();
  if (!input.checked) {
    const label = input.closest('label') || (input.id && scope.querySelector(`label[for="${CSS.escape(input.id)}"]`));
    (label || input).click();
  }
  document.querySelectorAll('[data-nina-talla]').forEach((a) => {
    const activa = a === link;
    a.classList.toggle('is-activa', activa);
    if (activa) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  });
  const picker = input.closest('variant-picker, .variant-picker');
  if (picker) picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- Miniaturas de la izquierda: enseñan esa foto en la galería ---
function onMiniClick(event) {
  const btn = event.target instanceof Element ? event.target.closest('[data-nina-mini]') : null;
  if (!btn) return;
  const media = btn.closest('.product-information__media') || document;
  const show = media.querySelector('slideshow-component');
  const slides = show ? Array.from(show.querySelectorAll('slideshow-slide')) : [];
  let i = slides.findIndex((s) => s.dataset.mediaId === btn.dataset.mediaId);
  if (i < 0) i = parseInt(btn.dataset.ninaMini || '0', 10);
  if (show && typeof show.select === 'function' && slides.length > 1) {
    try {
      show.select(i);
    } catch (e) {}
  }
  btn.parentElement.querySelectorAll('[data-nina-mini]').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-activa', on);
    if (on) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
}

function swapFrom(doc) {
  document.querySelectorAll(LIVE).forEach((el) => {
    const key = el.getAttribute('data-nina-live');
    const fresh = doc.querySelector(`[data-nina-live="${CSS.escape(key)}"]`);
    if (fresh) el.replaceWith(document.importNode(fresh, true));
  });
  updateCash();
  setTimeout(updateCash, 400);
}

async function refreshSection() {
  const holder = document.querySelector('[data-nina-section]');
  if (!holder) return;
  const url = new URL(window.location.href);
  url.searchParams.set('section_id', holder.getAttribute('data-nina-section'));
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    swapFrom(doc);
  } catch (e) {
    /* sin conexión: se deja como está */
  }
}

let productSelect = 'product:select';
let cartUpdate = 'cart:update';
let cartLinesUpdate = null;
try {
  const m = await import('@shopify/events');
  if (m && m.StandardEvents && m.StandardEvents.productSelect) productSelect = m.StandardEvents.productSelect;
  if (m && m.StandardEvents && m.StandardEvents.cartLinesUpdate) cartLinesUpdate = m.StandardEvents.cartLinesUpdate;
} catch (e) {}
try {
  const t = await import('@theme/events');
  if (t && t.ThemeEvents && t.ThemeEvents.cartUpdate) cartUpdate = t.ThemeEvents.cartUpdate;
} catch (e) {}

if (!window.__ninaFicha) {
  window.__ninaFicha = true;

  document.addEventListener(
    productSelect,
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('product-card, quick-add-dialog, dialog')) return;
      if (event.promise && typeof event.promise.then === 'function') {
        event.promise
          .then((result) => {
            const html = result && result.detail && result.detail.html;
            if (html) swapFrom(html);
            else refreshSection();
          })
          .catch(() => {});
      } else {
        setTimeout(refreshSection, 300);
      }
    },
    true
  );

  document.addEventListener(cartUpdate, () => refreshSection());
  // Horizon actual avisa de los cambios del carrito con cart-lines:update (con promesa)
  if (cartLinesUpdate && cartLinesUpdate !== cartUpdate) {
    document.addEventListener(cartLinesUpdate, (event) => {
      const done = event.promise && typeof event.promise.then === 'function' ? event.promise : Promise.resolve();
      done.then(() => refreshSection()).catch(() => {});
    });
  }

  const onQty = (event) => {
    const t = event.target;
    if (t instanceof HTMLInputElement && t.name === 'quantity') updateCash();
  };
  document.addEventListener('input', onQty, true);
  document.addEventListener('change', onQty, true);
  document.addEventListener(
    'click',
    (event) => {
      const t = event.target;
      if (t instanceof Element && t.closest('quantity-selector-component, .quantity-selector')) {
        setTimeout(updateCash, 0);
        setTimeout(updateCash, 150);
      }
    },
    true
  );
  document.addEventListener('click', onTallaClick);
  document.addEventListener('click', onMiniClick);

  const inicio = () => {
    updateCash();
    updateEntrega();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicio);
  } else {
    inicio();
  }
  setTimeout(updateCash, 600);
}