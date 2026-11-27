# «Escuchar artículo» en el tema (Nina Blog)

Copia de los archivos subidos al tema borrador «Nina Beauty (borrador)» (191597347129) el 2026-11-26:

- `snippets/nina-blog-audio.liquid`: botón y reproductor; solo sale si el artículo tiene el metacampo `nina.audio`.
- `assets/nina-blog-audio.js`: reproduce el MP3 y resalta la frase (`::highlight(nina-frase)`) y la palabra (`::highlight(nina-palabra)`)
  con la API de resaltado de CSS; en navegadores antiguos marca el párrafo. Tocar una frase salta a ella. Mini reproductor
  abajo al bajar por el artículo, velocidad 0,75×–1,5× y −15 s.
- `assets/nina-blog-audio.css`: estilos con los colores de la marca.
- `sections/nina-blog-articulo.liquid`: la sección del artículo, con `{% render 'nina-blog-audio', article: article %}` tras la firma.

Las reglas de qué se lee (y qué no: tarjetas de producto, índice, botones, fuentes, `.nba-no-leer`) deben coincidir con
`src/audioBlog/text.js`. El JS busca cada frase del metacampo en el texto de la página, así que si cambia el texto
del artículo, las frases cambiadas dejan de resaltarse hasta volver a generar el audio.
