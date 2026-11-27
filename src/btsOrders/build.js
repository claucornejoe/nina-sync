// Convierte un pedido de Shopify en un pedido de dropshipping de BTS (funciones puras, sin red).

export const isEan = (s) => /^\d{8,14}$/.test(String(s || '').trim());

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Teléfono en formato internacional; los de España sin prefijo llevan +34. */
export function normalizePhone(p, country = 'ES') {
  let t = String(p || '').replace(/[^\d+]/g, '');
  if (!t) return '';
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (!t.startsWith('+') && country === 'ES' && /^[6789]\d{8}$/.test(t)) t = '+34' + t;
  return t;
}

/**
 * @param {object} o pedido de Shopify (ver ORDER_FIELDS en shopify.js)
 * @returns {{ ok: boolean, problems: string[], lines: {sku,quantity,name}[], other: {name,quantity}[], address: object }}
 */
export function buildBtsOrder(o) {
  const problems = [];
  const a = o.shippingAddress || {};
  const country = a.countryCodeV2 || '';
  const lines = [];
  const other = [];
  const qty = new Map();
  for (const li of o.lineItems?.nodes || []) {
    const q = Number(li.currentQuantity ?? li.quantity ?? 0);
    if (q <= 0) continue;
    const sku = clean(li.variant?.sku || li.sku);
    if (!isEan(sku)) {
      other.push({ name: li.name, quantity: q });
      continue;
    }
    if (!qty.has(sku)) lines.push({ sku, quantity: 0, name: li.name });
    qty.set(sku, (qty.get(sku) || 0) + q);
  }
  for (const l of lines) l.quantity = qty.get(l.sku);

  const name = clean(a.name || [a.firstName, a.lastName].filter(Boolean).join(' '));
  const address = {
    client_name: name,
    address: clean([a.address1, a.address2].filter(Boolean).join(', ')),
    postal_code: clean(a.zip),
    city: clean(a.city),
    country_code: country,
    telephone: normalizePhone(a.phone || o.phone || o.billingAddress?.phone, country),
  };

  if (o.cancelledAt) problems.push('El pedido está cancelado');
  if (!o.shippingAddress) problems.push('El pedido no tiene dirección de envío');
  if (country && country !== 'ES') problems.push(`Envío fuera de España (${country})`);
  for (const [k, label] of [
    ['client_name', 'nombre'],
    ['address', 'dirección'],
    ['postal_code', 'código postal'],
    ['city', 'ciudad'],
    ['telephone', 'teléfono'],
  ])
    if (o.shippingAddress && !address[k]) problems.push(`Falta el ${label} de la clienta`);
  if (!lines.length) problems.push('No hay productos de BTS en este pedido');
  return { ok: problems.length === 0, problems, lines, other, address };
}

/** Parámetros del formulario de setCreateOrder. */
export function createOrderParams(built, shippingCostId, paymentMethod = 'wallet') {
  const p = [['payment_method', paymentMethod]];
  built.lines.forEach((l, i) => {
    p.push([`products[${i}][sku]`, l.sku]);
    p.push([`products[${i}][quantity]`, String(l.quantity)]);
  });
  p.push(['shipping_cost_id', String(shippingCostId)]);
  for (const k of ['client_name', 'address', 'postal_code', 'city', 'country_code', 'telephone']) p.push([k, built.address[k]]);
  p.push(['dropshipping', '1']);
  return p;
}

/** Elige el envío más barato (gratis si el subtotal supera free_shipping); a igualdad, el más rápido. */
export function pickShipping(rates, subtotal = 0) {
  const list = (Array.isArray(rates) ? rates : rates?.shipping_prices || rates?.data || []).filter((r) => r && r.id != null);
  if (!list.length) return null;
  const cost = (r) => (r.free_shipping && subtotal >= Number(r.free_shipping) ? 0 : Number(r.shipping_cost) || 0);
  return [...list].sort((x, y) => cost(x) - cost(y) || (Number(x.delivery_time) || 99) - (Number(y.delivery_time) || 99))[0];
}

/** Enlace de seguimiento según el transportista (si se conoce). */
export function trackingUrl(company, number) {
  const c = String(company || '').toUpperCase();
  const n = encodeURIComponent(String(number || '').replace(/^[A-Z]+-/, ''));
  if (c.includes('GLS')) return `https://gls-group.com/ES/es/seguimiento-envio?match=${n}`;
  if (c.includes('SEUR')) return `https://www.seur.com/livetracking/?segOnlineIdentificador=${n}`;
  if (c.includes('CORREOS EXPRESS')) return `https://s.correosexpress.com/SeguimientoSinCP/search?shippingNumber=${n}`;
  if (c.includes('CORREOS')) return `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number=${n}`;
  if (c.includes('MRW')) return `https://www.mrw.es/seguimiento_envios/MRW_resultados_consultas.asp?num=${n}`;
  if (c.includes('DHL')) return `https://www.dhl.com/es-es/home/tracking.html?tracking-id=${n}`;
  if (c.includes('UPS')) return `https://www.ups.com/track?tracknum=${n}`;
  return null;
}

/** Nombre del transportista: de getOrder, o del prefijo del número (GLS-123…). */
export function carrierOf(order, tracking) {
  if (order?.shipping_company) return order.shipping_company;
  const m = String(tracking || '').match(/^([A-Z]+)-/);
  return m ? m[1] : 'Otro';
}
