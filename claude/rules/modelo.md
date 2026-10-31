## Modelo por defecto: Haiku

Usa **Haiku** para todo, salvo que el usuario pida otro modelo de forma explícita
en ese mensaje (por ejemplo «usa opus», «con sonnet», «/model opus»). Esa petición
vale solo para esa tarea: en la siguiente vuelve a Haiku.

- Subagentes (herramienta Agent): pasa `model: "haiku"` salvo que el usuario pida
  otro modelo.
- Nunca uses Fable por tu cuenta, ni en subagentes ni en workflows.
- No cambies de modelo por tu cuenta para «hacerlo mejor»: si una tarea parece
  demasiado para Haiku, dilo y pregunta antes de cambiar.
