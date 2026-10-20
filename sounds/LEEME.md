# Sonidos propios

Pon aquí archivos de audio con estos nombres y el juego los usará en lugar de los sonidos sintetizados.
Vale `.mp3`, `.ogg` o `.wav` (por ejemplo `rayo.mp3`). Si un archivo no está, suena el sintetizado.

## Disparos y golpes

| Archivo | Cuándo suena |
| --- | --- |
| `rayo` | Cada disparo (el rayo sale de la mano o la pistola). |
| `rayo-cargado` | Disparos cargados (×2, ×3, ×4). Si no está, se usa `rayo` más grave. |
| `impacto` | Cuando el rayo alcanza al enemigo. |
| `chispazo` | Descarga eléctrica: segundo latigazo de un rayo fuerte, o te da un arco/valla en Arcos. |
| `explosion` | Explota un robot o un dron. |
| `impacto-metal` | Le das a un robot sin derribarlo, o un robot te golpea. |
| `golpe-recibido` | Te golpean (lo oyes tú, sin posición). |

## Enemigos

| Archivo | Cuándo suena |
| --- | --- |
| `rugido-robot` | Un robot ruge (al salir, al cargar o al prepararse para golpear). |
| `paso-robot` | Cada paso de un robot. |
| `servo` | Un robot levanta el brazo para golpear. |
| `compuerta` | Se abre una compuerta. |
| `siseo-arana` | Una araña sisea. |
| `patas-arana` | Una araña corretea o salta. |
| `aplastar` | Revientas una araña o un avispón (chapoteo viscoso). |
| `ataque-volador` | Un volador (dron o avispón) se lanza a por ti. |
| `ameba` | Revientas una ameba de agua (Toques). |
| `pompa` | Revientas una pompa (Barras). |
| `tentaculos` | Un tentáculo del charco se lanza hacia ti. |
| `caida-foso` | Caes al charco (se suma al chapoteo). |
| `chapoteo` | La zambullida al caer al charco. |
| `remolino-engulle` | El remolino te engulle. |
| `remolino-cierra` | El remolino se cierra al acabar el tiempo. |

## Espadas

Para cada uno puedes poner además una versión `-laser` (por ejemplo `espada-golpe-laser.mp3`): suena con la
espada láser y la normal con la metálica. Si solo pones la normal, suena con las dos.

| Archivo | Cuándo suena |
| --- | --- |
| `espada-aire` | La hoja corta el aire en un tajo rápido. |
| `espada-choque` | La hoja rebota (sin carga, o choca con algo). |
| `espada-golpe` | Un tajo cargado le da a un robot. |
| `espada-bloqueo` | Paras un golpe con la espada. |
| `espada-corte` | Partes un bloque en Toques. |

## Avisos del juego (sin posición, suenan «en tu cabeza»)

| Archivo | Cuándo suena |
| --- | --- |
| `carga` | Una repetición carga el disparo (o al terminar la calibración). |
| `carga-nivel` | Sube el nivel de carga aguantando abajo (×2, ×3, ×4). |
| `perfecta` | Repetición PERFECTA. |
| `a-medias` | Repetición a medias. |
| `fallo` | Un disparo no da a nadie. |
| `combo` | Cada 10 de combo. |
| `pitido` | Cuentas atrás (plancha lateral, superman) y avisos de valla en Arcos. |
| `oleada` | Empieza una oleada (bocina). |
| `victoria` | Ganas la ronda. |
| `derrota` | Pierdes la ronda. |
| `clic` | Pulsas un botón del menú. |
| `tic` | Mueves un deslizador o abres el menú de la muñeca. |

## Ambiente

| Archivo | Cuándo suena |
| --- | --- |
| `trueno` | Los truenos lejanos de la arena. |
| `metal-lejano` | Golpes metálicos lejanos de la arena. |
| `buho` | Un búho en el bosque. |
| `pajaro` | Un pájaro que canta en el bosque de día (Entorno: Bosque), cada pocos segundos y desde un sitio distinto. |
| `crujido` | Crujidos de ramas en el bosque. |

## Sonidos continuos (se repiten en bucle)

Que el final empalme con el principio sin corte. Pueden durar varios segundos.

| Archivo | Cuándo suena |
| --- | --- |
| `ambiente-arena` | Fondo de la arena (realidad virtual). Sustituye a todo el ambiente sintetizado. |
| `ambiente-bosque` | Fondo del bosque (viento, grillos…). |
| `ambiente-naturaleza` | Fondo del bosque de día (Entorno ▸ → Entorno: Bosque): brisa entre las hojas. |
| `zumbido-dron` | Vuelo de drones, bombarderos y nodrizas (cada uno con su tono). |
| `zumbido-avispa` | Vuelo de avispones, avispas y la reina (cada uno con su tono). |
| `espada-laser-zumbido` | Zumbido de la espada láser (sube de tono y volumen al moverla). |
| `remolino` | Succión del remolino (sube con lo abierto que está). |
| `arco-zumbido` | Zumbido de los arcos de energía en Arcos. |

Consejos: los efectos, cortos (menos de 2 s, salvo `caida-foso`, `victoria` y `derrota`), sin silencio al
principio y en mono. Cada vez que suenan se varía un poco el tono para que no se repitan iguales. Ajusta tú el
volumen del archivo: el juego lo pone tal cual (con su posición en el espacio, si la tiene).

## Cómo subirlos desde el navegador

1. En GitHub, abre el repositorio y entra en la carpeta `sounds`.
2. Pulsa **Add file → Upload files** y arrastra los archivos (con los nombres de arriba).
3. Abajo, pulsa **Commit changes**. En un par de minutos GitHub Pages los sirve y el juego los carga al empezar.
