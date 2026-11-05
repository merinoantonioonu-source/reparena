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
- Dianas y marcas en las gafas: tiras planas de cara al jugador (como los corchetes y las líneas de enfoque). Las de
  silueta (stencil y copias de la figura del enemigo) dejaban planos de basura blancos y azules pegados a la vista en
  cuanto salía la primera diana.
- En las gafas, no cambies la capa de imagen (`XRWebGLLayer`) a menudo: cada una ocupa otra memoria de vídeo y, con
  muchos cambios, las gafas pintan planos de basura blancos y azules. La foveación se cambia en la capa de ahora. La
  resolución se elige una vez al entrar (`qualSessionStart`, `src/80_main.js`) y no cambia en la partida: para aligerar,
  solo foveación y sombras (si no, la nitidez se quedaba baja y las letras, borrosas). El navegador de las Quest 3 da
  como «nativa» ×1 (1680×1760 por ojo, menos que la pantalla): para que se vea nítido hay que pedir más (Alta ×1,4).
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

**Estilo**
- **Todo se diseña para el estilo Cómic** (`src/38_comic.js`), que es el de serie: en Realista, con la resolución alta, las
  gafas no llegan y va a saltos. Lo nuevo se prueba y se mira en Cómic; Realista queda como opción.

**Travesía** (`src/75_trek.js`)
- Siempre en Cómic. Cada repetición empuja por un sendero del bosque; sin repeticiones, te paras. La velocidad sale del
  ritmo de las repeticiones y de lo hondo que se baja (más rápido e intenso, más deprisa). Más deprisa que al
  principio (es una prueba física: hasta 2 m/s por la «Velocidad de avance», de 60 a 200 %, 130 % de serie), sobre una plataforma quieta bajo los pies. El
  sendero serpentea (el mundo gira despacio a tu alrededor; «Sendero con curvas» lo quita si marea). Detrás, siempre paisaje.
- Cada oleada, un tramo con su paisaje (bosque, aldea, pradera del lago, pinar al atardecer). Los retos piden **otro movimiento**
  que el que hace avanzar: con las piernas, troncos que saltar; con curl, ramas bajas para agacharse (frenan y rompen la
  racha, sin quitar vidas). Todo apoyado en el suelo, con su sombra.
- Paradas: el cofre con cadenas (se rompen con repeticiones de otro ejercicio; dentro, una llave —con tres, el tesoro— y
  una gema), el derrumbe (la roca se aparta embistiéndola con zancadas), el arroyo sinuoso (de piedra en piedra con
  saltos; cada salto, el mundo baja y sube como si te elevara), el desfiladero que se desmorona (cada salto, al pilar siguiente; el de atrás se hunde) y los bandidos (solo
  esquivar: cada uno lanza 3 o 4 golpes seguidos —agacharse ante el gancho, apartarse ante el directo, con aviso largo y
  el golpe a cámara lenta— y, si se los esquivas todos, cae agotado; nada de puñetazos, que con el retraso de las manos en
  las gafas no daba tiempo; con la cabeza del personaje base y sin contorno). Lobos que te persiguen: si vas más despacio,
  te alcanzan y muerden. Sin enjambres.
- **No crear de cero enemigos ni elementos**: se usan los modelos que da el usuario (en `models/`); si no hay, se cambia
  el elemento. Las casas se montan con las piezas del Medieval Village.
- El marcador, siempre flotando a un lado (nada de columnas que vayan contigo).
- El paisaje se dibuja todo junto, una pieza por modelo: que no pida más a la gráfica que el bosque de Combate.
- El agua, realista (no una mancha azul): ondas que el viento eriza a rachas, reflejo del cielo y destellos; en el río,
  corriente con espuma y estelas en las piedras.
- Fondos realistas (fotos de Poly Haven en `models/fondos/`, ver su `LEEME.md`): en la Travesía, uno por tramo; en los
  demás modos, «Fondo realista» (Opciones → Entorno, 7 para elegir). Solo paisajes abiertos, al fondo con el bosque de cómic
  delante: los de bosque por dentro, ciudad y playa se quitaron (lo cercano se veía plano, de cartón). En Arcos, con
  fondo, sin compuertas: avanzas por el paisaje de la Travesía.
- Su caricatura no habla de rayos: cada repetición empuja por el sendero.

**Repeticiones y disparo**
- Cada repetición (sentadilla, zancada…) carga **un disparo por mano**, como mucho uno por mano y sin acumular.
- Con las manos desnudas no se dispara pellizcando. Se lanza con una **sacudida de la mano hacia el enemigo**: puede
  salir de la cadera y hacerse subiendo o bajando en la sentadilla. Sin sacudida, la carga se queda en la mano. El rayo
  va al enemigo más cercano a la dirección de la sacudida, sin exigir puntería exacta.
- El curl con kettlebell del usuario es con la pesa agarrada por el asa con las dos manos (los puños juntos, la bola
  colgando debajo): es el «Curl con barra o kettlebell». Las gafas confunden las manos pegadas: el curl y el press con
  barra siguen las dos manos como una sola pesa, y todo lo que se hace con las dos manos juntas en una pesa (elevación
  frontal, swing, sentadilla con press y con elevación) descarta los saltos imposibles de una mano (`HF`). En el
  curl y el press con barra, dos manos juntas se confirman entre sí, y si se ven separadas vale la que se mueve (las gafas
  dejan quieta la que pierden).
- El press de hombro, el press con barra y la flexión en pica se quitaron (no se detectaban bien en las gafas); el leñador,
  porque no aportaba nada.
- Cargas ×2/×3/×4 aguantando la postura más dura, como en la sentadilla: fondos (abajo, codos a 90°), elevación frontal
  (arriba), antebrazos (la barra escurrida), dominadas y remo (arriba; al bajar, onda que con ×4 revienta también a los
  cercanos). La plancha con un brazo, no: una flexión entera (bajada y tiempo de Flexiones) deja el brazo siguiente a ×4.
- En Toques, entre un toque y el siguiente hay que **volver a la postura de partida**. Un toque vale aunque el objetivo
  aún venga de camino.
- Con espadas no hay diana ni láser, y los enemigos van directos a por el jugador.
- Inchworm: se sigue la **cabeza**, no las manos. Llegar con la cabeza a la línea luminosa del suelo (donde queda en la
  plancha, según la altura) carga el rayo; volver andando con las manos hasta la salida y ponerse de pie dispara y saca la
  onda, que se ve y se oye bien y lanza a los bichos por el aire. Una barra en el suelo enseña lo que avanza la cabeza.
  Cada flexión en la plancha, al final del recorrido, da más fuerza a la onda (×2, ×3, ×4: más lejos, más fuerte y con
  daño); la onda, de colores vivos y levantando polvo a su paso. Los bichos que mueren en el aire caen al suelo.
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
- Para animar a volver (`src/73_career.js`): experiencia y nivel con título y colores desbloqueables (solo se ven),
  misiones del día con su cofre (+100 XP, un escudo de racha —como mucho dos: un día sin entrenar se gasta solo y la racha
  sigue— y un color), campaña por modo y ejercicio (7 regiones, una por rango, con jefe en el quinto nivel,
  estrellas) y, en Progreso, tu semana y tu mejor ronda. Los ajustes de un nivel de la campaña no tocan los tuyos.
- El resumen de la ronda, lo esencial (opción A elegida): dónde acabó y el ejercicio, el número grande, la medalla y las
  perfectas, tres casillas (puntos, tiempo y kcal), un solo logro (el más importante) y dos botones, «Otra ronda» y «Menú
  principal». Nada de nivel, semana, mejor ronda, derribados, precisión ni combo.
- Con cartas de mejora por elegir, la oleada siguiente **espera a que el jugador elija**. Salen como mucho **cada tres oleadas** y solo
  si se las gana (pocos golpes en esas tres).
- Entre oleadas: fundido leve (sin que desaparezca la escena) y panel grande con la oleada que empieza y los puntos;
  mientras se ve, no sale nada (ni enemigos ni orbes).
- Arcos: el arco de plancha llega más despacio (velocidad propia), con un aviso grande delante y sin que lo adelante nada.
- Arcos: la fiebre se ve en rojo (columnas de luz, pista y arena) y con tormenta roja en el cielo de todos los entornos
  (nubarrones, niebla roja y relámpagos); con música, el compás se ve (♪ y destellos en cada pulso).
- Arcos va **«Al fallo» de serie** (reto de aguante).
- Arcos inclinados: agacharse en el centro no vale; hay que apartarse hacia el lado alto (pared de energía bajo el lado
  bajo hasta pasado el centro) y bajar sobre esa pierna.
- Arcos: cuanto más difícil (el rango), el láser oscila más amenazante (más pista, más deprisa, con amagos).
- Arcos: las paredes (obstáculos con hueco y la del lado bajo de los inclinados), rojas casi opacas con franjas, y el
  canto del hueco en verde: que no haya duda de hacia dónde volcar el cuerpo.

**Enemigos y física**
- Los enemigos **nunca atraviesan** compuertas, piedras, cajas ni otros sólidos. La bola de energía también es un
  obstáculo: la rodean.
- Se mueven con naturalidad y agresividad, sin chocar entre ellos.
- Parados esperando su turno, bailan al compás (el marcado o el de la canción de Spotify), también los robots.
- El lanzador tira algo más deprisa (y más a menudo) cuanto más difícil, poco a poco (como mucho un 40 %).
- Al abrirse una compuerta, su interior es oscuro.
- Luciérnagas (`src/56_motes.js`, Entorno → «Luciérnagas»): puntitos de luz con vuelo sereno y sinuoso de insecto (se
  ciernen, siguen, tiemblan un poco), en la tarjeta gráfica; nada de sprites que giren en círculo (las de antes, toscas).
- Los contornos de tinta: finos de lejos (grosor fijo en el mundo pasados 2,5 m) y solo en el borde de verdad (sin
  parpadeos al mover la cabeza).
- Los personajes geométricos hechos a mano gustaron poco: para enemigos nuevos, mejor modelos de Quaternius.
- Los voladores baten las alas siempre rápido, a su ritmo, sin depender de lo deprisa que avancen.
- Cada enemigo tiene resistencia, fuerza y dureza en la tabla del desarrollador; los nuevos entran solos en ella.
- En el menú, cada enemigo es una ficha con su retrato (de su modelo), su nombre, su resistencia y su fuerza. Un enemigo
  nuevo: añádelo a `FOE_PIC` (`src/00_core.js`) y rehaz `models/retratos.png` con `node tests/retratos.js`.

**Paneles y avisos en las gafas**
- Ningún panel puede tapar lo que viene hacia el jugador.
- La diana (la única, líneas de enfoque): rayas cortas que se mueven (giran despacio y corren hacia fuera). Las demás se
  quitaron.
- Cada ajuste con explicación lleva una tecla «?» que enseña su explicación al lado del menú.
- El marcador se ve siempre, también al mirarlo de frente, y sin texto de más.
  - Por defecto (VR), a un lado (izquierda o derecha, configurable), el doble de grande y siempre a la vista, por fuera de
    las compuertas.
  - Diseño elegido (C): rosco doble (fuera, la oleada con la muesca del récord; dentro, la racha en 10 tramos), oleadas en
    puntos, un solo hueco para mensajes a 48 px o más. En el relámpago, el borde es una mecha. Nada de cargas ni escudo en
    el marcador: se ven en el juego (bola en la mano, celdas del bláster, brazalete del escudo en el antebrazo).
- Las celebraciones (`cheer`) van solo al marcador; delante de la cara, solo lo que pide hacer algo ya o colocarse. Los
  logros importantes (meta del día, récord, récord al fallo, nivel, cofre del día) salen además en grande, en su propio
  aviso dorado (`trophy`, `src/60_ui.js`), sin tapar lo que llega.
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
  teclas son **sólidas**: al llegar al fondo, la mano que se ve se queda apoyada en ella y no la atraviesa; el panel
  también (el fondo y los huecos entre teclas).
- Tras pulsar un botón, hay que **retirar el dedo** antes de que cuente otra pulsación, para que no se toquen dos
  opciones ni el menú siguiente.
- Menús compactos y al alcance de la mano:
  - lo poco usado va en submenús (Sonido, Entorno, Ajustes…);
  - el menú principal, simple (el usuario lo complica si quiere, en Opciones): arriba, **EMPEZAR** grande (en lugar del
    título; con Sesiones, EMPEZAR SESIÓN); debajo, las cifras en fichas (nivel, hoy, racha y misiones; al tocarlas,
    Progreso); luego el **modo** (Combate, Arcos, Barras, Toques) con su color y, tras un separador, **Sesiones**; con un
    modo, sus ejercicios y la dificultad (galones, «Al fallo», la ronda en una ficha y lo del ojo); con Sesiones, la
    sesión bloque a bloque, legible; el modo, los ejercicios y la dificultad, cada uno en su caja con título y color
    (los modos, teclas enteras de su color; los ejercicios, en blanco); Spotify; y **Opciones ▸** (Rivales y armas, Progreso, Sonido, Entorno y Ajustes, en
    pestañas) y Salir; en Ajustes, las pestañas de los modos se llaman «Modo Arcos», «Modo Barras» y «Modo Toques»;
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
- El panel de la izquierda es un índice: cada apartado (`<section>` de `.main` con `id` y `data-toc`) y, debajo del que se
  ve, sus subapartados (los `h3` a la vista); a la derecha, solo ese apartado (`pageNav`, `src/68_prefs.js`). En el móvil,
  una barra fija arriba (icono y nombre del apartado, «☰ Apartados») que abre un panel de fichas grandes, dos por fila,
  con icono y color (`NAV_ICO`), el apartado de ahora a todo lo ancho con sus subapartados en botones, y lo de detrás
  oscurecido (tocarlo cierra); sin textos cortados. Un apartado nuevo: con su `id` y su `data-toc`.
- Las estadísticas del día, con color, animación y la racha, son un incentivo para volver.

Cuando una petición sea ambigua o haya varias formas razonables de hacerla, **dale al usuario propuestas** (o modelos
visuales) y deja que elija. Cuando el usuario pregunte «¿entiendes lo que te digo?», resúmele lo que has entendido.
