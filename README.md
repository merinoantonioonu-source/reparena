# RepArena

Juego de ejercicio físico en realidad virtual y mixta para **Meta Quest 3**, que se juega desde el navegador de las gafas (WebXR) con seguimiento de manos. Cada repetición bien hecha es un disparo.

- **Modos:** Asalto (robots que se reparten los puestos de ataque sin estorbarse y cargan corriendo; en flexiones, arañas), Enjambre (drones y avispas, apuntas con las manos o la mirada), Arcos (solo sentadillas: agáchate para pasar bajo los arcos de energía), Toques (no se dispara: vienen amebas de agua que ondulan para meter la cabeza por el hueco y diamantes con la mano que los toca dibujada; en sentadillas, saltos, abdominales, flexiones o un combinado a tu gusto) y Barras (barra de dominadas de puerta o paralelas: revientas con la cabeza las pompas o las avispas monstruo que vuelan hacia tu cara con el aguijón apuntándote, esperan donde llegará tu cabeza (en el remo, a 3/4 de la altura de la barra y pasado su borde) y amagan con picarte; bajo la barra de dominadas hay un charco con tentáculos y, si te sueltas, caes en él; en colgado puedes elegir en su lugar un remolino: un embudo magenta de estrías difuminadas, con un núcleo blanco que brilla en el fondo, que se hunde en el suelo bajo tus pies y gira queriendo engullirte y se va cerrando a medida que aguantas, hasta cerrarse justo al cumplir el tiempo de la oleada: si te sueltas antes, te engulle, pierdes una vida y esa oleada termina).
- **Ejercicios:** sentadillas, zancadas, flexiones y fondos en silla (se detectan por la altura del visor), curl de bíceps y press de hombro (por la posición de las muñecas; en el press, si una mano que ya subía bien se sale de la vista por encima de la cabeza, la repetición cuenta igual), plancha lateral (Asalto o Enjambre: cada pocos segundos aguantados con la cadera arriba, un disparo; si cae la cadera, el tiempo vuelve a empezar), plancha con un brazo (solo en Asalto: levantar un brazo dispara a las arañas de su lado, que llegan por los dos costados), superman (solo en Enjambre: tumbado boca abajo, subir el tronco con los brazos estirados y aguantar los segundos elegidos dispara a los bichos que vuelan bajo) y, en Barras, remo invertido en una o dos paralelas, dominadas y colgado (altura del visor; la repetición cuenta al subir).
- **Flexiones cargadas:** cada 0,8 s que aguantas abajo sube la carga hasta ×4; el disparo hace más daño y desde ×3 estalla alrededor.
- **Calibración:** mientras calibras, el entorno y los enemigos se colocan a tu alrededor, también tumbado o en plancha (la orientación sale de hacia dónde apunta tu cabeza).
- **Arcos:** la aparición puede ser regular o irregular (a veces dos casi seguidos, a veces un respiro largo, con la misma media). Un porcentaje configurable de arcos trae la barra inclinada: apártate hacia el lado alto con una zancada lateral (flexionas esa pierna y estiras la otra); se ajustan la inclinación máxima y cuánto hay que apartarse.
- **Toques:** cada objetivo llega a la altura que obliga a hacer el movimiento (abajo en la sentadilla o la flexión, por encima de la cabeza en el salto, en el arco que hace la cabeza al subir el tronco en los abdominales, o girado en los oblicuos) y espera un momento; si no lo tocas, te golpea. Entre un toque y el siguiente hay que volver a la postura de partida (la cabeza a su altura; la mano que tocó, atrás). Las amebas son aros de agua que ondulan y revientan salpicando; los diamantes dicen con qué mano se tocan (I azul, D naranja); en flexiones solo hay amebas y algunas llegan desplazadas hacia un hombro, para cargar el peso en ese brazo y el toque se comprueba con todos los dedos, nudillos y muñeca a lo largo de todo el movimiento. Tiempo de llegada, tiempo para tocar, separación, tamaño de las amebas, altura del salto y ángulos del tronco son configurables. **Combinado:** eliges postura (de pie, plancha o boca arriba) y movimientos (sentadilla, salto, puñetazo, estirarse / flexión, plancha aguantada, toque con una mano / abdominal, oblicuo, rodillas), en orden o al azar.
- **Ritmo:** en Toques, con un BPM los objetivos llegan en el pulso y laten con él. Se marca tocando «Al compás» cuatro veces siguiendo la música, o con «Ritmo de Spotify» (Spotify dejó de dar el análisis de audio a las apps nuevas a finales de 2024, así que lo normal es que no responda y haya que marcarlo).
- **Sonidos propios:** los archivos de la carpeta `sounds/` (rayo, rayo cargado, impacto, tentáculos, caída al foso, pompa) sustituyen a los sintetizados; `sounds/LEEME.md` explica nombres y cómo subirlos. Sin archivos, el rayo suena a chasquido eléctrico con crepitar y retumbo, y los tentáculos con chapoteo, gruñido y chillido; al caer al foso se excitan y se agitan más rápido.
- **Pistolas:** en sentadillas (Asalto o Enjambre) se puede jugar con los mandos: cada repetición carga munición en los blásters (con una empuñadura que envuelve el mando) y el gatillo dispara donde apuntas (sin mandos, pellizcando). X/Y del mando izquierdo abren el menú.
- **Espadas (con los mandos, opcional):** una o dos espadas, metálica (acero que refleja las luces y proyecta sombra) o láser (con su zumbido), en Asalto con sentadillas o zancadas y en Toques de pie. En Asalto cada sentadilla carga la hoja y los robots se acercan a tu alcance: solo un tajo rápido (velocidad mínima configurable) les hace daño, y sin carga la hoja rebota. Si los bloqueos están activados, el robot marca a qué altura va a golpear (alto, medio o bajo): se para poniendo la hoja en la marca, agachado si es medio o bajo; queda aturdido y el contraataque hace el doble. Con una espada y las pistolas, en la otra mano va el bláster. En Toques, los diamantes pasan a ser bloques con una flecha que se cortan en esa dirección, en la postura que piden (bajos agachado, adelantados con zancada, a un lado inclinándose, altos saltando) y se parten en dos.
- **Vibración de los mandos:** al disparar, recargar, apretar el gatillo sin munición, golpear con la espada (más fuerte cuanto más rápido), rozar o chocar las hojas, bloquear, cortar, tocar un diamante, recibir un golpe y pulsar los botones del menú; con la espada cargada late suavemente.
- **Disparos:** son rayos quebrados con ramas que parpadean, echan chispas e iluminan el entorno (con sombras activas, la luz principal salta hacia el rayo y las sombras se mueven). El color dice la intensidad: azul normal, turquesa perfecto, dorado ×2, naranja ×3 y magenta ×4. Se puede quitar la luz en Ajustes → Sistema.
- **Menú:** sale de la muñeca izquierda al girarla hacia la cara y se coloca a la distancia de los ojos que elijas (Ajustes → Sistema; 55 cm por defecto); se pulsa con el índice derecho, se queda quieto mientras acercas el dedo y se recoge al bajar el brazo. También se puede volver al atril fijo. Los botones se pulsan una sola vez por toque: para volver a pulsar hay que mover un poco el dedo, y con el dedo entre dos botones no se pulsa ninguno.
- **Sesiones:** en la página se arma una secuencia de bloques (modo, ejercicio y repeticiones; en colgado, segundos). En el menú, EMPEZAR SESIÓN los juega seguidos, cada uno en oleadas de unas 10 repeticiones, con descanso entre bloques y resumen final, sin tocar tus ajustes guardados.
- **Aparatos:** «Colocar barra» (o «Colocar paralelas») en el menú entra en el modo colocación: el menú se oculta, agarras el aparato con las dos manos por encima de la cabeza y, tras 5 s quieto, la media de esas posiciones fija su sitio, su orientación y su altura. Después el menú vuelve con los ajustes finos (altura, ancho, mover 1 cm, girar 1°). El botón de la muñeca o Esc cancelan; en el ordenador, H simula las manos arriba. Son muebles fijos: se guardan como anclas persistentes de WebXR y, además, respecto al suelo del guardián (bounded-floor), así que se quedan en su sitio de la habitación aunque cambie el origen de la sesión o recentres. En VR se ven como modelos completos (con el marco y el muro de la puerta; en colgado, también en realidad mixta, la barra es la rama de un árbol enorme en un bosque encantado de noche); en realidad mixta, como un contorno luminoso.
- **Paneles:** el marcador y los avisos nunca tapan lo que viene hacia ti: los avisos se apartan a otro hueco de la vista y el marcador se vuelve transparente mientras algo pasa por detrás.
- **Música:** Spotify como mando a distancia (anterior, pausa, siguiente, volumen y canción actual) desde el menú principal y el de pausa. Usa la Web API con inicio de sesión PKCE, sin servidor. Hace falta Spotify Premium y una app propia en developer.spotify.com con la URL de la página como Redirect URI; la página explica los pasos.
- Todos los ajustes son numéricos: deslizador, botones − / + o teclado.

## Jugar

Abre la página de GitHub Pages del repositorio en el navegador de las Quest 3 y pulsa **Entrar en realidad mixta** o **Entrar en VR**. Dentro del juego, la fila **Vista** del menú principal y del de pausa pasa de una a otra sin salir (la VR va en una sesión de realidad mixta con el entorno tapando la habitación). WebXR necesita https, que GitHub Pages ya da.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | El juego completo en un solo archivo. **Se genera**: no lo edites a mano. |
| `src/page.html` | HTML y CSS de la página; el JS se inserta en `/*__JS__*/`. |
| `src/00_core.js` | Ajustes (esquema, guardado, formulario web). |
| `src/10_audio.js` | Sonido sintetizado y espacial (Web Audio, HRTF, reverberación). |
| `src/20_render.js` | Renderizador, texturas PBR procedurales, materiales, utilidades de geometría (`Kit`, `Rig`). |
| `src/30_env.js` | Entorno VR, arena, compuertas, marcador. |
| `src/32_forest.js` | Bosque encantado de Barras · Colgado (en VR y en realidad mixta): árboles, rama, luciérnagas, niebla, cielo nocturno y sonidos. |
| `src/35_equip.js` | Aparatos del modo Barras (barra de puerta y paralelas), anclas persistentes, suelo del guardián y charco con tentáculos. |
| `src/36_vortex.js` | Remolino de Barras · Colgado (embudo que atraviesa el suelo del bosque gracias al stencil): se abre al colgarte, se cierra con el tiempo aguantado y te engulle si te sueltas. |
| `src/40_models.js` | Robots, arañas, drones, avispa, avispa monstruo, arcos y guantes robóticos. |
| `src/50_fx.js` | Partículas, explosiones, restos. |
| `src/52_bolt.js` | Rayos de los disparos: forma quebrada con ramas, parpadeo, chispas, luz y sombras. |
| `src/60_ui.js` | Menú en la muñeca izquierda (o en atril), botones táctiles, deslizadores, teclado, paneles. |
| `src/65_music.js` | Spotify como mando a distancia: inicio de sesión PKCE, Web API y filas de los menús. |
| `src/66_session.js` | Sesiones de entrenamiento: bloques encadenados, descanso, resumen y editor de la página. |
| `src/70_game.js` | Lógica de partida: enemigos, arcos, detectores de repeticiones, oleadas. |
| `src/76_sword.js` | Espadas metálica y láser: modelos, tajos contra los robots, bloqueos y contraataques, cortes de los Toques y vibración de los mandos. |
| `src/74_touch.js` | Modo Toques: amebas de agua y diamantes por mano, volver a la postura entre toques, movimientos por ejercicio y combinados, llegada al ritmo y marcar el compás. |
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
