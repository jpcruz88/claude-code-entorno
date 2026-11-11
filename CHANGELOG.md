# Cambios

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El
repo no tiene versiones numeradas: cada entrada es un cambio fechado.

## Sin publicar

- Hook `hilo.py` (SessionStart): el hilo literal de la conversación. Un 18 % de las sesiones se compactaba y seguía con un resumen escrito por el modelo; ahora, tras compactar o reanudar, el hook mete en el contexto los mensajes del usuario tal como los escribió (el primero y los últimos que quepan en 9.000 caracteres) y los archivos editados, sacados de la transcripción. Al abrir una sesión apunta a la anterior del proyecto con su último mensaje literal. Como comando, `hilo.py buscar "<término>"` cita lo dicho en sesiones pasadas con fecha y sesión (`--todos` para todos los proyectos) y `hilo.py ver <id>` muestra una sesión entera. No guarda nada nuevo. La regla `memoria.md` pide usarlo en vez de reconstruir de memoria, y decir que no se encontró si no aparece.
- `ctx-budget` 0.2.0: al cruzar el 70 % o el 85 % de contexto, el siguiente mensaje del usuario lleva una nota para Claude que le pide actualizar `handoff.md` antes de seguir, con la conversación entera todavía delante. Antes dependía de que Claude se acordara al cerrar y casi nunca se escribía (4 `handoff.md` contra 63 `handoff-auto.md`). El usuario no ve la nota y su texto no cambia.
- La sesión principal ya no arranca con Haiku. La regla `modelo.md` pide usar el modelo que el usuario tiene elegido y no cambiarlo por cuenta propia; `settings.base.json` propone `opus` para una máquina nueva (el instalador conserva el modelo que ya tengas).
- Hook `caveman-activo.py` (SessionStart y UserPromptSubmit): el modo caveman se activa solo en cada sesión. Antes dependía solo de la regla `caveman.md`, que es texto, y había sesiones que no cargaban la skill. Al abrir, reanudar, limpiar o compactar mete en el contexto las reglas del modo en corto (unos 1.100 caracteres; no copia la skill entera, que eran 5.300 en cada sesión y en cada subagente); en cada mensaje recuerda el modo en una línea. Sigue `/caveman lite|full|ultra`, «stop caveman» y «modo normal», y guarda el modo de cada sesión en `~/.claude/caveman/` (se borra a los 30 días sin uso). Una sesión nueva siempre empieza en `full`.
- Ghostty abre herdr con `herdr/esperar-discos.sh`: si la sesión guardada usa carpetas de un disco externo que aún no está montado (pasa al iniciar sesión), espera hasta 120 s (`HERDR_ESPERA_DISCOS`; Ctrl+C para no esperar) antes de abrir herdr. Sin eso herdr restauraba las pestañas sin carpeta, con «Saved directory is unavailable», y no lo reintentaba. No espera si el servidor de herdr ya está abierto.
- `guard-subagentes.py` vuelve a ser ejecutable en el repo: `settings.base.json` lo lanza por su ruta y sin el permiso fallaba con «Permission denied» en cada Agent o Task, sin bloquear, así que la guarda no revisaba nada. Prueba nueva (`pruebas/test_hooks_ejecutables.py`) que falla si un hook lanzado por su ruta no es ejecutable. `instalar_comun.py` recupera el permiso de ejecución aunque el contenido del archivo ya esté al día.
- Revisión de higiene (rama `fix/revision-higiene`):
  - `secret-guard` 0.2.0 detecta URL con credenciales, variables `*_PASSWORD`/`*_SECRET`/`*_TOKEN`, claves de OpenAI, Stripe, Google, JWT, tokens de Telegram, clave secreta de AWS y tokens de npm, y pregunta antes de que `cat`, `less`, `more`, `head`, `tail` o `bat` lean un archivo sensible (ahora también `.envrc`, `id_ecdsa`, `.npmrc`, `.netrc` y `*.key`).
  - `caveman-badge` 0.1.1: «stop caveman.» con puntuación final apaga el badge.
  - Poda de respaldos `.bak-*`: tras crear uno se conservan los 3 más recientes de ese archivo (`instalar_comun.py` y `fusionar_settings.py`).
  - Prueba nueva que falla si el clon no tiene `core.hooksPath=.githooks`; el comando está en `CONTRIBUTING.md` y en el arranque del README.
  - La regla `git.md` pide la línea `Co-Authored-By` con el modelo que realmente escribió el cambio, no uno fijo. La regla `mods-version.md` entra al repo y se exporta.
  - El CI corre `claude plugin test` en cada carpeta de `mods/`.
  - README: título `claude-code-entorno`, arranque rápido y la fila de reglas separada; AGENTS.md describe los mods, Jev, el tope de uso, «Al día» y la memoria maestra.
- Fable en subagentes, con tope de uso (decisión del usuario, 2026-11-10). `guard-subagentes.py` acepta `fable` en Agent y Task, y Jev lo tiene entre sus opciones de modelo. El tope (`jev_limites.py`) solo lo deja pasar con mucho margen: la semana 20 puntos o más por debajo del ritmo (o después del corte, bajo 97 %) y la ventana de 5 horas bajo 40 %. Con menos margen baja a opus, sonnet o haiku, y queda la línea `tope: fable → opus` en `decisiones.jsonl`. Sin dato de uso, o si el cálculo falla, baja a opus. `guard-fable.py` deja pasar Fable en Agent y Task solo si `guard-subagentes.py` está a su lado; en workflows, comandos y archivos sigue bloqueado. Las reglas `modelo.md` y `nunca-fable.md` piden elegir el modelo por el tamaño de la tarea y dejan el crédito al tope. Tablero 0.9.0 muestra `fable xhigh · sin recorte` y `· fable ok`.
- Topes por uso de la cuenta (`claude/hooks/jev_limites.py`, aplicados por `guard-subagentes.py`): antes de cada Agent o Task, el tope baja el modelo y el esfuerzo según el uso de la cuenta. El ritmo semanal pide llegar al jueves a las 23:00 con el 90 % usado; por encima de ese ritmo se bajan escalones. La ventana de 5 horas tiene sus propios escalones (60, 75 y 85 %). Después del corte del jueves no hay freno hasta el 97 % de uso semanal. El tope nunca bloquea: solo baja con `updatedInput`. Sin dato, o con un dato de más de 6 horas, no hay tope.
- `xhigh` con margen: es la cuarta opción de esfuerzo de Jev y de los subagentes. Solo pasa cuando la semana va bien por debajo del ritmo y la ventana de 5 horas está bajo el 60 %. Si no hay dato de uso, el esfuerzo máximo es `high`. Si el cálculo del tope falla, `xhigh` también baja a `high`. `max` sigue bloqueado siempre, y en un Workflow `xhigh` también se bloquea, porque no se puede bajar.
- La statusline guarda `~/.claude/jev/limites.json` en cada redibujo, con el uso de la ventana de 5 horas y de la semana y su reinicio. Escribe de forma atómica y solo cuando llegan los datos de suscripción; con clave de API no escribe nada. Como varias sesiones escriben el mismo archivo, mezcla con lo que ya hay: con el mismo reinicio (±60 s) conserva el uso mayor, un reinicio posterior gana y uno anterior no pisa la ventana actual.
- El tope se recalcula en cada subagente con el uso de toda la cuenta, aunque haya varios proyectos abiertos a la vez. El archivo es uno solo para la cuenta, así que cada decisión ve el dato más reciente de cualquier sesión.
- Tablero 0.3.1: fila de ritmo semanal en la caja JEV, y los topes en el log (`tope → sonnet · semana +12 pts`), sin contar en el total de decisiones de Jev.
- Memoria maestra privada: hook `memoria-maestra.py` (SessionStart y Stop) que pregunta si crear el repo privado, lo clona, enlaza la memoria y la sincroniza.
- Regla `git.md` (commit y push siempre), regla y hook `nunca-fable` al repo maestro.
- Agentes y subagentes: Haiku, Sonnet u Opus, con esfuerzo low, medium, high o xhigh (`xhigh` con margen, ver abajo); `max` sigue bloqueado y Fable sigue prohibido, salvo en subagentes de Agent y Task y con el tope de uso (ver la primera entrada). Hook `guard-subagentes.py` en Agent, Task y Workflow; esfuerzo de Opus `xhigh` retirado de la configuración base.
- Jev elige el modelo y el esfuerzo de los subagentes que lanza Claude (`guard-subagentes.py`). Solo cambia lo elegido con confianza suficiente; en los demás casos decide Claude y la decisión queda registrada.
- Jev sugiere qué hacer cuando la misma herramienta falla dos veces seguidas con el mismo error: reintentar, cambiar de enfoque o parar y preguntar (hook `jev-reintento.py`). La sugerencia llega a Claude como nota; el error va a Jev normalizado y recortado.
- Tablero 0.3.0 con vista en diagrama (`layout: diagrama`), y las decisiones de Jev en el log, la barra y las tarjetas.
- CI en GitHub Actions: pruebas, privacidad y gitleaks en Linux; PSScriptAnalyzer y
  pruebas en Windows.
- Hooks de git en `.githooks/` (`pre-commit` y `pre-push`).
- Pruebas de configuración: `settings.base.json` válido, hooks que existen, y
  `claude plugin validate` sobre el marketplace y cada mod.
- `exportar.sh` ahora muestra diferencias sin escribir; `--aplicar` escribe.
- La revisión de identidades acepta el correo acordado aunque el nombre de usuario
  de git sea otro.
- Documentación: `SECURITY.md`, `CONTRIBUTING.md`, guía de uso en `docs/`.

## 2026-10-31

- Los 8 mods de `claude-mods` se unen en `mods/`. Instalan por defecto.
- Modelo por defecto Haiku, con regla `claude/rules/modelo.md`.
- Regla de memoria persistente `claude/rules/memoria.md`.
- Se quitó la entrada duplicada de `guard-kill.py` en la config local.

## 2026-10-29

- OpenCode como respaldo, config de OpenCode, panel de servicios locales y
  Neovim con LazyVim.
- Universal Control: revisión y aviso entre dos Mac.
