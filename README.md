# RepArena

Juego de ejercicio físico en realidad virtual y mixta para **Meta Quest 3**, que se juega desde el navegador de las gafas (WebXR) con seguimiento de manos. Cada repetición bien hecha es un disparo.

- **Modos:** Asalto (robots y, en flexiones, arañas), Enjambre (drones y avispas, apuntas con las manos o la mirada) y Arcos (solo sentadillas: agáchate para pasar bajo los arcos de energía).
- **Ejercicios:** sentadillas y flexiones (se detectan por la altura del visor) y curl de bíceps (por la posición de las muñecas).
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
| `src/40_models.js` | Robots, arañas, drones, avispa, arcos y guantes robóticos. |
| `src/50_fx.js` | Partículas, explosiones, restos. |
| `src/60_ui.js` | Menú fijo en atril, botones táctiles, deslizadores, teclado, paneles. |
| `src/70_game.js` | Lógica de partida: enemigos, arcos, detectores de repeticiones, oleadas. |
| `src/80_main.js` | Entrada XR (manos y mandos), bucle principal, prueba en el ordenador. |
| `tests/` | Pruebas sin navegador con un THREE simulado. |

Los módulos `src/NN_*.js` se concatenan en orden dentro de una sola función, así que comparten ámbito.

## Desarrollo

```bash
python3 src/build.py      # regenera index.html
node tests/test.js        # juega partidas simuladas en todos los modos; debe acabar en "ERRORS: none"
node tests/render.js      # (opcional) imágenes de los modelos en tests/out/
```

Haz commit de `index.html` junto con los cambios en `src/`: es lo que publica GitHub Pages.

Three.js r128 se carga desde cdnjs. El juego no tiene otras dependencias.
