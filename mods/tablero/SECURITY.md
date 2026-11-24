# Security

Tablero no escribe archivos, no usa la red y no lanza procesos. Solo lee estos archivos, cada uno con un tope de 2 000 000 de caracteres (lo que pase del tope se trata como «sin dato»):

- `~/.claude/jev/decisiones.jsonl`: las decisiones de Jev de la sesión.
- `~/.claude/jev/limites.json`: el uso de la cuenta, para el tope.
- `~/.claude/al-dia/resultado.json`: lo que actualizó la revisión «Al día».
- `.git/HEAD` de la carpeta de trabajo, o el `HEAD` del gitdir de un worktree, para mostrar la rama.

Lo que se guarda en el estado de la sesión son resúmenes cortos de las llamadas a herramientas y de los textos de los subagentes. Todo texto de fuera pasa por `limpio()` en `hooks/core.ts` antes de guardarse o dibujarse: quita los controles de terminal y tapa los secretos que `redact()` reconoce.

La caja JEV es informativa, no una prueba. Sus decisiones vienen de `decisiones.jsonl`, un archivo que cualquier proceso del usuario puede escribir; el mod no comprueba que Jev haya decidido nada.

If you find a way it could leak data, for example a credential format that `redact()` in `hooks/core.ts` misses, please report it privately through GitHub's **Security → Report a vulnerability** on this repository rather than in a public issue.
