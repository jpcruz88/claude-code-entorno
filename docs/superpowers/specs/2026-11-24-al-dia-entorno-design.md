# «Al día» también actualiza este repo

Fecha: 2026-11-24. Aprobado por el usuario en el chat («adelante»).

## Para qué

El usuario quiere que cada máquina con este entorno busque una vez al día si hay
cambios nuevos en `main` del repo `claude-code-entorno` y los instale sola, sin
tener que correr `git pull` y el instalador a mano.

«Al día» (`claude/hooks/al-dia.py` + `al_dia.py`) ya corre una vez al día, en
segundo plano al abrir Claude, y actualiza skills, plugins y programas. Le falta
el propio repo. Este cambio le añade ese paso.

## Objetivos

- Una vez al día: traer `main` y, si el commit instalado no es el último, volver a
  correr el instalador con las mismas opciones que eligió el usuario.
- Mac (`instalar.sh`) y Windows (`instalar.ps1`).
- El tablero enseña el resultado en la caja de «Al día», con textos claros.

## Lo que no hace (anti-objetivos)

- Nunca pisa trabajo local: si la copia tiene cambios sin commit, no está en `main`
  o el `pull` no puede avanzar sin fusionar (`--ff-only`), no toca nada y lo avisa.
- No pide nada al usuario ni abre ventanas: el instalador corre con
  `--no-interactivo` / `-NoInteractivo`.
- No hace nada en una máquina cuyo instalador aún no guardó sus opciones.

## Enfoques considerados

1. **Pull + reinstalar con las opciones guardadas (elegido).** Reutiliza el
   instalador, que ya salta lo que está hecho; cubre cambios que añaden programas
   o mods.
2. Copiar solo los archivos (reglas, hooks) tras el pull. Más rápido, pero se
   rompe en cuanto un cambio añade un programa, un mod o un paso del instalador.

## Diseño

**El instalador recuerda cómo se instaló.** `herramientas/instalar_comun.py`
recibe `--recordar <opción>` (repetible) con las opciones que el usuario pasó al
instalador, sin `--simular` ni `--no-interactivo`. Al terminar (no en simulación)
escribe `~/.claude/al-dia/entorno.json`:

```json
{"repo": "/ruta/al/repo", "plataforma": "unix", "opciones": ["--sin-skills"], "commit": "<sha o null>"}
```

`commit` es el `HEAD` del repo si la instalación terminó sin problemas, y `null`
si hubo alguno: así «Al día» la repite al día siguiente.

**El paso de «Al día» (`actualizar_entorno`)** corre primero en cada revisión
completa (y en el reintento, si falló):

1. Sin `entorno.json` legible: no hace nada.
2. `git -C <repo> status --porcelain` con salida: pendiente «copia con cambios sin
   commit · no se tocó».
3. Rama distinta de `main`: pendiente «la copia no está en main · no se tocó».
4. `git -C <repo> pull --ff-only -q`; si falla: fallo con su error.
5. Si `HEAD` es el `commit` guardado: nada más.
6. Si no: corre el instalador (Mac: `bash <repo>/instalar.sh --no-interactivo
   <opciones>`; Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
   <repo>\instalar.ps1 -NoInteractivo <opciones>`), con 30 min de límite. Si sale
   con 0: cambio «claude-code-entorno: <sha7 antes> → <sha7 después>». Si no:
   fallo con su error, y se reintenta como los demás fallos.

El nombre en el resultado es `claude-code-entorno` y el tipo `entorno`. El
tablero, para el tipo `entorno`, enseña el motivo del pendiente o el error del
fallo en lugar del texto genérico.

## Lo que decide quien lo construye

Nombres internos, forma de las pruebas y el texto exacto de los errores cortos.
