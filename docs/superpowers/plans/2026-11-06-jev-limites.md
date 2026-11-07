# Jev con límites de uso: plan de implementación

> **Para agentes:** sub-skill obligatoria: superpowers:subagent-driven-development. Los pasos usan casillas (`- [ ]`).

**Meta:** Que cada subagente quede limitado por un tope de modelo y esfuerzo calculado con el uso real de la cuenta (ventana de 5 h y semana) en el momento de lanzarlo, y que el tablero muestre el ritmo semanal.

**Arquitectura:** La statusline escribe `~/.claude/jev/limites.json`. Un módulo puro, `jev_limites.py`, calcula el tope, y `guard-subagentes.py` lo aplica después de Jev. El mod muestra la fila de ritmo y las líneas `tope`.

**Spec:** `docs/superpowers/specs/2026-11-06-jev-limites-design.md`. Todas las reglas y números salen de ahí.

## Restricciones globales

- Repo público: nada de rutas de usuario ni claves. TDD siempre: prueba en rojo antes del código. La suite de Python se corre con `python3 -m unittest discover -s pruebas` y la del mod con `claude plugin test mods/tablero` (0 fail).
- Python 3.6 o más nuevo, sin dependencias. Un error propio nunca bloquea: si algo falla, no hay tope.
- El tope nunca hace `deny`. Solo baja el modelo o el esfuerzo con `updatedInput`. Fable sigue prohibido.
- Sin dato, o con un dato de más de 6 h, no hay tope.
- Commits en español, terminados en `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. Subagentes en haiku/medium.

## Foco de revisión

1. **Corte en el borde**: `reinicio` cae justo un jueves a las 23:00, o un viernes a las 00:30 (en este caso el corte es el jueves a las 23:00, media hora antes). Prueba en Tarea 1.
2. **Statusline sin `rate_limits`** (API key en vez de suscripción): no escribe nada y sigue dibujando. Prueba en Tarea 2.
3. **`limites.json` a medio escribir** (JSON roto): equivale a sin dato. Prueba en Tarea 1.
4. **Claude ya eligió menos que el tope**: no se toca nada y no se registra ninguna línea `tope`. Prueba en Tarea 3.
5. **Dos sesiones escriben a la vez**: la escritura atómica deja siempre un JSON válido. Prueba en Tarea 2.

---

### Tarea 1: Cálculo del tope

**Archivos:** crear `claude/hooks/jev_limites.py`; probar en `pruebas/test_jev_limites.py`.

**Interfaces que produce:**
- `leer_limites(home: str, ahora: float) -> dict | None`
- `calcular_tope(limites: dict | None, ahora: float, config: dict, tz=None) -> dict` con la forma `{"modelo_max": "haiku"|"sonnet"|"opus", "esfuerzo_max": "low"|"medium"|"high", "motivo": str | None, "semana": {"usado", "ritmo", "exceso"} | None}`. Sin tope, devuelve `opus` y `high`.
- `aplicar_tope(modelo: str, esfuerzo: str, tope: dict) -> (str, str)`. Respeta los ids completos (`claude-opus-5-5` → `sonnet`).
- `DEFAULTS_LIMITES` con los valores de la spec. `cargar_config` de `jev_client` no se toca: este módulo lee la clave `limites` del mismo `config.json`.

- [ ] **Paso 1.** Escribe estas pruebas. Ninguna depende de la hora real: `ahora` y `tz` son fijos.
  - martes 12:00 con 40 % de semana → libre
  - 52 % → sonnet
  - 60 % → haiku y medium
  - semana al 91 % antes del corte → haiku
  - viernes con 95 %, después del corte → libre; con 97 % → haiku
  - 5 h al 72 % → sonnet, con motivo `tope 5h 72% → sonnet`
  - 5 h al 90 % pero con reinicio en 10 min → libre
  - semana pide sonnet y 5 h pide haiku → haiku, con el motivo de 5 h
  - los dos bordes del foco 1
  - JSON roto, archivo ausente o dato de 7 h de antigüedad → sin tope
  - `aplicar_tope("claude-opus-5-5", "high", sonnet)` → `("sonnet", "high")`
  - `aplicar_tope("haiku", "low", haiku)` → sin cambio
- [ ] **Paso 2.** Corre las pruebas: tienen que fallar. **Paso 3.** Implementa. **Paso 4.** Pruebas en verde y suite completa. **Paso 5.** Commit `feat(jev): calcula el tope de modelo según el uso de la cuenta`.

### Tarea 2: La statusline guarda el uso

**Archivos:** modificar `claude/statusline.sh`; probar en `pruebas/test_statusline.py`.

- [ ] **Paso 1.** Escribe las pruebas:
  - Con el ejemplo de `pruebas/datos/statusline-ejemplo.json`, que trae `rate_limits` (si no lo trae, agrégaselo), se escribe `$HOME/.claude/jev/limites.json` con `actualizado`, `five_hour.usado/reinicio` y `seven_day.usado/reinicio`.
  - Sin `rate_limits`, no se crea el archivo y la salida de la statusline no cambia.
  - Si la carpeta no se puede escribir, la statusline dibuja igual.
  - Cinco statuslines en paralelo dejan siempre un JSON válido.
- [ ] **Paso 2.** Rojo. **Paso 3.** Implementa con `jq` (ya es dependencia), escribiendo en un temporal de la misma carpeta y con `mv -f`. Todo en segundo plano o con errores silenciados, sin retrasar el dibujo. **Paso 4.** Verde y suite completa. **Paso 5.** Commit `feat(statusline): guarda el uso de la cuenta para Jev`.

### Tarea 3: El guardián aplica el tope

**Archivos:** modificar `claude/hooks/guard-subagentes.py`; probar en `pruebas/test_guard_subagentes.py` (clase nueva `TopePorLimites`).

**Consume** la Tarea 1. El tope se aplica después de `_resolver` (la elección de Jev o de Claude) y antes de devolver la salida. Si el resultado cambia, la salida es `allow` con `updatedInput`, y se registra `{"tipo": "tope", "opcion": modelo final, "claude": lo que había, "aplicada": true, "motivo", "session_id", "descripcion" (≤60), "hora"}`. Si el esfuerzo también baja, se anota en `motivo`. Un fallo al leer o calcular equivale a sin tope.

- [ ] **Paso 1.** Escribe las pruebas (con HOME temporal y `limites.json` de prueba):
  - Jev elige opus, sharp, con la semana a +12 → `updatedInput.model == "sonnet"`, más una línea `tope`.
  - Claude pide opus a mano, sin clave de Jev, con 5 h al 90 % → haiku y medium.
  - Claude pide haiku y el tope es sonnet → salida vacía y ninguna línea `tope`.
  - Sin `limites.json` → igual que hoy.
  - Fable sigue bloqueado.
- [ ] **Pasos 2 a 5.** Rojo, implementar, verde y suite completa. Commit `feat(jev): aplica el tope de uso a cada subagente`.

### Tarea 4: Ritmo y topes en el tablero

**Archivos:** modificar `mods/tablero/hooks/jev-modelo.ts`, `hooks/panel-jev.tsx` y `hooks/register.tsx`; probar en `mods/tablero/tests/jev-modelo.test.ts` y `tests/diagrama.test.tsx`.

- `TipoDecision` suma `'tope'`. `lineaLog` de un tope devuelve `tope → sonnet · semana +12 pts` o `tope → haiku · 5h 90%`, según el motivo guardado. Los topes no entran en las filas de confianza de `resumenJev`.
- `ritmoSemana(limites, ahora, cfg)` en TS replica la fórmula de la spec con los mismos valores por defecto. La fila de la caja JEV es `semana 52% · ritmo 40% · +12` (o `−15`). El color depende del exceso: verde si es ≤ 5, ámbar de 5 a 15 y rojo por encima de 15. La fila no aparece si no hay dato o si el dato es viejo.
- `register.tsx` lee `limites.json` con la misma ruta base que `decisiones.jsonl`, en los mismos eventos.

- [ ] **Paso 1.** Escribe las pruebas: las líneas de log de tope, la fila de ritmo con los tres colores, sin dato no hay fila, y el mismo borde jueves/viernes de la Tarea 1 da el mismo ritmo en TS que en Python (casos fijos). **Pasos 2 a 5.** Rojo, implementar, verde. Commit `feat(tablero): muestra el ritmo semanal y los topes de Jev`.

### Tarea 5: Versión, documentación e instalación

- [ ] Tablero 0.3.1 en `plugin.json` y `.claude-plugin/marketplace.json`. Agrega una entrada al CHANGELOG del mod y al del repo. En el README del mod y en la guía, explica los topes, el archivo `limites.json` y la clave `limites` de la configuración.
- [ ] Corre la revisión de privacidad, la suite de Python y la del mod. Commit `docs(jev): documenta los topes por uso y sube el tablero a 0.3.1`.
