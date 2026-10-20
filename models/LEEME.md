# Modelos 3D de los enemigos

| Archivo | Qué es |
| --- | --- |
| `imp.glb` | **Imp**, el diablillo (Bestiary · Dungeon Monsters Kit, de [Quaternius](https://quaternius.com)): cuerpo y esqueleto, sin texturas. |
| `puglin.glb` | **Puglin**, del mismo pack. |
| `zombie.glb` | **Zombi** («Zombie», de Quaternius, 2017): cuerpo, esqueleto y sus propias animaciones (andar, correr, reposo, morder y arrastrarse), convertido de `ZombieSmooth.fbx` con FBX2glTF. No trae animaciones de morir ni de encajar golpes: eso lo hace el juego. |
| `tex/zombie.png` | Su paleta de colores (32 × 32 px): cada parte del modelo toma un color de aquí. |
| `trex.glb`, `raptor.glb` | **T-Rex** y **velociraptor** (Dinosaur Animated Pack, Quaternius, dic. 2018, CC0): cuerpo, esqueleto, colores y sus animaciones (reposo, andar, correr, saltar, atacar y morir), convertidos de sus `.fbx` con FBX2glTF. |
| `anims.glb` | Las animaciones que usa el juego (andar, trotar, correr, puñetazos, tajo de espada, recibir golpe, morir, bailar, lanzar un hechizo, voltereta y guardia), sacadas de la **Universal Animation Library** (Quaternius, CC0), hecha para el mismo esqueleto. Solo lleva el esqueleto y esas animaciones (sin los dedos ni la malla). |
| `tex/` | Las texturas, reducidas a 1024 px para que carguen deprisa en las Quest: tres colores por monstruo (`*_color1..3.jpg`), relieve (`*_normal`), rugosidad y metal (`*_orm`) y brillo de los ojos (`*_emissive`). |

Cómo se prepararon, por si hay que añadir otro monstruo del mismo tipo (esqueleto de Unreal: `root`, `pelvis`, `spine_01`…):

1. El `.fbx` del monstruo se convierte a `.glb` con [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) (`FBX2glTF --binary --input Monstruo.fbx --output monstruo`).
2. Las texturas `T_<Monstruo>_*.png` se reducen a 1024 px y se guardan en `tex/` con los nombres de arriba.
3. En el juego, `src/42_beasts.js` carga el modelo, le aplica las animaciones de `anims.glb` (las rotaciones de los huesos que tiene, y el balanceo de la pelvis a su escala) y le pone una de sus tres texturas de color al azar.

Licencias: las animaciones de la Universal Animation Library son CC0. Los modelos y texturas del Bestiary están bajo la Quaternius Asset License (QAL) v1.0: se pueden usar gratis en juegos y otros proyectos, también comerciales y sin citar al autor, siempre que vayan dentro del proyecto; lo que no se permite es redistribuirlos o revenderlos sueltos, como recurso o paquete de recursos. Por eso aquí están ya convertidos y preparados para este juego, no el pack original.

El zombi: el zip no trae archivo de licencia; Quaternius publica sus packs gratuitos como CC0 (dominio público).
