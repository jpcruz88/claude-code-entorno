## Git: commit y push siempre

Cada cambio que hagas en un repositorio se **comitea y se sube** al terminar. No
esperes a que te lo pidan. Si el repo no tiene remoto, dilo y deja el commit local.

**Convenciones de commit (Conventional Commits, en español):**

- Línea de resumen: `tipo(ámbito): descripción`, en imperativo, máximo 72 caracteres.
  Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `ci`, `chore`. El ámbito es
  opcional (`fix(instalar): …`).
- Cuerpo opcional: explica el porqué, no el qué. Línea en blanco antes.
- Termina siempre con la línea `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- Autor y committer son los de `git config` del repo. No cambies la identidad.

**Antes de subir:**

1. Corre las pruebas del repo y deben quedar en verde.
2. Revisa datos privados: rutas de usuario, correos, claves, nombres de clientes.
   Si hay duda, no subas y pregunta.
3. Si un hook de privacidad o de secretos falla, corrígelo. Nunca uses
   `--no-verify`.

**Nunca:**

- `git push --force` a `main` ni a ramas compartidas.
- Subir claves, tokens o archivos `.env`.
- Subir contenido de memorias de proyecto ni datos de clientes a un repo público.
