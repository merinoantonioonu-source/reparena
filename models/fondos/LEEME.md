# Fondos de la Travesía

Fotos panorámicas de verdad (montañas, cielo) que se ven al fondo de cada tramo de la Travesía, con el paisaje de cómic
delante. Si falta una, ese tramo usa el cielo dibujado de siempre.

Se eligen en el juego (Opciones → Entorno → «Fondo realista», en todos los modos menos la Travesía, que usa uno por tramo).

**Paisajes abiertos** (la foto al fondo, con el bosque de cómic delante; en Arcos, avanzas por el paisaje de la Travesía):

| Archivo | Foto de Poly Haven | En el juego |
| --- | --- | --- |
| `aldea.jpg` | Alps Field | Prado con los Alpes (tramo Aldea) |
| `bosque.jpg` | Lilienstein | Pradera y montaña (tramo Bosque) |
| `montana.jpg` | Drakensberg Solitary Mountain | Montaña y valle |
| `cumbre.jpg` | Table Mountain 1 | Cumbre sobre el mar |
| `lago.jpg` | Kloofendal 48d Partly Cloudy | Colinas con nubes (tramo Pradera del lago) |
| `atardecer.jpg` | Rolling Hills | Colinas al atardecer (tramo Pinar al atardecer) |
| `ocaso.jpg` | Qwantani Sunset | Ocaso junto al lago |

**Con su suelo** (la foto entera: lo que miras por debajo del horizonte se proyecta sobre el suelo del juego, como si
pisaras la plaza o la arena de la foto; sin césped ni plantas de cómic):

| Archivo | Foto de Poly Haven | En el juego |
| --- | --- | --- |
| `pinar.jpg` | Misty Pines | Pinar con niebla |
| `soleado.jpg` | Forest Slope | Bosque soleado |
| `otono.jpg` | Autumn Forest 01 | Bosque en otoño |
| `musgo.jpg` | Mossy Forest | Bosque con musgo y arroyo |
| `nevado.jpg` | Snowy Forest Path 01 | Bosque nevado |
| `girasoles.jpg` | Sunflowers | Campo de girasoles |
| `berlin.jpg` | Potsdamer Platz | Berlín |
| `shanghai.jpg` | Shanghai Bund | Shanghái de noche |
| `venecia.jpg` | Venice Sunset | Venecia al atardecer |
| `mondello.jpg` | Spiaggia di Mondello | Playa de Mondello |
| `amanecer.jpg` | Umhlanga Sunrise | Amanecer en la playa |

Todas son de [Poly Haven](https://polyhaven.com/hdris) (CC0, dominio público), en su versión «Tonemapped JPG»,
reducidas a 4096 × 2048. En el juego (`PANOS`, `src/75_trek.js`), cada una mira hacia lo mejor de la foto (`u`: la
columna que queda de frente), la luz se ajusta a lo clara que es (de noche, más oscura) y, al cambiar, la anterior se
borra de la memoria. Para añadir otra: el archivo aquí, su entrada en `PANOS` y su opción en el ajuste `pano`
(`src/00_core.js`).

Cómo deben ser:

- **Equirrectangulares** (el doble de anchas que de altas: 4096 × 2048 px va bien en las gafas), en `.jpg`, de unos
  1–2 MB. El horizonte, en la línea del medio.
- De dominio público o con licencia que permita usarlas en el juego: por ejemplo, las de [Poly Haven](https://polyhaven.com/hdris)
  (CC0), descargando la versión **«Tonemapped JPG»** de 4K. Las de paisaje abierto, sin nada cerca; las de suelo, hechas a la
  altura de una persona (sobre 1,7 m).
- La niebla del paisaje toma sola el color del horizonte de la foto.
