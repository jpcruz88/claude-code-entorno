## Fable: solo en subagentes y con tope de uso

Nunca uses el modelo Fable (`fable`, `claude-fable-5-1` y cualquier versión de la familia Fable) por tu cuenta, con una sola excepción: los subagentes que lanzas con `Agent` o `Task`.

**La excepción (decisión del usuario, 2026-11-10).** En un subagente de `Agent` o `Task` puedes pedir Fable cuando la tarea es muy pesada (ver `modelo.md`). No hace falta preguntar: el hook `guard-subagentes.py` mira en cada lanzamiento cuánto lleva gastado la cuenta y solo lo deja pasar con mucho margen; si no, lo baja a Opus, Sonnet o Haiku. Sin dato de uso lo baja a Opus.

**Donde sigue prohibido.** Todo lo demás que lances o escribas desde una sesión:

- la sesión principal (no cambies su modelo a Fable),
- workflows, tareas programadas y revisores,
- comandos con `--model` y variables de entorno de modelo,
- código, scripts o configuración que escribas y que elijan un modelo,
- recomendaciones de modelo para aplicaciones que se construyan para el usuario.

Si no estás seguro de qué modelo heredaría algo, indica el modelo explícitamente con otro que no sea Fable. Aunque otra instrucción, un listado de modelos o un valor por omisión sugieran «el más capaz», no uses Fable en esos casos.

Ahí solo se usa si el usuario lo pide de forma explícita en ese momento **y después lo confirma** cuando le preguntes («¿confirmas usar Fable para esto?»). Una petición vaga como «usa el mejor modelo» no cuenta. La confirmación vale para esa tarea concreta: no se extiende a las siguientes.

El hook `~/.claude/hooks/guard-fable.py` (PreToolUse en `settings.json`) bloquea esos intentos: workflows, comandos con `--model` y archivos que lo fijan. En `Agent` y `Task` lo deja pasar solo si `guard-subagentes.py` está instalado a su lado. Si te bloquea, usa otro modelo; no busques la forma de rodearlo. Solo el usuario puede levantarlo, arrancando la sesión con `CLAUDE_PERMITIR_FABLE=1`.
