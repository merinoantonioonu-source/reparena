# Fondos de la Travesía

Fotos panorámicas de verdad (montañas, cielo) que se ven al fondo de cada tramo de la Travesía, con el paisaje de cómic
delante. Si falta una, ese tramo usa el cielo dibujado de siempre.

| Archivo | Tramo |
| --- | --- |
| `bosque.jpg` | Bosque: «Lilienstein» (pradera con bosque y la montaña de cumbre plana) |
| `aldea.jpg` | Aldea: «Alps Field» (prado con montañas) |
| `lago.jpg` | Pradera del lago: «Kloofendal 48d Partly Cloudy» (colinas con nubes grandes) |
| `atardecer.jpg` | Pinar al atardecer: «Rolling Hills» (colinas con el sol bajo) |

Las cuatro son de [Poly Haven](https://polyhaven.com/hdris) (CC0, dominio público), en su versión «Tonemapped JPG»,
reducidas de 8192 × 4096 a 4096 × 2048. En el juego, cada una mira hacia lo mejor de la foto (`panoU` en `TREK_BIOMES`,
`src/75_trek.js`: la columna de la foto que queda de frente) y, al cambiar de tramo, la anterior se borra de la memoria.

Cómo deben ser:

- **Equirrectangulares** (el doble de anchas que de altas: 4096 × 2048 px va bien en las gafas), en `.jpg`, de unos
  1–2 MB. El horizonte, en la línea del medio.
- De dominio público o con licencia que permita usarlas en el juego: por ejemplo, las de [Poly Haven](https://polyhaven.com/hdris)
  (CC0), descargando la versión **«Tonemapped JPG»** de 4K. Mejor las de paisaje abierto (montañas, valles, lagos) y sin
  edificios cerca; para el pinar, un atardecer.
- La niebla del paisaje toma sola el color del horizonte de la foto.
