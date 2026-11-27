// Temas de ejemplo para arrancar el Foro Nina (decisión de Clau, 2026-11-25).
// Se publican marcados como ejemplo: la autora sale como «Nombre · ejemplo» y el tema lleva la etiqueta
// «Tema de ejemplo», para no hacerlos pasar por clientas reales. Desde el panel /foro se crean y se borran con un botón.
// `hace` = horas atrás, para que no salgan todos «ahora mismo».

export const EJEMPLOS = [
  {
    categoria: 'skincare',
    autor: 'Lucía',
    hace: 30,
    titulo: 'Granitos en la barbilla cada mes, ¿qué os funciona?',
    cuerpo:
      'Chicas, todos los meses me salen granitos en la barbilla justo antes de la regla y me tienen frita 😩\n\nAhora uso un gel limpiador y una crema hidratante normal. ¿Añado algo más o mejor no toco nada?',
    respuestas: [
      { autor: 'Irene', despues: 3, cuerpo: 'Me pasaba igual. Lo que más me ayudó fue dejar de tocármelos (cuesta, lo sé jaja) y cambiar la funda de la almohada más a menudo.' },
      {
        equipo: true,
        despues: 6,
        cuerpo:
          'Hola, Lucía. Es súper típico que salgan en esa zona por los cambios hormonales. Puedes probar un producto con ácido salicílico dos o tres noches por semana y mantener tu hidratante. Por la mañana, protector solar. Si son granos grandes que duelen o dejan marca, consulta a tu dermatólogo.',
      },
    ],
  },
  {
    categoria: 'skincare',
    autor: 'Carla',
    hace: 52,
    titulo: '¿Protector solar en invierno o es postureo?',
    cuerpo: 'Mi hermana dice que hay que ponérselo todo el año, pero si está nublado y hace un frío que pela... ¿de verdad hace falta?',
    respuestas: [
      { autor: 'Nerea', despues: 2, cuerpo: 'Yo me lo pongo siempre, aunque esté nublado. Desde que lo hago tengo menos manchitas en la cara, te lo juro.' },
      {
        equipo: true,
        despues: 5,
        cuerpo:
          'Tu hermana tiene razón 😉 Las nubes no frenan toda la radiación UV. En invierno puedes usar uno ligero tipo fluido, que se lleva genial debajo del maquillaje.',
      },
    ],
  },
  {
    categoria: 'perfumes',
    autor: 'Ainhoa',
    hace: 20,
    titulo: 'Perfume para clase que no sea demasiado fuerte',
    cuerpo: 'Busco algo para el día a día, que huela bien pero que no maree a mi compi de al lado jajaja. ¿Qué tipo de aroma me pillo?',
    respuestas: [
      { autor: 'Marta', despues: 1, cuerpo: 'Los cítricos o los que huelen a limpio son perfectos para clase. Y con una o dos pulverizaciones vas sobrada.' },
      {
        equipo: true,
        despues: 4,
        cuerpo:
          'Para el día a día van muy bien las familias cítricas, frescas o florales suaves. Si quieres probar antes de decidirte, los formatos pequeños son ideales.',
      },
    ],
  },
  {
    categoria: 'perfumes',
    autor: 'Sofía',
    hace: 75,
    titulo: '¿Los perfumes árabes huelen tan fuerte como dicen?',
    cuerpo: 'Veo un montón de vídeos hablando de perfumes árabes y me pica la curiosidad. ¿Son muy intensos? ¿Para alguien que empieza con uno vale?',
    respuestas: [
      { autor: 'Andrea', despues: 2, cuerpo: 'Algunos sí que pegan fuerte, pero duran un montón. Yo con uno solo en la muñeca tengo para todo el día.' },
      { autor: 'Paula', despues: 9, cuerpo: 'Los que llevan vainilla o notas dulces son más fáciles para empezar. Los de oud son más intensos.' },
      {
        equipo: true,
        despues: 12,
        cuerpo:
          'Suelen ser más concentrados y duraderos, así que menos es más. Si es tu primero, busca notas dulces o afrutadas y pulveriza a distancia.',
      },
    ],
  },
  {
    categoria: 'perfumes',
    autor: 'Alba',
    hace: 8,
    titulo: 'Regalo para mi madre por Navidad, ¿qué perfume pillo?',
    cuerpo: 'No tengo ni idea de perfumes 🙈 A mi madre le gustan las flores y no le van los olores dulces. ¿Por dónde tiro?',
    respuestas: [
      { autor: 'Claudia', despues: 2, cuerpo: 'Si le gustan las flores pero no lo dulce, uno floral fresco tipo rosa o jazmín le puede encantar. Y si dudas, un estuche con loción queda muy bonito.' },
    ],
  },
  {
    categoria: 'maquillaje',
    autor: 'Noa',
    hace: 40,
    titulo: 'La base se me cuartea a media mañana',
    cuerpo: 'Me pongo la base por la mañana y a las 11 ya se me marcan las líneas alrededor de la nariz. Tengo la piel un poco seca. ¿Qué hago mal?',
    respuestas: [
      { autor: 'Julia', despues: 3, cuerpo: 'Me pasaba lo mismo. Ahora me hidrato bien, espero cinco minutos y la extiendo con una esponja húmeda. Cambio total.' },
      {
        equipo: true,
        despues: 7,
        cuerpo:
          'Con piel seca ayuda mucho una buena hidratante antes, poca cantidad de base y sellar con polvos solo en la zona T. Una bruma fijadora al final también la deja más jugosa.',
      },
    ],
  },
  {
    categoria: 'cabello-cuerpo',
    autor: 'Valeria',
    hace: 60,
    titulo: 'Pelo encrespado con la humedad, ¿algún truco?',
    cuerpo: 'Vivo cerca de la playa y en cuanto salgo de casa el pelo se me pone a lo león. ¿Qué usáis vosotras?',
    respuestas: [
      { autor: 'Elena', despues: 4, cuerpo: 'Yo me seco con una camiseta de algodón en vez de toalla y me pongo unas gotas de aceite en las puntas. Se nota mucho.' },
      {
        equipo: true,
        despues: 8,
        cuerpo:
          'Un acondicionador sin aclarado y un sérum antiencrespamiento antes de salir te van a ayudar mucho. Evita cepillarlo en seco: mejor peinarlo húmedo con los dedos o un peine de púas anchas.',
      },
    ],
  },
];
