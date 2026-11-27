// NinaCash: suma el saldo de cada compra, calcula el nivel y crea las ventajas de cada nivel.
//
// Cómo funciona:
//  - Al pagarse un pedido (aviso orders/paid) se suma su NinaCash al momento como crédito en tienda de Shopify
//    (la clienta lo ve en su cuenta y lo puede usar al pagar). Caduca a los 12 meses.
//    Con NINACASH_ABONO=tras-devolucion se queda «pendiente» hasta 14 días después de la entrega.
//  - Si el pedido se cancela o se devuelve, se ajusta: si aún estaba pendiente se recalcula; si ya se había
//    sumado, se resta la diferencia del saldo.
//  - El nivel sale del NinaCash GANADO en los últimos 12 meses (gastarlo no baja de nivel) y se guarda como etiqueta (nivel-glam…) y en
//    metacampos de la clienta (nina.nivel, nina.ninacash_ganado, nina.nivel_siguiente, nina.gasto_12m, nina.ninacash, nina.ninacash_pendiente) para «Mi cuenta».
//  - Glam: 1 código de envío gratis al mes (nina.cupones). Butterfly: envío gratis automático y obsequio mensual
//    (el primer pedido del mes lleva la etiqueta «obsequio-butterfly»).
import { config } from '../config.js';
import * as rules from './rules.js';
import * as store from './store.js';
import * as sh from './shopify.js';
import { checkExpiring } from './expiry.js';

export const active = () => process.env.NINACASH_ACTIVO === 'true';
const GIFT_TAG = process.env.NINACASH_OBSEQUIO_TAG || 'obsequio-butterfly';
const SEGMENT_NAME = (l) => `Nivel Nina ${l.name}`;

export const state = { lastRun: null, setup: 'sin comprobar', segments: {}, busy: false };

// Una cosa cada vez, para no sumar dos veces el mismo pedido si llegan dos avisos juntos.
let chain = Promise.resolve();
export const serial = (fn) => (chain = chain.then(fn, fn).catch((e) => console.error('NinaCash:', e.message)));

async function logErr(e, ctx = {}) {
  console.error('NinaCash:', e.message);
  await store.log({ ...ctx, kind: 'error', note: e.message.slice(0, 500), dryRun: !active() }).catch(() => {});
}

/** Procesa un pedido: nuevo, pagado, enviado, cancelado o devuelto. */
export async function processOrder(orderId, origin = 'aviso') {
  const order = await sh.getOrder(orderId);
  if (!order?.customer) return { skipped: 'sin clienta (compra como invitada)' };
  const customerId = order.customer.id;
  const prev = await store.getOrder(order.id);
  const { amount, eligible, counts } = rules.orderAmounts(order);
  if (!prev && !counts) return { skipped: 'sin pagar o cancelado' };
  const dry = !active();
  const ctx = { customerId, orderName: order.name, dryRun: dry };

  // Nivel y % con el que se hizo la compra (sin contar el propio pedido).
  let levelAt = prev?.level_at;
  let rate = prev ? Number(prev.rate) : null;
  if (!prev) {
    const lvl = rules.levelFor(await store.earned12m(customerId, order.id));
    levelAt = lvl.n;
    rate = lvl.rate;
  }
  const earned = rules.earnedFor(eligible, rate);
  const releaseAt = rules.creditDate(order);
  let credited = Number(prev?.credited || 0);
  let status = prev?.status || 'pendiente';
  if (!counts) status = credited > 0 ? 'sumado' : 'anulado';

  if (!prev) await store.log({ ...ctx, kind: 'pendiente', amount: earned, note: `${rate} % de ${amount.toFixed(2)} € (nivel ${rules.LEVELS[levelAt - 1].name})${origin === 'carga' ? ' · carga inicial' : ''}` });

  // Ya sumado y luego devuelto o cancelado: se resta la diferencia (en modo prueba nunca hay nada sumado).
  if (credited > earned + 0.001) {
    const diff = rules.round2(credited - earned);
    const cust = await sh.getCustomer(customerId);
    const taken = rules.round2(Math.min(diff, sh.balanceOf(cust)));
    if (taken > 0) await sh.debit(customerId, taken);
    credited = rules.round2(credited - diff);
    await store.log({ ...ctx, kind: 'restado', amount: -taken, note: `Devolución o cancelación${taken < diff ? ` (solo quedaban ${taken.toFixed(2)} € de saldo)` : ''}` });
    if (credited <= 0 && !counts) status = 'anulado';
    if (taken < diff) await store.log({ ...ctx, kind: 'error', note: `Faltaron ${(diff - taken).toFixed(2)} € por restar: ya había gastado su NinaCash` });
  }

  // Toca sumarlo: al pagar (o entregado + 14 días si NINACASH_ABONO=tras-devolucion).
  // En modo prueba se queda «pendiente» para sumarlo de verdad cuando se active.
  if (status === 'pendiente' && counts && releaseAt && releaseAt <= new Date() && earned > 0 && !dry) {
    await sh.credit(customerId, earned, new Date(Date.now() + rules.EXPIRY_DAYS * 86400_000));
    credited = earned;
    status = 'sumado';
    await store.log({ ...ctx, kind: 'sumado', amount: earned, note: 'Sumado a su saldo (caduca en 12 meses)' });
  } else if (status === 'pendiente' && counts && earned <= 0) status = 'anulado';

  // Obsequio Butterfly: el primer pedido pagado del mes de una clienta Butterfly.
  let gift = prev?.gift || false;
  const levelNow = rules.levelFor(await store.earned12m(customerId, order.id) + (counts ? earned : 0)).n;
  if (!prev && counts && levelNow === 4 && !dry) {
    const month = rules.monthKey(new Date(order.processedAt || order.createdAt));
    if (!(await store.getMonthly(customerId, month, 'obsequio'))) {
      await sh.addTags(order.id, [GIFT_TAG]);
      await store.saveMonthly({ customer_id: customerId, month, kind: 'obsequio', order_name: order.name });
      gift = true;
      await store.log({ ...ctx, kind: 'obsequio', note: `Añadir muestra o mini al pedido ${order.name}` });
    }
  }

  await store.saveOrder({
    order_id: order.id,
    name: order.name,
    customer_id: customerId,
    paid_at: prev?.paid_at || order.processedAt || order.createdAt,
    amount,
    eligible,
    level_at: levelAt,
    rate,
    earned,
    credited,
    status,
    release_at: releaseAt,
    gift,
  });
  await refreshCustomer(customerId, order.customer.displayName);
  return { order: order.name, amount, earned, status };
}

/** Recalcula nivel, saldo y ventajas de una clienta y lo guarda en Shopify para «Mi cuenta». */
export async function refreshCustomer(customerId, name = null) {
  const dry = !active();
  const spent = rules.round2(await store.spent12m(customerId));
  const earned = rules.round2(await store.earned12m(customerId));
  const lvl = rules.levelFor(earned);
  const pending = rules.round2(await store.pendingFor(customerId));
  const before = await store.getCustomer(customerId);
  const cust = await sh.getCustomer(customerId);
  if (!cust) return null;
  const balance = sh.balanceOf(cust);

  if (!dry) {
    const want = rules.tagFor(lvl.n);
    const stale = (cust.tags || []).filter((t) => rules.LEVEL_TAGS.includes(t) && t !== want);
    await sh.removeTags(customerId, stale);
    if (!(cust.tags || []).includes(want)) await sh.addTags(customerId, [want]);
  }
  if (before && before.level !== lvl.n) {
    await store.log({ customerId, kind: 'nivel', note: `${rules.LEVELS[before.level - 1].name} → ${lvl.name} (${rules.fmtUnits(rules.toUnits(earned))} ganados en 12 meses)`, dryRun: dry });
  }
  await store.saveCustomer({ customer_id: customerId, name: name || cust.displayName, level: lvl.n, spent_12m: spent, earned_12m: earned, balance, pending });

  if (lvl.n === 3 && !dry) await ensureGlamShipping(customerId);
  if (!dry) await writeCustomerMetafields(customerId, { level: lvl.n, earned, spent, balance, pending });
  return { level: lvl.n, earned, spent, balance, pending };
}

async function writeCustomerMetafields(customerId, { level, earned, spent, balance, pending }) {
  const codes = (await store.activeMonthlyCodes(customerId)).map((m) => ({
    codigo: m.code,
    texto: `Envío gratis de tu nivel Glam (1 al mes, pedidos de menos de ${config.rules.freeShippingFrom} €)`,
    caduca: new Date(m.ends_at).toISOString().slice(0, 10),
  }));
  await sh.setMetafields([
    { ownerId: customerId, key: 'nivel', type: 'number_integer', value: level },
    { ownerId: customerId, key: 'ninacash_ganado', type: 'number_integer', value: String(rules.toUnits(earned)) },
    { ownerId: customerId, key: 'nivel_siguiente', type: 'json', value: JSON.stringify(rules.nextLevel(earned) || {}) },
    { ownerId: customerId, key: 'gasto_12m', type: 'number_decimal', value: spent.toFixed(2) },
    { ownerId: customerId, key: 'ninacash', type: 'number_decimal', value: balance.toFixed(2) },
    { ownerId: customerId, key: 'ninacash_pendiente', type: 'number_decimal', value: pending.toFixed(2) },
    { ownerId: customerId, key: 'cupones', type: 'json', value: JSON.stringify(codes) },
  ]);
}

/** Glam: un código de envío gratis personal cada mes natural. */
async function ensureGlamShipping(customerId) {
  const month = rules.monthKey();
  if (await store.getMonthly(customerId, month, 'envio-glam')) return;
  const code = rules.makeCode('GLAM');
  const endsAt = rules.endOfMonth();
  await sh.createPersonalFreeShipping({ code, title: `Glam · envío gratis ${month} · ${code}`, customerId, endsAt });
  await store.saveMonthly({ customer_id: customerId, month, kind: 'envio-glam', code, ends_at: endsAt });
  await store.log({ customerId, kind: 'envio-glam', note: `Código ${code} hasta fin de mes` });
}

/** Segmentos por nivel, envío gratis Butterfly y metacampos. Se hace al arrancar (solo si NinaCash está activo). */
export async function setup() {
  if (!active()) {
    state.setup = 'modo prueba (NINACASH_ACTIVO no es true): no se crea nada en Shopify';
    return;
  }
  for (const l of rules.LEVELS) state.segments[l.n] = await sh.ensureSegment(SEGMENT_NAME(l), `customer_tags CONTAINS '${rules.tagFor(l.n)}'`);

  const autoId = await store.getSetting('butterfly_free_shipping');
  if (!(await sh.discountExists(autoId))) {
    const id = await sh.createAutomaticFreeShipping('Butterfly · envío gratis siempre', state.segments[4]);
    await store.setSetting('butterfly_free_shipping', id);
  }

  const def = (key, name, type, description) => ({ key, name, type, description, ownerType: 'CUSTOMER' });
  await sh.ensureDefinitions([
    def('nivel', 'Nivel Nina', 'number_integer', '1 Sparkle, 2 Glow, 3 Glam, 4 Butterfly (lo pone Nina Sync)'),
    def('ninacash_ganado', 'NinaCash ganado 12 meses', 'number_integer', 'NinaCash ganados en 12 meses (1 NinaCash = 1 céntimo): suben el nivel (lo pone Nina Sync)'),
    def('nivel_siguiente', 'Siguiente nivel Nina', 'json', '{nivel, nombre, falta}: NinaCash que faltan para el siguiente nivel ({} si es Butterfly)'),
    { key: 'niveles', name: 'Niveles Nina', type: 'json', ownerType: 'SHOP', description: '[{nivel, nombre, ninacash, compras, porcentaje}] NinaCash (1 = 1 céntimo) para cada nivel' },
    def('gasto_12m', 'Compras últimos 12 meses', 'number_decimal', 'Euros comprados en los últimos 12 meses (lo pone Nina Sync)'),
    def('ninacash', 'Saldo NinaCash', 'number_decimal', 'Saldo disponible en euros (crédito en tienda)'),
    def('ninacash_pendiente', 'NinaCash pendiente', 'number_decimal', 'Se suma 14 días después de la entrega'),
    def('ninacash_caduca', 'NinaCash que caduca pronto', 'json', '{importe, fecha} del saldo que caduca en los próximos 30 días'),
    def('cupones', 'Cupones personales', 'json', 'Códigos personales activos [{codigo, texto, caduca}]'),
    { key: 'cupones_semana', name: 'Cupones de la semana por nivel', type: 'json', ownerType: 'SHOP', description: '[{codigo, texto, caduca, niveles:[1-4], nivel_min}]' },
  ]);
  // Umbrales para los textos de la tienda («Acumula 5,25 € de NinaCash para llegar a Glam»).
  await sh.setMetafields([{ ownerId: await sh.shopId(), key: 'niveles', type: 'json', value: JSON.stringify(levelsTable()) }]);
  state.setup = 'listo';
}

/** [{nivel, nombre, ninacash, compras, porcentaje}] para el tema y el panel. */
export const levelsTable = () => rules.LEVELS.map((l) => ({ nivel: l.n, nombre: l.name, ninacash: l.from, compras: rules.salesFor(l.from), porcentaje: l.rate }));

/** Repaso diario: suma lo que ya toca, revisa devoluciones, baja o sube niveles y pone Sparkle a las cuentas nuevas. */
export async function dailyRun({ backfill = false } = {}) {
  if (state.busy) return { already: true };
  state.busy = true;
  const r = { orders: 0, customers: 0, newSparkle: 0, errors: 0 };
  try {
    if (backfill) {
      for await (const o of sh.recentOrders(365)) {
        if (!o.customer || (await store.getOrder(o.id))) continue;
        try {
          const x = await processOrder(o.id, 'carga');
          if (!x.skipped) r.orders++;
        } catch (e) {
          r.errors++;
          await logErr(e, { orderName: o.name });
        }
      }
    }
    for (const id of await store.ordersToRevisit()) {
      try {
        await processOrder(id, 'repaso');
        r.orders++;
      } catch (e) {
        r.errors++;
        await logErr(e);
      }
    }
    for (const c of await store.allCustomers()) {
      try {
        await refreshCustomer(c.customer_id);
        r.customers++;
      } catch (e) {
        r.errors++;
        await logErr(e, { customerId: c.customer_id });
      }
    }
    if (active()) {
      for await (const c of sh.customersWithoutLevel(rules.LEVEL_TAGS)) {
        try {
          await sh.addTags(c.id, [rules.tagFor(1)]);
          r.newSparkle++;
        } catch (e) {
          r.errors++;
          await logErr(e, { customerId: c.id });
        }
      }
    }
    await publishWeeklyCoupons();
    try {
      const x = await checkExpiring({ active: active(), setMetafields: sh.setMetafields, log: store.log });
      r.expiryMails = x.sent;
    } catch (e) {
      r.errors++;
      await logErr(e);
    }
  } finally {
    state.busy = false;
    state.lastRun = { at: new Date(), ...r };
  }
  return r;
}

/** Cuenta nueva: nivel Sparkle desde el primer día (para que le lleguen los cupones de su nivel). */
export async function newCustomer(customerId) {
  if (active()) await sh.addTags(customerId, [rules.tagFor(1)]);
}

/** Cupón de la semana solo para los niveles elegidos. */
export async function createCoupon({ code, text, levels, kind, value, minTotal, startsAt, endsAt }) {
  if (!active()) throw new Error('NinaCash está en modo prueba: pon NINACASH_ACTIVO=true en Railway para crear cupones de verdad.');
  if (!Object.keys(state.segments).length) await setup();
  const segmentIds = levels.map((n) => state.segments[n]).filter(Boolean);
  if (!segmentIds.length) throw new Error('Elige al menos un nivel.');
  const names = levels.map((n) => rules.LEVELS[n - 1].name).join(', ');
  const id = await sh.createLevelCoupon({ code, title: `${code} · solo ${names}`, segmentIds, kind, value, minTotal, startsAt, endsAt });
  await store.saveCoupon({ code, discount_id: id, text, levels, kind, value, min_total: minTotal || null, starts_at: startsAt, ends_at: endsAt });
  await store.log({ kind: 'cupon', note: `${code}: ${kind === 'porcentaje' ? value + ' %' : value + ' €'} solo para ${names}` });
  await publishWeeklyCoupons();
  return id;
}

/** Copia los cupones activos al metacampo de la tienda nina.cupones_semana, que lee «Mi cuenta». */
export async function publishWeeklyCoupons() {
  if (!active()) return;
  const now = new Date();
  const list = (await store.activeCoupons())
    .filter((c) => new Date(c.starts_at) <= now)
    .map((c) => ({
      codigo: c.code,
      texto: c.text || (c.kind === 'porcentaje' ? `${Number(c.value)} % de descuento` : `${Number(c.value).toFixed(2).replace('.', ',')} € de descuento`),
      caduca: new Date(c.ends_at).toISOString().slice(0, 10),
      niveles: c.levels,
      nivel_min: Math.min(...c.levels),
    }));
  await sh.setMetafields([{ ownerId: await sh.shopId(), key: 'cupones_semana', type: 'json', value: JSON.stringify(list) }]);
}
