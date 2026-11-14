// Reglas de NinaCash y de los niveles Nina (sin acceso a Shopify ni a la base de datos, para poder probarlas).

const num = (name, def) => (process.env[name] ? Number(process.env[name]) : def);

/** Niveles por compras de los últimos 12 meses. Ventajas acordadas con Clau el 2026-11-14. */
export const LEVELS = [
  { n: 1, key: 'sparkle', name: 'Sparkle', from: 0, rate: num('NINACASH_PCT_1', 1) },
  { n: 2, key: 'glow', name: 'Glow', from: num('NIVEL_GLOW_DESDE', 100), rate: num('NINACASH_PCT_2', 1.5) },
  { n: 3, key: 'glam', name: 'Glam', from: num('NIVEL_GLAM_DESDE', 250), rate: num('NINACASH_PCT_3', 2) },
  { n: 4, key: 'butterfly', name: 'Butterfly', from: num('NIVEL_BUTTERFLY_DESDE', 500), rate: num('NINACASH_PCT_4', 2) },
];

export const LEVEL_TAGS = LEVELS.map((l) => `nivel-${l.key}`);
export const tagFor = (n) => `nivel-${LEVELS[n - 1].key}`;

export const RETURN_DAYS = num('NINACASH_DIAS_DEVOLUCION', 14); // plazo de devolución tras la entrega
export const TRANSIT_DAYS = num('NINACASH_DIAS_TRANSPORTE', 3); // si Shopify no sabe la fecha de entrega
export const EXPIRY_DAYS = num('NINACASH_CADUCIDAD_DIAS', 365);

export const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

/** Nivel (1-4) según lo comprado en los últimos 12 meses. */
export function levelFor(spent12m) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) if (Number(spent12m) >= l.from) lvl = l;
  return lvl;
}

const isStoreCredit = (t) => /store.?credit|cr[eé]dito/i.test(`${t.gateway || ''} ${t.formattedGateway || ''}`);
const money = (set) => Number(set?.shopMoney?.amount || 0);

/** Parte del pedido pagada con NinaCash (crédito en tienda), restando lo que se haya devuelto a ese saldo. */
export function storeCreditUsed(transactions = []) {
  let used = 0;
  for (const t of transactions) {
    if (t.status !== 'SUCCESS' || !isStoreCredit(t)) continue;
    if (t.kind === 'SALE' || t.kind === 'CAPTURE') used += money(t.amountSet);
    else if (t.kind === 'REFUND') used -= money(t.amountSet);
  }
  return Math.max(0, round2(used));
}

const PAID = new Set(['PAID', 'PARTIALLY_REFUNDED']);

/**
 * Lo que cuenta de un pedido:
 *  - amount: importe de los productos después de descuentos y devoluciones (sin envío). Es lo que sube el nivel.
 *  - eligible: amount menos lo pagado con NinaCash. Sobre esto se calcula el NinaCash que genera.
 */
export function orderAmounts(order) {
  if (!order || order.cancelledAt || !PAID.has(order.displayFinancialStatus)) return { amount: 0, eligible: 0, counts: false };
  const amount = Math.max(0, round2(money(order.currentSubtotalPriceSet)));
  const eligible = Math.max(0, round2(amount - storeCreditUsed(order.transactions?.nodes || order.transactions || [])));
  return { amount, eligible, counts: amount > 0 };
}

export const earnedFor = (eligible, rate) => Math.max(0, round2((Number(eligible) * Number(rate)) / 100));

/** Cuándo se suma el NinaCash: 14 días después de la entrega (o del envío + 3 días si no hay fecha de entrega). */
export function releaseDate(order) {
  const fs = order?.fulfillments || [];
  if (!fs.length) return null;
  let best = null;
  for (const f of fs) {
    if (f.status === 'CANCELLED') continue;
    const d = f.deliveredAt ? new Date(f.deliveredAt) : f.createdAt ? new Date(new Date(f.createdAt).getTime() + TRANSIT_DAYS * 86400_000) : null;
    if (d && (!best || d > best)) best = d;
  }
  return best ? new Date(best.getTime() + RETURN_DAYS * 86400_000) : null;
}

/** «2026-11» en la hora de Madrid. */
export function monthKey(d = new Date(), tz = 'Europe/Madrid') {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(d);
  return `${p.find((x) => x.type === 'year').value}-${p.find((x) => x.type === 'month').value}`;
}

/** Último instante del mes (hora de Madrid aproximada: 23:59 del último día, UTC+1). */
export function endOfMonth(d = new Date()) {
  const [y, m] = monthKey(d).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 22, 59, 59)); // 23:59:59 en invierno; en verano es 00:59 del día 1, margen aceptable
}

/** Código único y legible, p. ej. GLAM-NOV-7KQ2. */
export function makeCode(prefix, d = new Date()) {
  const mes = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][Number(monthKey(d).slice(5)) - 1];
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 5; i++) r += abc[Math.floor(Math.random() * abc.length)];
  return `${prefix}-${mes}-${r}`;
}

/** Normaliza un código de cupón escrito en el panel. */
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
