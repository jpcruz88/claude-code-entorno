## Cambios a mods de claude-code-entorno: pasos completos

Los mods (`mods/<nombre>/` en `~/claude-code-entorno`) se cargan desde la caché de
plugins, indexada por versión (`~/.claude/plugins/cache/claude-code-entorno/<mod>/<versión>`).
Si no subes la versión, `claude plugin update` no copia nada y Claude sigue usando
la copia vieja. Por eso «no se ve el cambio» casi siempre es esto.

Cada vez que cambies un mod, haz estos pasos en orden, sin esperar a que te los pidan:

1. **Prueba primero** (TDD, ver `tdd.md`): una prueba que falle por la razón esperada,
   luego el código mínimo.
2. **Corre la suite del mod:** `claude plugin test mods/<nombre>` (desde `~/claude-code-entorno`).
   Debe quedar todo en verde; muestra la salida real.
3. **Sube la versión** en `mods/<nombre>/.claude-plugin/plugin.json` (patch o minor,
   nunca la misma que ya está instalada).
4. **Actualiza el CHANGELOG del mod** con la versión nueva arriba de todo. Las entradas
   de «Unreleased» pasan a la versión nueva.
5. **Commit y push** (ver `git.md`): mensaje Conventional Commits en español y la línea
   `Co-Authored-By`. Nunca `--no-verify`.
6. **Actualiza el plugin:** `claude plugin update <nombre>@claude-code-entorno`.
7. **Verifica la caché:** `diff -rq` entre `~/.claude/plugins/cache/claude-code-entorno/<nombre>/<versión>`
   y `mods/<nombre>` debe salir sin diferencias (solo `.gitignore` y `node_modules`
   se ignoran).
8. **Dile al usuario que reinicie Claude** una vez, y di qué debe mirar. No digas que
   el cambio funciona en pantalla hasta que lo haya visto; di solo lo que verificaste.

**Why:** 2026-11-08, tablero: el usuario vio el mismo panel durante varias iteraciones
porque la versión no subía y la caché servía la copia de 0.3.5.

**How to apply:** aplica estos pasos completos a cualquier cambio de mod, aunque sea
pequeño. Si alguno no se puede hacer, dilo y no sigas como si estuviera hecho.
Ver también la memoria `tablero-cache-por-version`.
