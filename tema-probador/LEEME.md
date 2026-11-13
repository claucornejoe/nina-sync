# Probador virtual de maquillaje (tema Shopify)

Archivos del probador virtual de labios para el tema de Nina Beauty. No forman parte de la app Nina Sync: se guardan aquí para tener historial.

- `assets/nina-probador.js`: detecta la cara con MediaPipe Face Landmarker en el navegador y pinta los labios.
- `assets/nina-probador.css`: estilos con la marca Nina.
- `assets/nina-probador-labios.json`: tonos (color aproximado puesto a mano, acabado, precio, stock, handle).
- `sections/nina-probador.liquid` y `templates/page.probador.json`: sección y plantilla de página.
- `scripts/`: `tonos_labios_manual.csv` (EAN;hex;acabado) y `build_tonos.py`, que genera el JSON desde el catálogo BTS.
