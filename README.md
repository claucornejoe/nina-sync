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

## Foro Nina

Página **Foro Nina** del panel (`/foro`) y foro público en **www.ninabeauty.es/apps/foro**, todo en español de España y con el diseño Nina.

- Las clientas leen sin cuenta; para **abrir un tema o responder** inician sesión con su cuenta de Nina Beauty. Eligen su nombre en el foro (se propone «Laura M.»); el correo nunca se muestra.
- La primera vez aceptan las normas, la política de privacidad y que tienen **14 años o más** (edad de consentimiento en España).
- **Moderación**: por defecto revisas todo antes de publicarlo (`FORO_MODERACION=previa`). Con `confianza`, las clientas con 2 mensajes aprobados publican directamente, salvo que el texto lleve enlaces, redes, teléfonos, correos, insultos o promesas de salud.
- «Me ayudó», «Avisar de un problema» (con 3 avisos se oculta hasta que lo revises), temas destacados, respuestas con la etiqueta **Equipo Nina** y bloqueo de clientas.
- Correo a `REPORT_TO` cuando hay mensajes por revisar (como mucho uno cada 30 minutos).
- SEO: las páginas se sirven en el dominio de la tienda, dentro del tema, con datos estructurados `DiscussionForumPosting` en `es-ES`.
- `/apps/foro/ultimos.json` da los últimos temas para mostrarlos en el Nina Blog.

**Activarlo (una vez):** en el Dev Dashboard de Shopify, app Nina Sync → configuración → **Proxy de la aplicación**: prefijo `apps`, subruta `foro`, URL `https://<tu-dominio-de-railway>/proxy/foro`. Publica la versión. Las peticiones llegan firmadas con el secreto de la app (`SHOPIFY_CLIENT_SECRET`) y Nina Sync rechaza las que no lo están.

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

- **NinaCash**: cada pedido pagado con cuenta genera el 1 %, 1,5 % o 2 % (según el nivel con el que se compró) de los productos tras descuentos, sin envío ni la parte pagada con NinaCash. Se suma **al pagar** como **crédito en tienda** de Shopify (caduca a los 12 meses). La clienta lo ve en su cuenta y, con la sesión iniciada, lo aplica al pagar en el checkout. Si devuelve o se cancela, se resta (si ya lo gastó, se resta lo que quede y se avisa en el panel). Con `NINACASH_ABONO=tras-devolucion` se espera a 14 días después de la entrega.
- **Nivel** por NinaCash **ganado** en los últimos 12 meses (gastarlo no baja de nivel): 1 NinaCash = 1 céntimo de saldo. Sparkle 0, Glow 150 NinaCash (≈150 € de compras), Glam 525 (≈400 €), Butterfly 1.325 (≈800 €). Se cambian con `NIVEL_*_NINACASH`. Metacampos `nina.ninacash_ganado` (entero, en NinaCash), `nina.nivel_siguiente` ({nivel, nombre, falta}) y, en la tienda, `nina.niveles`. Etiqueta en la clienta (`nivel-sparkle`, `nivel-glow`, `nivel-glam`, `nivel-butterfly`) y segmentos «Nivel Nina …» para limitar descuentos.
- **Metacampos para «Mi cuenta»** (espacio `nina` del cliente): `nivel` (1-4), `gasto_12m`, `ninacash`, `ninacash_pendiente`, `cupones` (JSON de códigos personales). En la tienda: `nina.cupones_semana` (JSON con `codigo`, `texto`, `caduca`, `niveles`, `nivel_min`).
- **Cupones por nivel**: se crean en el panel eligiendo niveles; Shopify solo los acepta a clientas de esos segmentos. También se puede elegir el segmento al crear un descuento en el admin.
- **Glam**: un código de envío gratis personal cada mes. **Butterfly**: envío gratis automático y la etiqueta `obsequio-butterfly` en su primer pedido del mes.
- `NINACASH_ACTIVO=false` (por defecto) es modo prueba: calcula y apunta, pero no cambia nada en Shopify.
- **Caducidad**: cada saldo caduca a los 12 meses (lo quita Shopify). 30 y 7 días antes, Nina Sync envía un correo desde `avisos@ninabeauty.es` (si hay SMTP) y guarda `nina.ninacash_caduca` (`{importe, fecha}`) para el aviso de Mi cuenta y del carrito.

## Avisos de stock («Agotado · Avísame»)

Página `/avisos` del panel. Código en `src/stockAlerts/`.

- **Formulario de la tienda → `POST /api/avisame`** (JSON `{ email, variant_id, consent: true }`). Solo acepta peticiones desde `STORE_ORIGINS`, comprueba que el tamaño existe y está agotado, y guarda la solicitud con el texto de consentimiento. Límite de 10 por hora por IP, 20 pendientes por correo y un campo trampa `website` contra robots.
- **Al final de cada sincronización** (y con «Revisar ahora»), los tamaños pedidos que ya tienen stock reciben el correo «¡Ha vuelto!» (`email.js`). Con `ALERT_LOW_STOCK_MAX` unidades o menos dice «Han llegado pocas unidades»; si hay más, «La última vez se agotó».
- **RGPD:** un solo correo por solicitud; al enviarlo se borra la dirección. Las solicitudes sin reposición en `ALERT_EXPIRE_DAYS` días también se borran. Desde el panel se pueden borrar todos los avisos de un correo.
- Los correos salen desde **avisos@ninabeauty.es** (`MAIL_FROM`) por la cuenta SMTP de Google Workspace (`sendCustomerMail` en `src/mail.js`), que sirve también para otros correos a clientas. Sin SMTP, las solicitudes se guardan y esperan.

## Competencia (`/competencia`)

Compara tus precios con Google Shopping España, buscando cada tamaño por su EAN con [SerpApi](https://serpapi.com) (plan gratis: 250 búsquedas al mes).

- Cada día a las 05:15 (Madrid) gasta la parte del presupuesto mensual que toca; primero los nunca comprobados y los más caros. Botón «Buscar 25 productos ahora».
- Quita nuestra tienda, muestras, decants, testers y precios absurdos (< 50 % de la mediana).
- Posición frente a la tienda más barata: mejor precio, en línea (≤ 5 %), por encima, muy por encima (> 15 %).
- «Revisar ajuste» → pantalla de confirmación → «Sí, aplicar». El precio sugerido queda 1 céntimo por debajo de la más barata (redondeo de la tienda), nunca por debajo del margen mínimo. Solo baja precios.
- El ajuste dura 30 días y la sincronización lo respeta; si BTS sube el coste, lo sube lo justo para mantener el margen mínimo. `precio-manual` no se toca. `DRY_RUN=true` no cambia nada.

| Variable | Por defecto | Para qué |
|---|---|---|
| `SERPAPI_KEY` | — | Clave de SerpApi (obligatoria) |
| `COMPETENCIA_BUSQUEDAS_MES` | 250 | Búsquedas al mes que puede gastar |
| `COMPETENCIA_GANANCIA_MIN` | 3 | Ganancia mínima en € al ajustar |
| `COMPETENCIA_MARGEN_MIN_PCT` | 10 | Ganancia mínima en % del precio al ajustar |
| `COMPETENCIA_MUY_CARO_PCT` | 15 | Desde qué % más caro es «muy por encima» |
| `COMPETENCIA_EN_LINEA_PCT` | 5 | Hasta qué % más caro es «en línea» |
| `COMPETENCIA_AJUSTE_DIAS` | 30 | Días que dura un ajuste |
| `COMPETENCIA_REVISAR_DIAS` | 30 | Días antes de volver a buscar un producto |
| `COMPETENCIA_AUTO` | true | `false` apaga la búsqueda diaria |

## Fotos con IA (`/fotos-ia`)

Para los productos que solo tienen el logo de Nina: busca la foto por EAN en Google Imágenes (Serper con `SERPER_API_KEY`,
o SerpApi con `SERPAPI_KEY`), la rehace con **Nano Banana 2.1 a 1K, 1:1** en Magnific (`MAGNIFIC_API_KEY`; si la API no
tiene la 2.1 usa la 2 y lo dice) con el prompt de Clau (fondo blanco para Google Shopping) y la guarda como
`nombre-del-producto-tamano.png` (mismo formato que el renombrado de `src/seo/filenames.js`).
- Si no es seguro que la foto encontrada sea el producto (no sale por EAN, o no nombra la marca o el producto), queda
  **dudosa**: no gasta créditos ni se sube, y sale en `/fotos-ia/dudosas.csv` para buscarla a mano.
- «Prueba con N» no sube nada. «Hacer todos los que quedan» puede subir solas las seguras.
- También es dudosa si una es estuche y la otra no (la foto es un set y el producto un frasco solo, o al revés).
- Los enlaces de Magnific caducan: nada más hacerla, la foto se guarda en Contenido → Archivos de Shopify (sin ponerla
  en el producto) y el panel enseña esa copia. «Subir» solo la engancha al producto; «Descartar» o «Repetir» borran la copia.
- El tamaño del formato solo se añade al nombre si el título no trae ya un tamaño ni es un estuche
  («1 Million 50 Eau de Toilette Sg» no pasa a llamarse «…-100ml»). Al arrancar se corrige el texto alternativo de las
  ya subidas, y el renombrado nocturno ajusta el nombre del archivo. Las que se cortan por un reinicio quedan como «Error».
- El logo se desvincula del producto (el archivo compartido no se borra). Metacampo `nina_seo.foto = ia-magnific`.
Opcionales: `MAGNIFIC_MODEL` (fija el modelo), `MAGNIFIC_RESOLUTION` (`1K`), `MAGNIFIC_PROMPT` (`{producto}` = nombre y
tamaño), `FOTOS_IA_A_LA_VEZ` (3). Por la API cada foto gasta créditos de Magnific.

## Escuchar artículo (`/audio-blog`)

Botón «Escuchar artículo» en Nina Blog con una voz de **ElevenLabs**: mientras suena, el artículo resalta la frase y la
palabra que se está leyendo. Desde el panel eliges la voz (y escuchas una muestra) y pulsas «Generar audio» en cada artículo:
Nina Sync lee el título, la entradilla y el texto (no las tarjetas de productos, el índice, los botones ni las fuentes),
lo manda a ElevenLabs por trozos con el endpoint `with-timestamps`, junta el MP3, lo sube a Contenido → Archivos y guarda
en el artículo el metacampo `nina.audio` (JSON: enlace, duración y el milisegundo en que empieza cada palabra).
El tema (sección `nina-blog-articulo`) solo enseña el botón si el artículo tiene ese metacampo.

- Gasta créditos solo al generar: ~1 crédito por carácter con `eleven_multilingual_v2` (la mitad con `eleven_flash_v2_5`).
  Un artículo de 10.000 caracteres son ~10.000 créditos. El panel muestra los créditos del mes y avisa si no llegan.
- Si cambias el texto del artículo, el panel lo marca como «El texto ha cambiado» para volver a generarlo.
- Para que no se lea una parte del artículo, ponle la clase `nba-no-leer`.
- Permisos de la app de Shopify: `read_content`, `write_content` y `write_files`.

| Variable | Por defecto | Para qué |
|---|---|---|
| `ELEVENLABS_API_KEY` | — | Clave de ElevenLabs (Developers → API Keys). Permisos: Text to Speech, Voices (leer) y User (leer) |
| `ELEVENLABS_VOICE_ID` | — | Voz por defecto si no se elige en el panel |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` | Modelo por defecto |
| `AUDIO_BLOG_HANDLE` | `nina-blog` | Blog cuyos artículos se leen |

## Pedidos BTS (botón «Enviar a BTS»)
- Cada 15 minutos Nina Sync busca los pedidos pagados y sin enviar de Shopify y los muestra en **Pedidos BTS**. No se envía nada a BTS hasta pulsar «Enviar a BTS» (Clau, 2026-11-27).
- Al pulsarlo: elige el envío más barato de `getShippingPrices` y crea el pedido con `setCreateOrder` (dropshipping=1, pago `BTS_ORDER_PAYMENT`, por defecto `wallet`). BTS no tiene modo de prueba: es un pedido real.
- Cuando BTS da el seguimiento (`getTrackings`), marca el pedido como enviado en Shopify con el número y el enlace, y Shopify manda el correo a la clienta.
- Si se corta la conexión al enviar, el pedido queda en «Comprueba en BTS» y no se reintenta solo, para no duplicarlo.
- Permisos de la app de Shopify: `read_orders`, `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders` y acceso a datos protegidos de clientes (nombre, dirección y teléfono).
- Variables opcionales: `BTS_ORDER_PAYMENT`, `BTS_ORDERS_CRON` (por defecto `*/15 * * * *`), `BTS_ORDERS_SINCE` (AAAA-MM-DD).
- Si el monedero no tiene saldo (`no_enough_money`), el pedido se crea igualmente con `payment_method=banktransfer` (queda «Pendiente de pago» en BTS y no sale hasta la transferencia). Se desactiva con `BTS_ORDER_FALLBACK_TRANSFER=false`.

## Correo de bienvenida

Cada 15 minutos Nina Sync busca clientas recién suscritas al correo (sin pedidos) y les envía el correo de bienvenida desde `avisos@ninabeauty.es`: cupón BIENVENIDA3 (3 € desde 30 €), Nina Blog, Foro Nina y NinaCash. La primera vez solo apunta a las suscriptoras que ya había, sin escribirles. Vista previa en `/bienvenida`.

- `BIENVENIDA_ACTIVO=false` lo apaga.
- `BIENVENIDA_CRON` cambia la frecuencia (por defecto `*/15 * * * *`).
