# RepArena

Juego de ejercicio físico en realidad virtual y mixta para **Meta Quest 3**, que se juega desde el navegador de las gafas (WebXR) con seguimiento de manos. Cada repetición bien hecha es un disparo.

- **Modos:** Asalto (robots y, en flexiones, arañas), Enjambre (drones y avispas, apuntas con las manos o la mirada), Arcos (solo sentadillas: agáchate para pasar bajo los arcos de energía) y Barras (barra de dominadas de puerta o paralelas: revientas con la cabeza las pompas o los bichos que esperan donde llegará tu cabeza; debajo hay un charco con tentáculos y, si te sueltas, caes en él).
- **Ejercicios:** sentadillas y flexiones (se detectan por la altura del visor), curl de bíceps (por la posición de las muñecas) y, en Barras, remo invertido en paralelas, dominadas y colgado (altura del visor; la repetición cuenta al subir).
- **Aparatos:** «Colocar barra» (o «Colocar paralelas») en el atril entra en el modo colocación: el atril se oculta, agarras el aparato con las dos manos por encima de la cabeza y, tras 5 s quieto, la media de esas posiciones fija su sitio, su orientación y su altura. Después el atril vuelve con los ajustes finos (altura, ancho, mover 1 cm, girar 1°). El botón de la muñeca o Esc cancelan; en el ordenador, H simula las manos arriba. Se guardan como anclas persistentes de WebXR para que las Quest las recuerden. En VR se ven como modelos completos (con el marco y el muro de la puerta); en realidad mixta, como un contorno luminoso.
- **Música:** Spotify como mando a distancia (anterior, pausa, siguiente, volumen y canción actual) desde el atril y el menú de pausa. Usa la Web API con inicio de sesión PKCE, sin servidor. Hace falta Spotify Premium y una app propia en developer.spotify.com con la URL de la página como Redirect URI; la página explica los pasos.
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
| `src/60_ui.js` | Menú fijo en atril, botones táctiles, deslizadores, teclado, paneles. |
| `src/65_music.js` | Spotify como mando a distancia: inicio de sesión PKCE, Web API y filas de los menús. |
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
