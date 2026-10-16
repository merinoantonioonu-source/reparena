# RepArena

Juego de ejercicio físico en realidad virtual y mixta para **Meta Quest 3**, que se juega desde el navegador de las gafas (WebXR) con seguimiento de manos. Cada repetición bien hecha es un disparo.

- **Modos:** Asalto (robots y, en flexiones, arañas), Enjambre (drones y avispas, apuntas con las manos o la mirada), Arcos (solo sentadillas: agáchate para pasar bajo los arcos de energía) y Barras (barra de dominadas de puerta o paralelas: revientas con la cabeza las pompas o los bichos que esperan donde llegará tu cabeza; bajo la barra de dominadas hay un charco con tentáculos y, si te sueltas, caes en él).
- **Ejercicios:** sentadillas y flexiones (se detectan por la altura del visor), curl de bíceps (por la posición de las muñecas), plancha con un brazo (solo en Asalto: levantar un brazo dispara a las arañas de su lado, que llegan por los dos costados), superman (solo en Enjambre: tumbado boca abajo, subir el tronco con los brazos estirados y aguantar los segundos elegidos dispara a los bichos que vuelan bajo) y, en Barras, remo invertido en una o dos paralelas, dominadas y colgado (altura del visor; la repetición cuenta al subir).
- **Flexiones cargadas:** cada 0,8 s que aguantas abajo sube la carga hasta ×4; el disparo hace más daño y desde ×3 estalla alrededor.
- **Calibración:** mientras calibras, el entorno y los enemigos se colocan a tu alrededor, también tumbado o en plancha (la orientación sale de hacia dónde apunta tu cabeza).
- **Pistolas:** en sentadillas (Asalto o Enjambre) se puede jugar con los mandos: cada repetición carga munición en los blásters y el gatillo dispara donde apuntas (sin mandos, pellizcando). X/Y del mando izquierdo abren el menú.
- **Disparos:** son rayos quebrados con ramas que parpadean, echan chispas e iluminan el entorno (con sombras activas, la luz principal salta hacia el rayo y las sombras se mueven). El color dice la intensidad: azul normal, turquesa perfecto, dorado ×2, naranja ×3 y magenta ×4. Se puede quitar la luz en Ajustes → Sistema.
- **Menú:** sale de la muñeca izquierda al girarla hacia la cara y se pulsa con el índice derecho (se queda quieto mientras acercas el dedo y se recoge al bajar el brazo). En Ajustes → Sistema se puede volver al atril fijo.
- **Sesiones:** en la página se arma una secuencia de bloques (modo, ejercicio y repeticiones; en colgado, segundos). En el menú, EMPEZAR SESIÓN los juega seguidos, cada uno en oleadas de unas 10 repeticiones, con descanso entre bloques y resumen final, sin tocar tus ajustes guardados.
- **Aparatos:** «Colocar barra» (o «Colocar paralelas») en el menú entra en el modo colocación: el menú se oculta, agarras el aparato con las dos manos por encima de la cabeza y, tras 5 s quieto, la media de esas posiciones fija su sitio, su orientación y su altura. Después el menú vuelve con los ajustes finos (altura, ancho, mover 1 cm, girar 1°). El botón de la muñeca o Esc cancelan; en el ordenador, H simula las manos arriba. Se guardan como anclas persistentes de WebXR para que las Quest las recuerden. En VR se ven como modelos completos (con el marco y el muro de la puerta); en realidad mixta, como un contorno luminoso.
- **Música:** Spotify como mando a distancia (anterior, pausa, siguiente, volumen y canción actual) desde el menú principal y el de pausa. Usa la Web API con inicio de sesión PKCE, sin servidor. Hace falta Spotify Premium y una app propia en developer.spotify.com con la URL de la página como Redirect URI; la página explica los pasos.
- Todos los ajustes son numéricos: deslizador, botones − / + o teclado.

## Jugar

Abre la página de GitHub Pages del repositorio en el navegador de las Quest 3 y pulsa **Entrar en realidad mixta** o **Entrar en VR**. WebXR necesita https, que GitHub Pages ya da.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | El juego completo en un solo archivo. **Se genera**: no lo edites a mano. |
| `src/page.html` | HTML y CSS de la página; el JS se inserta en `/*__JS__*/`. |
| `src/00_core.js` | Ajustes (esquema, guardado, formulario web). |
| `src/10_audio.js` | Sonido sintetizado y espacial (Web Audio, HRTF, reverberación). |
| `src/20_render.js` | Renderizador, texturas PBR procedurales, materiales, utilidades de geometría (`Kit`, `Rig`). |
| `src/30_env.js` | Entorno VR, arena, compuertas, marcador. |
| `src/35_equip.js` | Aparatos del modo Barras (barra de puerta y paralelas), anclas persistentes y charco con tentáculos. |
| `src/40_models.js` | Robots, arañas, drones, avispa, arcos y guantes robóticos. |
| `src/50_fx.js` | Partículas, explosiones, restos. |
| `src/52_bolt.js` | Rayos de los disparos: forma quebrada con ramas, parpadeo, chispas, luz y sombras. |
| `src/60_ui.js` | Menú en la muñeca izquierda (o en atril), botones táctiles, deslizadores, teclado, paneles. |
| `src/65_music.js` | Spotify como mando a distancia: inicio de sesión PKCE, Web API y filas de los menús. |
| `src/66_session.js` | Sesiones de entrenamiento: bloques encadenados, descanso, resumen y editor de la página. |
| `src/70_game.js` | Lógica de partida: enemigos, arcos, detectores de repeticiones, oleadas. |
| `src/72_bars.js` | Modo Barras: colgarse, detector de subida, caídas, objetivos que se revientan con la cabeza y colocación de los aparatos. |
| `src/80_main.js` | Entrada XR (manos y mandos), bucle principal, prueba en el ordenador. |
| `tests/` | Pruebas sin navegador con un THREE simulado (solo con lo que existe en r128), WebXR con anclas y una API de Spotify falsa. |

Los módulos `src/NN_*.js` se concatenan en orden dentro de una sola función, así que comparten ámbito.

## Desarrollo

```bash
python3 src/build.py      # regenera index.html
node tests/test.js        # juega partidas simuladas en todos los modos; debe acabar en "ERRORS: none"
node tests/render.js      # (opcional) imágenes de los modelos en tests/out/
```

Haz commit de `index.html` junto con los cambios en `src/`: es lo que publica GitHub Pages.

Three.js r128 se carga desde cdnjs. El juego no tiene otras dependencias.
