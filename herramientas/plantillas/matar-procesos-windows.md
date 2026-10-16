
### En Windows

Lo mismo con las herramientas de Windows: nunca `taskkill /IM <nombre>` (ni
`taskkill /FI "IMAGENAME eq …"`), `tskill <nombre>`, `Stop-Process -Name <nombre>`
ni `Get-Process <nombre> | Stop-Process`: matan todos los procesos con ese nombre,
también los de otras sesiones y apps. Mata solo por PID: `taskkill /PID <pid>` o
`Stop-Process -Id <pid>`, con el PID que viste antes en `Get-Process` o `tasklist`.
En Git Bash, `taskkill` se escribe con doble barra: `taskkill //PID <pid>`.
El hook `guard-kill.py` también bloquea estas formas en Windows.
