# Tablero

Mod de Claude Code que dibuja sobre el prompt una banda en español con la carpeta actual, el modelo, el costo, el contexto, los subagentes, los permisos y el uso con su hora de reseteo, y deja una línea resumen en el footer.

Es solo de observación: no bloquea, reescribe ni retrasa nada, y no usa red, procesos ni archivos.

## Atribución

Derivado de [Flightdeck](https://github.com/scasella/claude-flightdeck), de Stephen Casella (scasella), con licencia MIT. El aviso de copyright original se conserva en `LICENSE`.

## La mascota

Debajo de la banda vive una criatura en píxeles que refleja tu contexto:

- **Vida** = el contexto que te queda. Con 100 % libre, la mascota está **feliz** (color vivo) y
  camina de un lado a otro de la banda.
- A medida que el contexto se usa, se **cansa**, se **enferma** (camina más despacio) y, cuando
  queda menos de 10 % de vida, **se está muriendo**. Con 0 % de vida está **muerta** y ya no se mueve.
- Sin lectura de contexto, la mascota no se dibuja.

Se recalcula cada vez que la banda se redibuja, así que el movimiento sigue a los turnos y a
los cambios de la sesión, no es una animación continua.
