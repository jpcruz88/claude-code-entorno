# Cambios

## 0.1.0

- Primera versión: una barra de progreso del plan sobre el prompt, una línea por plan abierto (glifo de estado, título, barra en octavos, avance, paso activo y tiempo). Los planes terminados se resumen una línea que caduca a los 30 s; a partir de tres, un «+N más».
- Herramienta `plan_progress` (`mcp__barra-plan__plan_progress`) con las instrucciones para el modelo en `prompt.compose`. Responde con una línea corta: `id: 2/5, running, active "…"`.
- Sustituye a `plan-progress`, que sale del repo.
