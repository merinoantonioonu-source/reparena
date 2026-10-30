# RepArena: instrucciones para Claude

Juego de ejercicio físico para **Meta Quest 3** en el navegador de las gafas (WebXR, Three.js r128), con seguimiento de
manos y mandos, en VR y en realidad mixta. Cada repetición bien hecha es un disparo. El objetivo es **hacer ejercicio**:
cada mecánica nueva tiene que pedir movimiento real del cuerpo, no solo de los dedos.

Qué hay en cada archivo: tabla «Estructura» del `README.md`. Lo que ve el jugador está descrito en el `README.md` y en la
página (`src/page.html`, sección «Dentro del juego»).

## Idioma

- Con el usuario, en **español**. Los textos del juego, los de la página, los comentarios del código, los mensajes de
  commit y los PR, también en español.
- El usuario no programa: explícale los cambios por lo que se ve y se siente en las gafas, no por el código.

## Construir, probar y publicar

```bash
python3 src/build.py                    # une src/page.html y src/NN_*.js en index.html (y build/game.js)
node tests/test.js                      # partidas simuladas en todos los modos: debe acabar en "ERRORS: none"
XR=1 ONLY=zzz node tests/test.js        # solo las pruebas de WebXR (manos, mandos, menú de muñeca, barras…)
ONLY='expresión' node tests/test.js     # solo las partidas cuyo nombre encaja; DBG=1 saca más registro
```

- `index.html` **se genera**: nunca lo edites a mano, pero **haz commit de él** junto con `src/`, porque es lo que
  publica GitHub Pages. `build/` no se sube.
- Ejecuta las pruebas en primer plano: en segundo plano la salida se corta.
- Con `XR=1 ONLY=…` no cuentan las comprobaciones de las partidas que `ONLY` se salta (lo dice al empezar la parte XR).
  Si sale algún fallo, compáralo con `main` (`git stash`, construir, probar y `git stash pop`) antes de darlo por tuyo, y
  dile al usuario cuáles son de antes. Algunas pruebas dependen del azar (dónde están los enemigos): repítelas.
- Para ver un cambio visual, haz capturas con el Chromium de Playwright: el juego tiene un modo «Probar en el ordenador».
  Haz capturas de la página a 1280 y a 390 de ancho.
- Flujo de trabajo: tras cada PR fusionado, la rama de trabajo se rehace desde `origin/main`. Commit, push y PR con la
  una descripción de qué cambia, cómo se ha probado y qué fallos conocidos quedan. El usuario fusiona los PR.

## Cómo está hecho el código

- Los módulos `src/NN_*.js` se concatenan en orden dentro de **una sola función**: comparten ámbito. Las funciones se
  pueden usar antes de su definición. Las `const` de nivel superior, no, si se usan al cargar.
- Sin dependencias ni empaquetador: Three.js r128 y sus `examples/js` (GLTFLoader, SkeletonUtils) desde CDN. Usa solo
  API que exista en r128.
- Estilo: líneas largas y densas, como el código de alrededor. Comentarios cortos en español que explican el porqué.
- Cuidado con poner `//` en mitad de una línea de una sola línea: comenta todo lo que sigue.
- Ajustes: todos en `SCHEMA` (`src/00_core.js`), con grupo (`g`), condición (`cond`), explicación (`hint`) y `relayout`
  si cambia qué otros campos se ven. El formulario de la página y los menús del juego salen de ahí.
- Los modelos 3D están en `models/` (Quaternius, cada pack con su licencia). Los sonidos se pueden sustituir con
  archivos en `sounds/` (lista en `sounds/LEEME.md`, que el build copia a la página).
- Los simulacros de las pruebas son limitados:
  - `tests/three-mock.js` solo tiene parte de la API de r128 (por ejemplo, no tiene `getWorldQuaternion`);
  - en `tests/env-mock.js`, los elementos del DOM no tienen `closest` ni `querySelector`, así que comprueba que existen;
  - el contexto 2D falla si se usa un método que no tiene.
- Una prueba que cambie ajustes los devuelve al acabar (guarda `{ ...RA.settings }` y los restaura): las que van detrás
  cuentan con ellos.
- Las pruebas avanzan fotogramas más deprisa que el reloj real. Lo que dependa de `performance.now()` (por ejemplo, la
  pausa entre pulsaciones de botones) necesita un `await sleep(…)` en la prueba.

## Reglas de diseño que ha fijado el usuario

No las cambies sin preguntarle.

**Repeticiones y disparo**
- Cada repetición (sentadilla, zancada…) carga **un disparo por mano**, como mucho uno por mano y sin acumular.
- Con las manos desnudas no se dispara pellizcando. Se lanza con una **sacudida de la mano hacia el enemigo**: puede
  salir de la cadera y hacerse subiendo o bajando en la sentadilla. Sin sacudida, la carga se queda en la mano. El rayo
  va al enemigo más cercano a la dirección de la sacudida, sin exigir puntería exacta.
- En Toques, entre un toque y el siguiente hay que **volver a la postura de partida**. Un toque vale aunque el objetivo
  aún venga de camino.
- Con espadas no hay diana ni láser, y los enemigos van directos a por el jugador.
- Inchworm: se sigue la **cabeza**, no las manos. Llegar con la cabeza a la línea luminosa del suelo (donde queda en la
  plancha, según la altura) carga el rayo; volver andando con las manos hasta la salida y ponerse de pie dispara y saca la
  onda, que se ve y se oye bien y lanza a los bichos por el aire. Una barra en el suelo enseña lo que avanza la cabeza.
- Arcos de semipuente (`arcLow`): inclinados tan bajos que hay que apartarse al lado alto y bajar hasta apoyar una mano en
  el suelo; llegan más despacio, con aviso grande y la huella de la mano en el suelo.
- El marcador tumbado en el suelo (flexiones, planchas, inchworm) es sólido: los bichos lo rodean.
- Mandos como manos: con mandos se ven manos en todo el juego (en la partida, con pistolas o espada, el arma). En
  sentadillas y zancadas: gatillo + agarre = puño; el rayo se lanza
  apuntando con la mano y con el gatillo. Con mando, la puntería por defecto es «con las manos».

**Dificultad**
- Sube **poco a poco de una oleada a otra**, no dentro de cada oleada: que se note un poco, pero que sea real.
- Las mejoras, sorpresas y demás premios (`src/79_perks.js`) nunca dan más cargas ni más daño: cambian el ritmo, la
  defensa o los puntos, pero las oleadas piden las mismas repeticiones.
- Con cartas de mejora por elegir, la oleada siguiente **espera a que el jugador elija**.
- Entre oleadas: fundido leve (sin que desaparezca la escena) y panel grande con la oleada que empieza y los puntos;
  mientras se ve, no sale nada (ni enemigos ni orbes).
- Arcos: el arco de plancha llega más despacio (velocidad propia), con un aviso grande delante y sin que lo adelante nada.

**Enemigos y física**
- Los enemigos **nunca atraviesan** compuertas, piedras, cajas ni otros sólidos.
- Se mueven con naturalidad y agresividad, sin chocar entre ellos.
- Al abrirse una compuerta, su interior es oscuro.
- Los personajes geométricos hechos a mano gustaron poco: para enemigos nuevos, mejor modelos de Quaternius.
- Los voladores baten las alas siempre rápido, a su ritmo, sin depender de lo deprisa que avancen.
- Cada enemigo tiene resistencia, fuerza y dureza en la tabla del desarrollador; los nuevos entran solos en ella.

**Paneles y avisos en las gafas**
- Ningún panel puede tapar lo que viene hacia el jugador.
- El marcador se ve siempre, también al mirarlo de frente, y sin texto de más.
  - Por defecto (VR), a un lado (izquierda o derecha, configurable), el doble de grande y siempre a la vista, por fuera de
    las compuertas.
  - Diseño elegido (C): rosco doble (fuera, la oleada con la muesca del récord; dentro, la racha en 10 tramos), oleadas en
    puntos, un solo hueco para mensajes a 48 px o más. En el relámpago, el borde es una mecha. Nada de cargas ni escudo en
    el marcador: se ven en el juego (bola en la mano, celdas del bláster, brazalete del escudo en el antebrazo).
- Las celebraciones (`cheer`) van solo al marcador; delante de la cara, solo lo que pide hacer algo ya o colocarse.
- Los avisos de la vista (los del centro, PERFECTA, las indicaciones para colocarse, la caricatura) **nunca se ladean
  con la cabeza**: siempre derechos de pie y colgado.
  - Tumbado y en plancha: en el suelo bajo la cara o en el techo, de cara a los ojos, con lo de arriba del texto hacia la
    cabeza y fijos (ladearla no los gira). Igual para todos los avisos de la vista.
- Los avisos de lo que se hace mal salen grandes, impresos en el suelo, durante unos 4 s.
- Al empezar cada ronda, la **carátula del duelo** (`src/64_intro.js`, modelo 3 de los propuestos): 7 s, grande, a 2,5 m,
  con todo lo demás en negro; tú (rango y récord) contra el jefe de la ronda, sin la caricatura (sale después, hasta
  calibrar). Se salta con cualquier botón del mando o con el pulgar arriba.
- Al perder todas las vidas: fundido en negro, aviso claro de derrota y resumen automático con «Otra ronda» y «Menú
  principal».

**Menús**
- **Menú de muñeca:**
  - se abre con el botón MENÚ de la muñeca izquierda y se queda **quieto delante del jugador**, de cara y derecho; ni la
    mano ni el mando lo mueven (mirar a la muñeca no lo recoloca; con mandos, X/Y lo recoge si está a la vista);
  - se cierra con la palma izquierda hacia abajo o con el puño;
  - los menús nuevos salen solos.
- **Cada menú sale donde estaba el anterior**: «Traer menú», «Volver», «Menú principal» y el resumen no se alejan.
- Los botones de los menús se pulsan con **las dos manos** (el botón MENÚ de la muñeca izquierda, con la derecha). Las
  teclas son **sólidas**: al llegar al fondo, la mano que se ve se queda apoyada en ella y no la atraviesa.
- Tras pulsar un botón, hay que **retirar el dedo** antes de que cuente otra pulsación, para que no se toquen dos
  opciones ni el menú siguiente.
- Menús compactos y al alcance de la mano:
  - lo poco usado va en submenús (Sonido, Entorno, Ajustes…);
  - el menú principal: arriba, el **modo** (Combate, Arcos, Barras, Toques) en pestañas con su color, y debajo lo elegido
    (modo · ejercicio · rango); a la izquierda, sus partes con su color: Ronda (el ejercicio), Dificultad (rango, «Al
    fallo», lo del ojo), Rivales y armas (en Combate), Sesiones (si hay) y Opciones (Sonido, Entorno y Ajustes, en
    pestañas), el reproductor de Spotify (pequeño, en un cuadrado, con rótulo móvil) y Salir; a la derecha, lo de la parte
    elegida, con su color; EMPEZAR, pequeño, arriba a la izquierda del título; en Ajustes, las pestañas de los modos se
    llaman «Modo Arcos», «Modo Barras» y «Modo Toques»;
  - el jugador solo ve lo que el desarrollador marca con el ojo en su tabla de dificultad (`src/67_dev.js`); el menú
    completo y la tabla son del modo desarrollador, que está escondido; ya no hay estrellas de favoritos;
  - las canciones de cada ejercicio son del jugador (también se ponen de serie desde la tabla);
  - cada parte tiene su color.
- Solo se ofrecen los ejercicios que valen para el modo elegido.

**Sonido**
- Mientras suena Spotify, el sonido ambiente se pone a 0 %.
- En las sesiones, entre bloques sigue la canción del bloque que acaba (sin ambiente) y se funde con la del siguiente.

**Realidad mixta**
- Puede usar la habitación escaneada o colocarse a mano. Lo colocado (y las barras y paralelas) se recuerda entre
  sesiones.

**Página web**
- Lo primero que se ve son los botones de entrar (realidad mixta, VR, ordenador).
- Luego el modo y el ejercicio en fichas compactas, y después las opciones.
- Las estadísticas del día, con color, animación y la racha, son un incentivo para volver.

Cuando una petición sea ambigua o haya varias formas razonables de hacerla, **dale al usuario propuestas** (o modelos
visuales) y deja que elija. Cuando el usuario pregunte «¿entiendes lo que te digo?», resúmele lo que has entendido.
