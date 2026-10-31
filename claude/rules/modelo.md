## Modelo y esfuerzo

**Agentes y subagentes (herramienta Agent, Task y Workflow):** siempre
`claude-haiku-5-5` con esfuerzo **medio**. Sin excepciones: ningún otro modelo, y
ningún esfuerzo más alto que medio. Pasa siempre `model: "haiku"` y
`effort: "medium"` (en un workflow, `model: 'haiku'` y `effort: 'medium'` en cada
`agent()`). Un agente sin esos dos parámetros explícitos, o con otros valores, se
bloquea (`claude/hooks/guard-subagentes.py`). El esfuerzo «low» también se acepta.

**Sesión principal:** arranca con **Haiku**. Solo cambia de modelo si el usuario lo
pide de forma explícita en ese mensaje (por ejemplo «usa opus», «/model opus»). Esa
petición vale solo para esa tarea; la siguiente vuelve a Haiku.

**Siempre:**
- Nunca uses Fable, ni en la sesión ni en subagentes ni en workflows, salvo que el
  usuario lo pida de forma explícita y lo confirme (`claude/hooks/guard-fable.py`).
- No cambies de modelo por tu cuenta para «hacerlo mejor». Si una tarea parece
  demasiado para Haiku con esfuerzo medio, dilo y pregunta antes de cambiar.
