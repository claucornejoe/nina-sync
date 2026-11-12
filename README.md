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
