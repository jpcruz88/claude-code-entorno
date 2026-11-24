# barra-plan

Mod de Claude Code que dibuja sobre el prompt una barra por cada plan de trabajo abierto: el estado, el título, una barra de avance, cuántos pasos van, cuál es el paso activo y cuánto lleva. Complementa a `tablero`.

```text
● Arreglar login  ███░░░░░░░░░  1/4  paso: Reproducir  2m 10s
? Migrar tablas   ████████░░░░  3/7  paso: Revisar    14s
  ¿Qué rama usar?
✓ Probar build · 5/5 · 1m 02s
```

Los colores salen del tema por estado: en curso, aviso para una decisión, error y hecho. El resto va atenuado, y el estado también lleva un símbolo (`●`, `?`, `✗`, `✓`), para que no dependa solo del color.

## Uso

```text
claude plugin install barra-plan@claude-code-entorno
```

Reinicia Claude una vez. Claude crea la barra con `mcp__barra-plan__plan_progress` y la mueve con llamadas cortas:

- `{id, title, stages:[{name, steps:[{title}]}]}` crea la barra; el primer paso queda activo.
- `{id, next:true}` marca el paso activo como hecho y activa el siguiente.
- `{id, done:[...], active:"..."}` marca pasos por título y mueve el foco.
- `{id, failed:"...", note}` marca un paso como fallido.
- `{id, state:"needs_input", note}` pide una decisión al usuario.

Un plan terminado se resume una línea y desaparece solo a los 30 segundos.

## Qué no hace

No suena, no usa la red y no lee archivos del sistema. Su estado vive en la sesión (`$.state`); no guarda nada entre sesiones.

## Pruebas

```text
claude plugin test mods/barra-plan
```
