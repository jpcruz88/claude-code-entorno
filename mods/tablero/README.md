# Tablero

Mod de Claude Code que dibuja sobre el prompt una banda en español con la carpeta actual, el modelo, el costo, el contexto, los subagentes, los permisos y el uso con su hora de reseteo, y deja una línea resumen en el footer.

Es de observación: no bloquea ni retrasa nada, y no usa red, procesos ni archivos. La única excepción es la instrucción de reportar pasos que recibe cada subagente `savvy-*` (ver «Progreso y agentes»).

## Atribución

Derivado de [Flightdeck](https://github.com/scasella/claude-flightdeck), de Stephen Casella (scasella), con licencia MIT. El panel de progreso y de agentes está adaptado de [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress), de johnnyvizz, también MIT. Los avisos de copyright originales se conservan en `LICENSE`.

## La barra de vida

En el panel SESIÓN, una barra muestra la vida que te queda de contexto (`vida 50% ████████░░░░`).

- **Vida** = el contexto que te queda. La barra se vacía al usar contexto.
- **Color**: verde con vida alta (60 % o más), ámbar a media (de 30 a 59 %) y rojo cuando queda poca (menos de 30 %). En la terminal son tres tonos; en la app de escritorio la barra es un SVG con degradado continuo de rojo a verde.
- Sin lectura de contexto, la barra no se dibuja.

## Progreso y agentes (de savvy-progress)

- **Barra sobre el prompt**: el título del flujo, la fase, las tareas aceptadas frente a las planificadas, y un botón `×N` con el tamaño de la cuadrilla que abre el panel. Se muestra cuando la sesión principal reporta un flujo (`mcp__tablero__progreso`) o cuando arranca un subagente `savvy-*`.
- **Panel «Agentes»** (`/agentes-info`): subagentes en marcha, terminados y planificados, con nivel, modelo, esfuerzo, progreso de pasos, contexto, costo estimado y tiempo.
- **Cangrejos**: cada subagente es un cangrejo que camina mientras trabaja. Cada nivel lleva un accesorio (`cuidadoso` gira una llave, `pesado` pasa la lupa, `medio` voltea la tortilla, `ligero` corre con bandera). En la app de escritorio, `prefers-reduced-motion` los deja quietos. En la terminal, la opción `animacion: false` fija el glifo de cada agente en marcha y hace que el reloj se redibuje cada 30 s.
- **Costos**: son estimados con la tabla de precios de `hooks/savvy-core.ts`; Claude Code reporta tokens, no dinero.

### Cambio de comportamiento: encargos de `savvy-*`

Cada subagente `savvy-*` que no traiga la instrucción recibe al final de su encargo una línea que le pide reportar sus pasos con `mcp__tablero__paso`. Sin esa línea, los trabajadores suelen omitir el reporte aunque la herramienta exista. Los demás subagentes no cambian. Si no usas `savvy-flow`, este cambio no afecta nada.

### Opciones

- `agentesAbrir`: `any` (por omisión) abre el panel solo al arrancar cualquier subagente; `savvy` solo al arrancar un `savvy-*` o al reportar un plan; `off` nunca solo. Se puede abrir con `/agentes-info abrir`.

### Lo que no se portó

- Los niveles `fable` (el astronauta y su precio) no están: el mod no usa ese modelo. Un subagente `savvy-fable` cuenta como `otro`.
- Las traducciones a inglés, ruso y hebreo: el mod va solo en español, sin disposición de derecha a izquierda.
