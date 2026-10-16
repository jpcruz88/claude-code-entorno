## Matar procesos

Mata procesos solo por PID concreto: el que guardaste con `$!`, el que dio `lsof -ti :PUERTO`, o el que viste antes con `pgrep -fl <patrón>`.

Nunca uses `pkill -f`, `killall` o `pgrep … | xargs kill` con patrones cortos o genéricos (cat, node, python, zsh, claude…), ni `kill -1` / `kill 0`. `-f` compara contra la línea de comandos completa, y un patrón corto coincide con rutas de apps y del sistema. El 11-sep-2026 `pkill -f 'cat'` cerró 13 pestañas de iTerm, Claude Desktop y varias apps.

El hook `~/.claude/hooks/guard-kill.py` bloquea estos comandos. Si te bloquea, no intentes rodearlo: busca el PID exacto o pregunta al usuario.

### En Windows

Lo mismo con las herramientas de Windows: nunca `taskkill /IM <nombre>` (ni
`taskkill /FI "IMAGENAME eq …"`), `tskill <nombre>`, `Stop-Process -Name <nombre>`
ni `Get-Process <nombre> | Stop-Process`: matan todos los procesos con ese nombre,
también los de otras sesiones y apps. Mata solo por PID: `taskkill /PID <pid>` o
`Stop-Process -Id <pid>`, con el PID que viste antes en `Get-Process` o `tasklist`.
En Git Bash, `taskkill` se escribe con doble barra: `taskkill //PID <pid>`.
El hook `guard-kill.py` también bloquea estas formas en Windows.
