## Git: commit y push siempre

Cada cambio que hagas en un repositorio se **comitea y se sube** al terminar. No
esperes a que te lo pidan. Si el repo no tiene remoto, dilo y deja el commit local.

**Convenciones de commit (Conventional Commits, en español):**

- Línea de resumen: `tipo(ámbito): descripción`, en imperativo, máximo 72 caracteres.
  Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `ci`, `chore`. El ámbito es
  opcional (`fix(instalar): …`).
- Cuerpo opcional: explica el porqué, no el qué. Línea en blanco antes.
- Termina siempre con la línea `Co-Authored-By: Claude <modelo y versión> <noreply@anthropic.com>`,
  con el modelo que realmente escribió el cambio (el de la sesión o el del subagente),
  no uno fijo: por ejemplo `Claude Sonnet 5.5` si lo escribió Sonnet 5.5.
- Autor y committer son los de `git config` del repo. No cambies la identidad.

**Antes de subir:**

1. Corre las pruebas del repo y deben quedar en verde.
2. Revisa datos privados: rutas de usuario, correos, claves, nombres de clientes.
   Si hay duda, no subas y pregunta.
3. Si un hook de privacidad o de secretos falla, corrígelo. Nunca uses
   `--no-verify`.

**Regla de oro: al terminar, solo queda `main`.**

En cualquier proyecto, una rama vive lo que dura su tarea. Cuando la tarea está
terminada, la fusionas tú a `main` sin esperar a que te lo pidan:

1. Pruebas en verde y, si hay PR, su CI en verde. Si el CI falla, arréglalo; no
   fusiones en rojo.
2. Fusiona y borra la rama: `gh pr merge <n> --merge --delete-branch` (sin PR:
   `git checkout main && git merge --no-ff <rama> && git push && git branch -d <rama>
   && git push origin --delete <rama>`).
3. Vuelve a `main`, `git pull` y `git fetch --prune`.
4. Antes de cerrar, revisa que no queden otras ramas: borra las que ya están
   fusionadas en `main` (locales y remotas). Una rama **sin fusionar** que no es de
   esta tarea no la borres ni la fusiones a ciegas: dile al usuario qué contiene y
   pregunta.

Si algo impide fusionar (conflicto que no sabes resolver, CI roto por otra causa,
el usuario pidió revisar antes), dilo al cerrar y deja anotado en el handoff qué
rama queda abierta y por qué.

**Nunca:**

- `git push --force` a `main` ni a ramas compartidas.
- Subir claves, tokens o archivos `.env`.
- Subir contenido de memorias de proyecto ni datos de clientes a un repo público.
