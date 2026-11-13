// Configuración leída de las variables de entorno (Railway > Variables).
function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}
const num = (name, def) => (process.env[name] ? Number(process.env[name]) : def);

export const config = {
  port: num('PORT', 3000),
  panelPassword: process.env.PANEL_PASSWORD || '',
  dryRun: process.env.DRY_RUN === 'true',
  cron: process.env.SYNC_CRON || '0 */4 * * *',
  timezone: process.env.TZ_SYNC || 'Europe/Madrid',

  shopify: {
    // Debe ser la tienda de Nina Beauty. Nunca lafarmacia.es.
    shop: () => req('SHOPIFY_SHOP'), // ikwg4h-mk.myshopify.com
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN, // alternativa a client id/secret
    apiVersion: process.env.SHOPIFY_API_VERSION || '2026-10',
    locationId: process.env.SHOPIFY_LOCATION_ID, // opcional: si falta, usa la primera
  },

  bts: {
    apiUrl: () => (process.env.BTS_API_URL || 'https://api.btswholesaler.com/v1/api').replace(/\/+$/, ''),
    token: () => req('BTS_TOKEN'),
    lang: process.env.BTS_LANG || 'es-ES',
  },

  rules: {
    minStock: num('MIN_STOCK', 3), // menos de esto => 0
    vat: num('VAT', 1.21),
    margin: num('MARGIN_DIVISOR', 0.7),
    shipping: num('SHIPPING_COST', 6), // lo que cobra BTS por pedido
    shippingPrice: num('SHIPPING_PRICE', 4.95), // lo que paga el cliente por debajo del mínimo
    freeShippingFrom: num('FREE_SHIPPING_FROM', 39), // envío gratis desde este importe
    paypalFixed: num('PAYPAL_FIXED', 0.35),
    paypalNet: num('PAYPAL_NET', 0.911),
    minProfitAfterRounding: num('MIN_PROFIT_ROUNDING', 0.5),
    rounding: process.env.PRICE_ROUNDING || 'charm', // charm: ,99 hasta 100 € y ...9 € desde 100 €; '99'; '95'
    minProfit: num('MIN_PROFIT', 2), // ganancia mínima por producto (si el PVP lo permite)
    offerTag: process.env.OFFER_TAG || 'oferta-semana',
    offerDays: num('OFFER_DAYS', 7),
    manualPriceTag: process.env.MANUAL_PRICE_TAG || 'precio-manual',
    newProductsDays: num('NEW_PRODUCTS_DAYS', 7),
    newArrivalTag: process.env.NEW_ARRIVAL_TAG || 'recien-llegado',
    newArrivalDays: num('NEW_ARRIVAL_DAYS', 30),
    autoCreateNew: process.env.AUTO_CREATE_NEW !== 'false',
  },

  databaseUrl: process.env.DATABASE_URL,

  mail: {
    host: process.env.SMTP_HOST,
    port: num('SMTP_PORT', 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    to: process.env.REPORT_TO,
    from: process.env.REPORT_FROM || process.env.SMTP_USER,
  },
  publicUrl: process.env.PUBLIC_URL || '',
};
