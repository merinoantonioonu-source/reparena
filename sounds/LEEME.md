# Sonidos propios

Pon aquí archivos de audio con estos nombres y el juego los usará en lugar de los sonidos sintetizados.
Vale `.mp3`, `.ogg` o `.wav` (por ejemplo `rayo.mp3`). Si un archivo no está, suena el sintetizado.

| Archivo | Cuándo suena |
| --- | --- |
| `rayo` | Cada disparo (el rayo sale de la mano o la pistola). |
| `rayo-cargado` | Disparos cargados (×2, ×3, ×4). Si no está, se usa `rayo` más grave. |
| `impacto` | Cuando el rayo alcanza al enemigo. |
| `tentaculos` | Cuando un tentáculo del foso se lanza hacia ti. |
| `caida-foso` | Cuando caes al foso (se suma al chapoteo). |
| `pompa` | Al reventar una pompa. |

Consejos: archivos cortos (menos de 2 s, salvo `caida-foso`), sin silencio al principio y en mono.
Cada vez que suenan se varía un poco el tono para que no se repitan iguales.

## Cómo subirlos desde el navegador

1. En GitHub, abre el repositorio y entra en la carpeta `sounds`.
2. Pulsa **Add file → Upload files** y arrastra los archivos (con los nombres de arriba).
3. Abajo, pulsa **Commit changes**. En un par de minutos GitHub Pages los sirve y el juego los carga al empezar.
