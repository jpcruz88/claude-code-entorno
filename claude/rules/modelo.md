## Modelo y esfuerzo

**Agentes y subagentes (herramienta Agent y Task):** pueden usar `haiku`, `sonnet`,
`opus` o `fable` (o su id completo, como `claude-opus-5-5`), con esfuerzo `low`,
`medium`, `high` o `xhigh`. Un agente sin `model` o `effort` explícitos, o con valores
fuera de esa lista, se bloquea (`claude/hooks/guard-subagentes.py`). `max` se bloquea
siempre.

**Elige según el tamaño de la tarea, no según el crédito:**

- Tarea muy pesada (diseño o investigación de gran alcance, muchas piezas a la vez, un
  error cuesta caro): `fable` con `xhigh`.
- Causa raíz poco clara, arquitectura o riesgo alto: `opus` con `high` o `xhigh`.
- Funcionalidad o depuración acotada: `sonnet` con `medium` o `high`.
- Búsquedas, formatos y cambios mecánicos: `haiku` con `low` o `medium`.

Del crédito se encarga el tope de uso de la cuenta (`jev_limites`): en cada lanzamiento
mira cuánto lleva gastado la cuenta y baja el modelo y el esfuerzo si no caben. Nunca los
sube, así que pide lo que la tarea necesita. `fable` solo pasa con mucho margen (la
semana 20 puntos por debajo del ritmo y la ventana de 5 h bajo 40 %); con menos margen
baja a `opus`, luego a `sonnet` y a `haiku`. Sin dato de uso, `fable` baja a `opus` y
`xhigh` a `high`. Jev, el modelo de decisiones, también puede cambiar la elección por
agente.

**Workflows:** cada `agent()` fija `model` (`haiku`, `sonnet` u `opus`) y `effort`
(hasta `high`). `fable` y `xhigh` se bloquean ahí, porque un workflow no se puede bajar.

**Sesión principal:** usa el modelo que el usuario tiene elegido (en `settings.json`
o con `/model`). Ya no hay un modelo fijo por omisión: aquí pesa más no perder el hilo
ni inventar datos que el gasto.

**Siempre:**
- Fuera de los subagentes de Agent y Task, nunca uses Fable (sesión, workflows, comandos,
  código), salvo que el usuario lo pida de forma explícita y lo confirme
  (`claude/hooks/guard-fable.py`, ver `nunca-fable.md`).
- No cambies el modelo de la sesión por tu cuenta para «hacerlo mejor». Si una tarea
  parece demasiado para el modelo elegido, dilo y pregunta antes de cambiar.
