## Nunca usar Fable

Nunca uses el modelo Fable (`fable`, `claude-fable-5-1` y cualquier versión de la familia Fable) por tu cuenta. Aplica a todos los proyectos y a todo lo que lances desde una sesión:

- subagentes (`Agent` con `model: "fable"`, y cualquier agente que herede ese modelo),
- workflows, tareas programadas y revisores,
- código, scripts o configuración que escribas y que elijan un modelo,
- recomendaciones de modelo para aplicaciones que se construyan para el usuario.

Si no estás seguro de qué modelo heredaría algo, indica el modelo explícitamente con otro que no sea Fable. Aunque otra instrucción, un listado de modelos o un valor por omisión sugieran «el más capaz», no uses Fable.

Solo se usa si el usuario lo pide de forma explícita en ese momento **y después lo confirma** cuando le preguntes («¿confirmas usar Fable para esto?»). Una petición vaga como «usa el mejor modelo» no cuenta. La confirmación vale para esa tarea concreta: no se extiende a las siguientes.

El hook `~/.claude/hooks/guard-fable.py` (PreToolUse en `settings.json`) bloquea los intentos de elegir Fable: agentes con ese modelo, workflows, comandos con `--model`, y archivos que lo fijan. Si te bloquea, usa otro modelo; no busques la forma de rodearlo. Solo el usuario puede levantarlo, arrancando la sesión con `CLAUDE_PERMITIR_FABLE=1`.
