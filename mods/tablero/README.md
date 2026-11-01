# Tablero

Mod de Claude Code que dibuja sobre el prompt una banda en español con la carpeta actual, el modelo, el costo, el contexto, los subagentes, los permisos y el uso con su hora de reseteo, y deja una línea resumen en el footer.

Es solo de observación: no bloquea, reescribe ni retrasa nada, y no usa red, procesos ni archivos.

## Atribución

Derivado de [Flightdeck](https://github.com/scasella/claude-flightdeck), de Stephen Casella (scasella), con licencia MIT. El aviso de copyright original se conserva en `LICENSE`.

## La barra de vida

En el panel SESIÓN, una barra muestra la vida que te queda de contexto (`vida 50% ████████░░░░`).

- **Vida** = el contexto que te queda. La barra se vacía al usar contexto.
- **Color**: verde con vida alta (60 % o más), ámbar a media (de 30 a 59 %) y rojo cuando queda poca (menos de 30 %). En la terminal son tres tonos; el degradado continuo en la app de escritorio queda pendiente.
- Sin lectura de contexto, la barra no se dibuja.
