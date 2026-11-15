# Nina Sync

Sincroniza el stock y los precios de **BTS Wholesaler** con la tienda Shopify de **Nina Beauty** (ikwg4h-mk.myshopify.com).

## Qué hace

- **Stock**: si BTS tiene menos de 3 unidades de un EAN, en Shopify se pone 0. Con 3 o más, se pone la cantidad real. Si BTS ya no tiene el EAN, se pone 0.
- **Precio**: recalcula el precio de venta con la fórmula de Nina Beauty:
  `(coste BTS × 1,21 ÷ 0,70 + 6 + 0,35) ÷ 0,911`, redondeado hacia arriba a ,95.
  Si supera el PVP recomendado, se baja al PVP (y a ,95 si sigue ganando más de 0,50 €). El PVP se muestra tachado.
  Si a PVP pierde dinero, ese tamaño se pone con stock 0.
- **Ofertas de la semana**: si el precio baja, el producto recibe la etiqueta `oferta-semana` durante 7 días.
  En Shopify, una colección automática con la condición «Etiqueta del producto es igual a oferta-semana» los muestra solos.
- **Informe** de cada sincronización, con fecha, hora y todos los cambios, destacando bajadas de precio y productos en oferta. Se puede descargar en CSV y, si hay SMTP configurado, llega por correo.
- **Cuándo**: cada 4 horas de forma automática y cuando quieras con el botón «Sincronizar ahora» del panel.
- Los productos con la etiqueta `precio-manual` no cambian de precio (solo de stock).
- Antes de tocar nada comprueba que la tienda conectada es la de Nina Beauty. Si BTS no trae más de la mitad de los EAN, cancela para no vaciar la tienda por un fallo de BTS.

Empareja por **EAN**, que está en el SKU de cada tamaño en Shopify. Consulta BTS con `getProducts` (25 EAN por llamada, respetando el límite de 120 peticiones por minuto): con unos 3.700 tamaños tarda alrededor de un minuto y medio.

## Google y descripciones

Página **Google y descripciones** del panel (`/seo`). A cada producto, en cuanto se crea (aviso `products/create` de Shopify) y en un repaso cada hora:

- **Categoría de producto de Shopify** (la taxonomía que Shopify envía a Google). Los perfumes por reglas, según su tipo (Eau de Parfum, Eau de Toilette, colonia, body mist, extracto…). Lo que no sea perfume, con IA entre las categorías que da la búsqueda de Shopify.
- **Descripción breve con IA** (OpenAI, `OPENAI_API_KEY`): una o dos frases y una lista con marca, tipo, para quién, familia olfativa, notas y tamaños. Sin precios, envíos, ofertas ni nombre de la tienda, como pide Google. Si la IA no está segura de las notas, no las pone. Solo sustituye la descripción plantilla o una vacía; una escrita a mano no se toca.
- **Campos de Google Shopping**: género (de las etiquetas Mujer/Hombre/Unisex), edad «adult» y estado «new», y el EAN como código de barras si falta.
- **Fotos «No image available» de BTS**: pone la foto real de otro tamaño si BTS la tiene; si no, el logo de Nina (`public/sin-foto.png`) hasta tener fotos reales. Necesita el permiso `write_files` en la app de Shopify.
- **Nunca toca etiquetas** ni colecciones. Los productos con la etiqueta `seo-manual` se saltan.

Desde la página se puede probar con un producto (ver sin guardar o rehacer y guardar) y lanzar un repaso de todo. El aviso de productos nuevos se registra solo al arrancar si `PUBLIC_URL` está puesta.

## Puesta en marcha en Railway

1. **New Project → Deploy from GitHub repo** → `nina-sync`.
2. En el proyecto, **New → Database → PostgreSQL**.
3. En el servicio `nina-sync` → **Variables**, copia las de `.env.example` con tus valores. Empieza con `DRY_RUN=true`.
4. **Settings → Networking → Generate Domain** para tener la dirección del panel.
5. Entra al panel con `PANEL_PASSWORD`, pulsa **Sincronizar ahora** y revisa el informe (en modo prueba no cambia nada).
6. Si el informe está bien, cambia `DRY_RUN` a `false`.

## Desarrollo

```bash
npm install
npm test              # pruebas de la fórmula y de la planificación
npm run sync -- --prueba   # una sincronización de prueba desde la terminal
npm start             # panel web en el puerto 3000
```

## NinaCash y niveles

Página **NinaCash** del panel (`/ninacash`). Con avisos de Shopify (`orders/paid`, `orders/cancelled`, `orders/fulfilled`, `refunds/create`, `customers/create`) y un repaso diario:

- **NinaCash**: cada pedido pagado con cuenta genera el 1 %, 1,5 % o 2 % (según el nivel con el que se compró) de los productos tras descuentos, sin envío ni la parte pagada con NinaCash. Queda **pendiente** y se suma 14 días después de la entrega como **crédito en tienda** de Shopify (caduca a los 12 meses). La clienta lo ve en su cuenta y, con la sesión iniciada, lo aplica al pagar en el checkout. Si devuelve o se cancela, se ajusta o se resta.
- **Nivel** por compras de los últimos 12 meses: Sparkle 0 €, Glow 100 €, Glam 250 €, Butterfly 500 €. Etiqueta en la clienta (`nivel-sparkle`, `nivel-glow`, `nivel-glam`, `nivel-butterfly`) y segmentos «Nivel Nina …» para limitar descuentos.
- **Metacampos para «Mi cuenta»** (espacio `nina` del cliente): `nivel` (1-4), `gasto_12m`, `ninacash`, `ninacash_pendiente`, `cupones` (JSON de códigos personales). En la tienda: `nina.cupones_semana` (JSON con `codigo`, `texto`, `caduca`, `niveles`, `nivel_min`).
- **Cupones por nivel**: se crean en el panel eligiendo niveles; Shopify solo los acepta a clientas de esos segmentos. También se puede elegir el segmento al crear un descuento en el admin.
- **Glam**: un código de envío gratis personal cada mes. **Butterfly**: envío gratis automático y la etiqueta `obsequio-butterfly` en su primer pedido del mes.
- `NINACASH_ACTIVO=false` (por defecto) es modo prueba: calcula y apunta, pero no cambia nada en Shopify.

## Avisos de stock («Agotado · Avísame»)

Página `/avisos` del panel. Código en `src/stockAlerts/`.

- **Formulario de la tienda → `POST /api/avisame`** (JSON `{ email, variant_id, consent: true }`). Solo acepta peticiones desde `STORE_ORIGINS`, comprueba que el tamaño existe y está agotado, y guarda la solicitud con el texto de consentimiento. Límite de 10 por hora por IP, 20 pendientes por correo y un campo trampa `website` contra robots.
- **Al final de cada sincronización** (y con «Revisar ahora»), los tamaños pedidos que ya tienen stock reciben el correo «¡Ha vuelto!» (`email.js`). Con `ALERT_LOW_STOCK_MAX` unidades o menos dice «Han llegado pocas unidades»; si hay más, «La última vez se agotó».
- **RGPD:** un solo correo por solicitud; al enviarlo se borra la dirección. Las solicitudes sin reposición en `ALERT_EXPIRE_DAYS` días también se borran. Desde el panel se pueden borrar todos los avisos de un correo.
- Los correos salen por la misma cuenta SMTP de Google Workspace (`sendCustomerMail` en `src/mail.js`), que sirve también para otros correos a clientas. Sin SMTP, las solicitudes se guardan y esperan.
