# Tablero

Mod de Claude Code que dibuja sobre el prompt una banda en español con la carpeta actual, el modelo, el costo, el contexto, los subagentes, los permisos y el uso con su hora de reseteo, y deja una línea resumen en el footer.

Es de observación: no bloquea ni retrasa nada. Por lo demás no usa red ni procesos, pero sí tiene dos excepciones de archivo: lee `~/.claude/jev/decisiones.jsonl` para mostrar las decisiones de Jev (ver «Jev»), y la instrucción de reportar pasos que recibe cada subagente `savvy-*` (ver «Progreso y agentes»).

## Atribución

Derivado de [Flightdeck](https://github.com/scasella/claude-flightdeck), de Stephen Casella (scasella), con licencia MIT. El panel de progreso y de agentes está adaptado de [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress), de johnnyvizz, también MIT. Los avisos de copyright originales se conservan en `LICENSE`.

## Jev

Jev es un modelo de decisiones de TypeSafe que se consulta por la Decisions API de OpenRouter (modelo `typesafe/jev-1.14`). Responde preguntas cerradas: elige una opción de una lista y dice con qué confianza lo hace.

Jev responde tres preguntas, desde dos hooks de Python del repo:

- **Modelo y esfuerzo de un subagente** (`guard-subagentes.py`): cuando Claude lanza un subagente con `Agent` o `Task`, Jev propone el modelo (`haiku`, `sonnet` u `opus`) y el esfuerzo (`low`, `medium` o `high`). Solo si su confianza es de al menos 0,80 (umbral configurable) su elección reemplaza la de Claude. Si no, la decisión se registra y no cambia nada.
- **Reintento** (`jev-reintento.py`): si la misma herramienta falla dos veces seguidas con el mismo error, Jev sugiere reintentar, cambiar de enfoque o parar y preguntar. Su sugerencia llega a Claude como nota.

Las decisiones las toman esos hooks, no el mod. Cada decisión queda en `~/.claude/jev/decisiones.jsonl`, sin el encargo, y el archivo se recorta a sus últimas 2000 líneas.

**El mod solo lee ese archivo.** Tablero no llama a Jev ni a ninguna otra red: solo muestra lo que los hooks ya registraron. Lo que ves en la caja JEV, en el log (líneas `jev`), en la barra (`jev [N decisiones]`) y en las tarjetas (`jev ↑ sonnet`) sale de ese archivo. La fila de ritmo semanal de la caja sale de otro archivo, `~/.claude/jev/limites.json` (ver «Tope por uso de la cuenta»).

### Dónde poner la clave

Jev necesita una clave de OpenRouter. Nunca la pegues en el chat de Claude Code: quedaría en la transcripción. Hay dos sitios, en este orden:

1. **La variable `OPENROUTER_API_KEY`**, en tu perfil de shell (por ejemplo `~/.zshrc`), con una línea `export` que asigne tu clave a la variable `OPENROUTER_API_KEY`. La clave va escrita allí, no en el chat.
2. **El archivo `~/.claude/jev/clave`**, solo si la variable no está. El archivo se acepta únicamente con permisos `600` (solo tu usuario puede leerlo); con otros permisos se ignora sin avisar.

Para crear el archivo sin que la clave aparezca en pantalla ni en el historial, corre estos dos comandos en tu terminal:

```sh
mkdir -p -m 700 ~/.claude/jev
read -rs clave && printf '%s\n' "$clave" > ~/.claude/jev/clave && chmod 600 ~/.claude/jev/clave && unset clave
```

El primero crea la carpeta de Jev con permisos privados. El segundo pide la clave sin mostrarla mientras la escribes; pégala y pulsa Enter. Después revisa que el archivo quedó con permisos `600` con `ls -l ~/.claude/jev/clave`.

### Costo

La consulta cuesta 0,042 USD por millón de tokens de entrada. Con el encargo completo, eso son unos 8 centavos por cada mil decisiones, si cada encargo ronda los 2000 tokens. Un encargo largo (hasta 32 000 caracteres) cuesta hasta unas cuatro veces más. Cada subagente hace dos consultas, una de modelo y otra de esfuerzo.

### Sin clave, todo sigue igual

Si no hay clave, Jev no se consulta y la decisión queda como «sin respuesta» en el log. Pasa lo que eligió Claude. Lo mismo ocurre si Jev no responde, responde algo que no entiende, o si OpenRouter devuelve error por falta de saldo (402) o por límite de peticiones (429). Ningún fallo de Jev frena un subagente ni una herramienta.

### Tiempo

Cada subagente puede tardar hasta unos 2 segundos más, porque el guardián espera la respuesta de Jev antes de lanzarlo. El tiempo máximo por consulta es de 2 segundos y es configurable en `~/.claude/jev/config.json`.

### Tope por uso de la cuenta

Antes de lanzar un subagente, el guardián calcula un **tope** de modelo y de esfuerzo con el uso actual de tu cuenta, y lo aplica a la elección final, sea de Jev o de Claude. El tope solo baja el modelo o el esfuerzo; nunca bloquea un subagente.

El uso es **de la cuenta**, no de la sesión. Si tienes varios proyectos abiertos, todos usan el mismo dato, y el tope se recalcula en cada subagente.

**El archivo `~/.claude/jev/limites.json`.** La statusline lo escribe en cada redibujo, de forma atómica, con el uso y la hora de reinicio de la ventana de 5 horas y de la semana. Su forma es:

```text
{"actualizado": <epoch s>, "five_hour": {"usado": n, "reinicio": <epoch s>}, "seven_day": {"usado": n, "reinicio": <epoch s>}}
```

Sin el archivo, con JSON roto (por ejemplo, a medio escribir), o con un dato de más de 6 horas, no hay tope. Tampoco lo hay si la statusline no recibe datos de suscripción, como con clave de API. El tope nunca inventa un dato.

**Ritmo semanal.** Con la ventana de la semana:

- El ritmo ideal sube en línea recta desde 0 % al inicio de la semana hasta 90 % en el corte, que es el jueves a las 23:00 (hora local). Un reinicio que cae justo en ese momento hace coincidir el corte con él.
- El exceso es el uso de la semana menos el ritmo ideal, en puntos. Negativo significa que vas por debajo.

Antes del corte, el exceso marca el escalón:

| Exceso | Modelo máximo | Esfuerzo máximo |
|---|---|---|
| ≤ −10 | opus | xhigh |
| ≤ 5 | opus | high |
| ≤ 10 | opus | medium |
| ≤ 15 | sonnet | high |
| ≤ 25 | sonnet | medium |
| > 25, o uso ≥ 90 % | haiku | medium |

Después del corte, la semana no baja nada hasta llegar a 97 % de uso: queda opus con xhigh y decide la ventana de 5 horas. Desde 97 %, haiku con esfuerzo medium.

**Ventana de 5 horas.** El uso de la ventana marca el escalón:

| Uso | Modelo máximo | Esfuerzo máximo |
|---|---|---|
| < 60 % | opus | xhigh |
| 60 % a 75 % | opus | medium |
| 75 % a 85 % | sonnet | medium |
| ≥ 85 % | haiku | medium |

Si la ventana se reinicia en menos de 15 minutos, no pone ningún tope. Si su reinicio ya pasó, cuenta como sin dato.

**Combinación.** Se toma el menor modelo y el menor esfuerzo de las dos ventanas. El motivo que se anota es el de la ventana que baja el modelo, por ejemplo `tope semana +12 pts → sonnet` o `tope 5h 78% → sonnet`.

**`xhigh` con margen.** `xhigh` solo pasa en dos casos:

- Antes del corte, cuando la semana va al menos 10 puntos por debajo del ritmo y la ventana de 5 horas está bajo 60 %.
- Después del corte, mientras la semana esté bajo 97 % y la ventana de 5 horas bajo 60 %.

En cualquier otro caso, `xhigh` baja a `high` o a lo que marque su escalón. Si falta una de las dos ventanas, `xhigh` baja a `high`, porque `xhigh` exige conocer las dos. Sin ningún dato, el esfuerzo máximo es `high`. `max` sigue bloqueado siempre. Un Workflow con `xhigh` se bloquea, porque un Workflow no se puede bajar; el tope no lo toca.

**Qué queda registrado.** Cada recorte añade una línea `tope` a `~/.claude/jev/decisiones.jsonl`, con lo que quedó y lo que había. El log la muestra como `tope → sonnet · semana +12 pts`. Los topes no cuentan en el total de decisiones de Jev.

**Vista en la caja JEV.** Con dato, la caja muestra la fila `semana 52% · ritmo 40% · +12`: uso de la semana, ritmo ideal y diferencia. Verde hasta +5, ámbar de +5 a +15 y rojo por encima de +15. Con 10 puntos o más por debajo del ritmo añade `xhigh ok`. Sin dato, la fila no aparece.

**Configuración.** La clave `limites` de `~/.claude/jev/config.json` cambia los valores. Es opcional: sin ella, se usan los de `DEFAULTS_LIMITES` en `claude/hooks/jev_limites.py`. Si cambias una lista, reemplaza la lista entera. Ejemplo:

```json
{
  "limites": {
    "meta_corte": 90,
    "final": 97
  }
}
```

| Clave | Por defecto | Qué hace |
|---|---|---|
| `meta_corte` | `90` | Uso semanal que el ritmo pide tener al corte. |
| `final` | `97` | Uso semanal desde el que, después del corte, baja a haiku. |
| `semana_escalones` | `[[-10,"opus","xhigh"],[5,"opus","high"],[10,"opus","medium"],[15,"sonnet","high"],[25,"sonnet","medium"]]` | Escalones de la semana: umbral de exceso, modelo y esfuerzo. Por encima del último, haiku con medium. |
| `h5_escalones` | `[[60,"opus","xhigh"],[75,"opus","medium"],[85,"sonnet","medium"]]` | Escalones de la ventana de 5 horas: umbral de uso, modelo y esfuerzo. Desde el último, haiku con medium. |
| `h5_gracia_min` | `15` | Minutos antes del reinicio de 5 horas en que esa ventana ya no pone tope. |
| `corte_dia` | `3` | Día del corte, con lunes = 0 (3 es jueves). |
| `corte_hora` | `23` | Hora local del corte. |
| `max_antiguedad_h` | `6` | Horas máximas de antigüedad de `limites.json`. Con más, no hay tope. |

## La barra de vida

En el panel SESIÓN, una barra muestra la vida que te queda de contexto (`vida 50% ████████░░░░`).

- **Vida** = el contexto que te queda. La barra se vacía al usar contexto.
- **Color**: verde con vida alta (60 % o más), ámbar a media (de 30 a 59 %) y rojo cuando queda poca (menos de 30 %). En la terminal son tres tonos; en la app de escritorio la barra es un SVG con degradado continuo de rojo a verde.
- Sin lectura de contexto, la barra no se dibuja.

## Progreso y agentes (de savvy-progress)

- **Barra sobre el prompt**: el título del flujo, la fase, las tareas aceptadas frente a las planificadas, y un botón `×N` con el tamaño de la cuadrilla que abre el panel. Se muestra cuando la sesión principal reporta un flujo (`mcp__tablero__progreso`) o cuando arranca un subagente `savvy-*`.
- **Agentes**: los subagentes en marcha y terminados se ven como tarjetas dentro del panel «Tablero», con nivel, modelo, esfuerzo, progreso de pasos, contexto, costo estimado y tiempo.
- **Cangrejos**: cada subagente es un cangrejo que camina mientras trabaja. Cada nivel lleva un accesorio (`cuidadoso` gira una llave, `pesado` pasa la lupa, `medio` voltea la tortilla, `ligero` corre con bandera). En la app de escritorio, `prefers-reduced-motion` los deja quietos. En la terminal, la opción `animacion: false` fija el glifo de cada agente en marcha y hace que el reloj se redibuje cada 30 s.
- **Costos**: son estimados con la tabla de precios de `hooks/savvy-core.ts`; Claude Code reporta tokens, no dinero.

### Cambio de comportamiento: encargos de `savvy-*`

Cada subagente `savvy-*` que no traiga la instrucción recibe al final de su encargo una línea que le pide reportar sus pasos con `mcp__tablero__paso`. Sin esa línea, los trabajadores suelen omitir el reporte aunque la herramienta exista. Los demás subagentes no cambian. Si no usas `savvy-flow`, este cambio no afecta nada.

### Opciones


### Lo que no se portó

- Los niveles `fable` (el astronauta y su precio) no están: el mod no usa ese modelo. Un subagente `savvy-fable` cuenta como `otro`.
- Las traducciones a inglés, ruso y hebreo: el mod va solo en español, sin disposición de derecha a izquierda.
