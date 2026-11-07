# Jev con límites de uso: tope de modelo según la ventana de 5 h y la semana

Fecha: 2026-11-06. Estado: aprobado por el usuario en el chat. Amplía `2026-11-06-tablero-jev-design.md`.

## Intención

El usuario paga una suscripción cara y quiere **gastarla casi entera**, pero sin quedarse sin uso antes del viernes. Su meta: llegar a la noche del jueves con entre 5 y 10 % libre de su límite semanal, y no toparse con el límite de 5 horas a mitad de una tarea. El ruteo automático de subagentes (Jev) debe respetarlo: cuando vaya gastando más rápido de la cuenta, bajar a modelos que consumen menos; cuando vaya por debajo, no frenar nada.

El usuario trabaja en varios proyectos a la vez. El uso es **de la cuenta**, no de la sesión, y cambia mientras trabaja. Por eso el tope se recalcula **en cada decisión**, con el dato más reciente que haya escrito cualquier sesión.

## Metas

1. Antes de lanzar cada subagente (`Agent`/`Task`), el guardián calcula un **tope** de modelo y esfuerzo con el uso actual de la cuenta, y lo aplica a la elección final. El tope vale tanto si eligió Jev como si eligió Claude.
2. Cada recorte queda en `decisiones.jsonl` (tipo `tope`) y se ve en el log del tablero.
3. El tablero muestra el ritmo semanal en la caja JEV: uso real frente al ritmo ideal y la diferencia.

## No metas

- Fable sigue prohibido siempre. No entra en el ruteo automático ni en sugerencias (el usuario puede revisarlo más adelante).
- No sube modelos para «gastar más». Ir por debajo del ritmo solo quita topes. El tablero lo avisa para que el usuario decida.
- No toca el modelo de la sesión principal.

## Anti-metas

- Recortar con un dato inventado o viejo. Sin dato, o con un dato de más de 6 horas, no hay tope.
- Bloquear el trabajo. El tope nunca hace `deny`: solo baja el modelo o el esfuerzo con `updatedInput`.

## Reglas (decididas con el usuario)

**Orden de modelos:** haiku < sonnet < opus. **Orden de esfuerzos:** low < medium < high < xhigh. `max` sigue bloqueado siempre.

**xhigh (aprobado por el usuario, para aprovechar la suscripción al máximo):**
- Jev tiene `xhigh` como cuarta opción de esfuerzo, con esta definición: «tareas muy difíciles: causa raíz poco clara, diseño delicado o razonamiento largo».
- El tope solo deja pasar `xhigh` en dos casos:
  - antes del corte, cuando `exceso ≤ −10` y la ventana de 5 h está bajo el 60 %;
  - después del corte, mientras `uso_semana < 97` y la ventana de 5 h está bajo el 60 %.
- En cualquier otro caso, `xhigh` baja a `high` o a lo que marque su escalón.
- Si no hay dato de uso, el esfuerzo máximo es `high`.
- El guardián acepta `xhigh` solo si el tope de ese momento lo permite. Si no lo permite, no bloquea: baja el esfuerzo con `updatedInput`.
- Referencia del usuario: su semana se reinicia el viernes a las 6:00, y el corte del jueves a las 23:00 deja unas 7 h de margen. El cálculo siempre usa `seven_day.resets_at`.

**Ritmo semanal.**
- `reinicio` = `seven_day.resets_at`.
- `inicio` = reinicio − 7 días.
- `corte` = el jueves a las 23:00 (hora local) más reciente que no pase de `reinicio`. Si `reinicio` cae justo un jueves a las 23:00, el corte coincide con él.
- `ritmo_ideal` = 90 × (ahora − inicio) / (corte − inicio), limitado entre 0 y 90.
- `exceso` = uso_semana − ritmo_ideal, en puntos porcentuales.

Tope antes del corte. Se recorta primero el esfuerzo, que es lo más barato, y después el modelo. El esfuerzo según la complejidad lo sigue eligiendo Jev; el tope solo lo limita.

| Condición | Modelo máximo | Esfuerzo máximo |
|---|---|---|
| exceso ≤ −10 (y 5 h < 60) | opus | xhigh |
| exceso ≤ 5 | opus | high |
| 5 < exceso ≤ 10 | opus | medium |
| 10 < exceso ≤ 15 | sonnet | high |
| 15 < exceso ≤ 25 | sonnet | medium |
| exceso > 25, o uso_semana ≥ 90 | haiku | medium |

Después del corte: libre (opus/xhigh si la ventana de 5 h está bajo el 60 %; si no, opus/high) mientras uso_semana < 97. Desde 97: haiku con esfuerzo medium.

**Ventana de 5 horas:**

| Condición | Modelo máximo | Esfuerzo máximo |
|---|---|---|
| uso < 60 | opus | high |
| 60 ≤ uso < 75 | opus | medium |
| 75 ≤ uso < 85 | sonnet | medium |
| uso ≥ 85 | haiku | medium |

Si `five_hour.resets_at` llega en menos de 15 minutos, esta ventana no pone tope.

**Combinación:** se toma el mínimo de los dos, por separado para el modelo y para el esfuerzo. Se anota el motivo del que manda: `tope semana +12 pts → sonnet` o `tope 5h 72% → sonnet`.

**Configurables** en `~/.claude/jev/config.json`, clave `limites`:
- `meta_corte`: 90
- `final`: 97
- `semana_escalones`: [[5, "opus", "high"], [10, "opus", "medium"], [15, "sonnet", "high"], [25, "sonnet", "medium"]] (por encima del último: haiku/medium)
- `h5_escalones`: [[60, "opus", "high"], [75, "opus", "medium"], [85, "sonnet", "medium"]] (desde 85: haiku/medium)
- `h5_gracia_min`: 15
- `corte_dia`: 3 (jueves, con lunes = 0)
- `corte_hora`: 23
- `max_antiguedad_h`: 6

## Arquitectura

- **Statusline** (`claude/statusline.sh`). En cada redibujo escribe, de forma atómica (temporal más `mv`), `~/.claude/jev/limites.json` con este contenido: `{"actualizado": <epoch s>, "five_hour": {"usado": n, "reinicio": epoch}, "seven_day": {"usado": n, "reinicio": epoch}}`. Solo lo escribe si llegan los datos de `rate_limits`. Cualquier fallo se ignora: la statusline nunca deja de dibujar. Todas las sesiones escriben el mismo archivo, y como el uso es de la cuenta, el último dato es el correcto.
- **`claude/hooks/jev_limites.py`** (nuevo, puro y sin red). Expone:
  - `leer_limites(home, ahora)`: devuelve el dict anterior, o `None` si falta, está roto o es viejo.
  - `calcular_tope(limites, ahora, config, tz)`: devuelve `{"modelo_max", "esfuerzo_max", "motivo", "semana": {"usado", "ritmo", "exceso"} | None}`.
- **`guard-subagentes.py`**. Después de resolver la elección (de Jev o de Claude), aplica el tope. Si el tope cambia algo, devuelve `allow` con `updatedInput` y registra una línea `tipo: "tope"` con `opcion` (lo que quedó), `claude` (lo que había), `aplicada: true` y `motivo`. Lee `limites.json` en cada llamada.
- **Mod tablero**:
  - `jev-modelo.ts` acepta `tipo: 'tope'`. Su `lineaLog` es `tope → sonnet · semana +12 pts`.
  - La caja JEV añade la fila `semana 52% · ritmo 40% · +12` (o `−15`, en verde) cuando hay dato. Lo lee de `limites.json` con `$.fs.read` y hace el mismo cálculo de ritmo en TS. Si no hay dato, la fila no aparece.

## Lo que decide el constructor

La forma exacta de las pruebas, los nombres internos y los colores de la fila de ritmo (verde por debajo, ámbar de 5 a 15, rojo por encima de 15).
