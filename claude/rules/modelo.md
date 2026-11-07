## Modelo y esfuerzo

**Agentes y subagentes (herramienta Agent, Task y Workflow):** pueden usar
`haiku`, `sonnet` u `opus` (o su id completo, como `claude-opus-5-5`), con esfuerzo
`low`, `medium`, `high` o `xhigh`. Jev, el modelo de decisiones, puede cambiar esa
elección por agente, y el tope de uso de la cuenta (`jev_limites`) baja modelo y
esfuerzo cuando toca; `xhigh` nunca se bloquea, el tope lo baja si no cabe. `max` se
bloquea, y **Fable nunca** se permite, ni como
elección de Jev ni como modelo fijado a mano. Un agente sin `model` o `effort`
explícitos, o con valores fuera de esa lista, se bloquea
(`claude/hooks/guard-subagentes.py`). En un workflow, cada `agent()` fija `model` y
`effort` con esos mismos valores (en un workflow `xhigh` se bloquea: no se puede bajar).

**Sesión principal:** arranca con **Haiku**. Solo cambia de modelo si el usuario lo
pide de forma explícita en ese mensaje (por ejemplo «usa opus», «/model opus»). Esa
petición vale solo para esa tarea; la siguiente vuelve a Haiku.

**Siempre:**
- Nunca uses Fable, ni en la sesión ni en subagentes ni en workflows, salvo que el
  usuario lo pida de forma explícita y lo confirme (`claude/hooks/guard-fable.py`).
- No cambies de modelo por tu cuenta para «hacerlo mejor». Si una tarea parece
  demasiado para el modelo elegido, dilo y pregunta antes de cambiar.
