# Guía de uso: cómo trabajar bien con este entorno

El README explica cómo instalar. Esta guía explica cómo usar lo que quedó
instalado, qué hace cada pieza y qué esperar de ella.

## 1. Arranque de una sesión

- Abre Claude Code en la carpeta del proyecto (`cd proyecto && claude`).
- La sesión arranca con **Haiku** (ver §3). La línea de estado de abajo muestra
  modelo, carpeta, rama, contexto usado, costo y límites.
- Si aparece un aviso de `ctx-budget` (70 % u 85 % de contexto), conviene empezar
  una sesión nueva con un resumen en vez de seguir.

## 2. Qué hace cada pieza

| Pieza | Cuándo actúa | Qué esperar |
|---|---|---|
| Reglas (`~/.claude/rules/`) | Siempre, en todas las sesiones | Claude las lee al empezar. Son instrucciones, no garantías. |
| Hook `guard-kill.py` | Antes de cada comando de Bash o PowerShell | Bloquea matar procesos en masa por nombre. Mata solo por PID. |
| Mod `secret-guard` | Al escribir archivos o comandos | Bloquea secretos en claro y pregunta antes de leer archivos sensibles. |
| Mod `tdd-gate` | Al editar código de producción | Pregunta una vez por sesión si no se ha tocado una prueba. |
| Mod `spec-gate` | Al editar código de producción | Pregunta una vez por sesión si no hay una spec reciente. |
| Mod `guard-kill-visible` | Antes de comandos que matan procesos | Solo avisa; no bloquea. |
| Mod `ctx-budget` | Al cruzar 70 % y 85 % de contexto | Avisa para que resumas o cambies de sesión. |
| Mod `sound-notify` | Al terminar un turno largo o al pedir permiso | Suena un aviso. |
| Mod `caveman-badge` | Siempre | Muestra en la línea de estado el modo caveman. |
| Mod `tablero` | Siempre | Panel con costo, contexto, subagentes y permisos. |
| Hook `guard-subagentes.py` | Antes de cada Agent, Task o Workflow | Solo deja `haiku`, `sonnet` u `opus`, con esfuerzo `low`, `medium`, `high` o `xhigh`. Jev puede elegir el modelo y el esfuerzo, y el tope de uso de la cuenta puede bajarlos (§3). |
| Hook `jev-reintento.py` | Después de un fallo de herramienta | Al segundo fallo seguido con el mismo error, pregunta a Jev si reintentar, cambiar de enfoque o parar. Su sugerencia llega como nota. |
| Memoria persistente | Al empezar y al guardar un dato | Ver §5. |

Los mods de guardia (`secret-guard`, `tdd-gate`, `spec-gate`) son **avisos
configurables**, no permisos del sistema. Si un aviso no aplica a un caso concreto,
respóndelo y sigue. Si pasa todo el tiempo, revisa el README del mod.

## 3. Modelo

- **Por defecto: Haiku.** Está en `claude/settings.base.json` y en la regla
  `claude/rules/modelo.md`.
- Para otro modelo en una tarea, pídelo en ese mensaje («usa opus para esto») o usa
  `/model`. Vale solo para esa tarea.
- Fable no se usa por omisión; solo si lo pides de forma explícita.
- **Agentes y subagentes:** pueden usar `haiku`, `sonnet` u `opus`, con esfuerzo
  `low`, `medium`, `high` o `xhigh`. `xhigh` es para tareas muy difíciles (causa
  raíz poco clara, diseño delicado o razonamiento largo) y solo pasa si el tope de
  uso lo permite (ver «Tope por uso de la cuenta», más abajo). Fable y `max` se
  bloquean siempre. El hook `guard-subagentes.py` aplica esa regla a Agent, Task y
  Workflow. En un workflow, cada `agent()` debe fijar un `model` permitido, y ningún
  `effort` puede pasar de `high`: un `xhigh` en un workflow se bloquea, porque el tope
  no puede bajarlo. Jev no elige modelos dentro de los workflows.

### Jev: decisiones de modelo y de reintento

Jev es un modelo de decisiones de TypeSafe que se consulta por la Decisions API de
OpenRouter (`typesafe/jev-1.14`). Solo responde preguntas cerradas, con una opción
de una lista y una confianza.

- **Modelo y esfuerzo de un subagente.** Antes de lanzar un subagente con Agent o
  Task, `guard-subagentes.py` pregunta a Jev qué modelo y qué esfuerzo le tocan.
  Si la confianza de Jev llega a 0,80, su elección reemplaza la de Claude. Si no
  llega, la decisión se registra y no cambia nada.
- **Reintento.** Si la misma herramienta falla dos veces seguidas con el mismo error,
  `jev-reintento.py` pregunta a Jev si reintentar tal cual, cambiar de enfoque o
  parar y preguntar. Su respuesta llega a Claude como nota, no como orden.
- **Registro.** Cada decisión se agrega a `~/.claude/jev/decisiones.jsonl`, sin el
  encargo ni el texto del error. El archivo guarda solo las últimas 2000 líneas, y
  cada línea lleva el `session_id` de su sesión. El panel del mod `tablero` lee ese
  archivo; no hace llamadas de red.
- **Sin clave, sin Jev.** Jev usa la variable `OPENROUTER_API_KEY` o, si no existe, el
  archivo `~/.claude/jev/clave`, que solo se acepta con permisos 600. Sin clave, o si
  Jev no responde, la decisión queda como «sin respuesta» y pasa lo que eligió Claude.
  Cada subagente puede tardar hasta unos 2 segundos más por la consulta.

#### Configuración: `~/.claude/jev/config.json`

Es opcional. Si el archivo no existe o no es un objeto JSON válido, se usan los
valores por defecto, que están en `claude/hooks/jev_cliente.py`. Estas son las
claves principales:

| Clave | Por defecto | Qué hace |
|---|---|---|
| `umbral` | `0.80` | Confianza mínima para que la elección de Jev reemplace la de Claude. |
| `timeout` | `2.0` | Segundos máximos por consulta a Jev. |
| `modelo_jev` | `"typesafe/jev-1.14"` | Modelo de Jev que se pide a OpenRouter. |
| `definiciones` | ver `jev_cliente.py` | Texto que Jev recibe para cada opción de cada pregunta (`modelo`, `esfuerzo`, `reintento`). Cada pregunta que pongas aquí reemplaza por completo la definición por defecto de esa pregunta. |

Ejemplo, para subir el umbral y acortar el tiempo máximo:

```json
{
  "umbral": 0.9,
  "timeout": 1.5
}
```

### Tope por uso de la cuenta

Tu suscripción tiene dos límites de uso: el de 5 horas y el semanal. Antes de lanzar
cada subagente, el guardián `guard-subagentes.py` calcula un **tope** de modelo y de
esfuerzo con el uso actual de la cuenta, y lo aplica a la elección final, sea de Jev
o de Claude. Su objetivo es que gastes la suscripción casi entera sin quedarte sin
uso antes del viernes. El tope **solo baja** el modelo o el esfuerzo con
`updatedInput`; nunca bloquea un subagente.

El uso es **de la cuenta**, no de la sesión. Si tienes varios proyectos abiertos,
todos ven el mismo dato, y el tope se recalcula en cada subagente.

**El archivo `~/.claude/jev/limites.json`.** La línea de estado lo escribe en cada
redibujo, de forma atómica, con el uso y la hora de reinicio de la ventana de 5 horas
y de la semana. Sin el archivo, con JSON roto, o con un dato de más de 6 horas, no
hay tope. Tampoco lo hay si la línea de estado no recibe datos de suscripción, como
ocurre con una clave de API. Un dato que falta nunca se inventa.

**Ritmo semanal.** El ritmo ideal sube en línea recta desde 0 % al inicio de la
semana hasta 90 % en el corte, que es el jueves a las 23:00 (hora local). El exceso
es tu uso de la semana menos ese ritmo, en puntos. Antes del corte, el exceso marca
el escalón:

| Exceso | Modelo máximo | Esfuerzo máximo |
|---|---|---|
| ≤ −10 | opus | xhigh |
| ≤ 5 | opus | high |
| ≤ 10 | opus | medium |
| ≤ 15 | sonnet | high |
| ≤ 25 | sonnet | medium |
| > 25, o uso ≥ 90 % | haiku | medium |

Después del corte, la semana no baja nada hasta 97 % de uso: queda opus con xhigh y
decide la ventana de 5 horas. Desde 97 %, haiku con esfuerzo medium.

**Ventana de 5 horas.** El uso de la ventana marca el escalón:

| Uso | Modelo máximo | Esfuerzo máximo |
|---|---|---|
| < 60 % | opus | xhigh |
| 60 % a 75 % | opus | medium |
| 75 % a 85 % | sonnet | medium |
| ≥ 85 % | haiku | medium |

Si la ventana se reinicia en menos de 15 minutos, no pone ningún tope. Si su reinicio
ya pasó, cuenta como sin dato.

**Combinación.** Se toman el menor modelo y el menor esfuerzo de las dos ventanas.
El motivo que se anota es el de la ventana que baja el modelo, por ejemplo
`tope semana +12 pts → sonnet` o `tope 5h 78% → sonnet`.

**`xhigh`.** Solo pasa si se cumplen todas estas condiciones: hay datos de las dos
ventanas y la de 5 horas sigue vigente; la ventana de 5 horas va bajo 60 % o está en
gracia (se reinicia en menos de 15 minutos); y, antes del corte, la semana va al
menos 10 puntos por debajo del ritmo, o, después del corte, está bajo 97 %. En otro
caso baja a `high` o a lo que marque su escalón. Si falta una de las dos ventanas,
baja a `high`, porque necesita conocer las dos. Sin ningún dato, el esfuerzo máximo
es `high`. `max` sigue bloqueado.

**Qué ves.** Cada recorte añade una línea `tope` a `~/.claude/jev/decisiones.jsonl`,
con lo que quedó y lo que había, y el tablero la muestra en el log como
`tope → sonnet · semana +12 pts`. Los topes no cuentan en el total de decisiones de
Jev. Con dato, la caja JEV del tablero muestra además la fila de ritmo, por ejemplo
`semana 52% · ritmo 40% · +12`: verde hasta +5, ámbar de +5 a +15 y rojo por encima.
Añade `xhigh ok` solo cuando el tope devolvería `xhigh`, con la regla exacta de
arriba (las dos ventanas con dato, la de 5 horas bajo 60 % o en gracia, y la semana a
−10 o menos antes del corte, o bajo 97 % después). Si vas por debajo del ritmo, el
tope solo quita límites: no sube modelos para gastar más. Eso lo decides tú.

La fila del tablero usa los valores por defecto y no lee `config.json`. Si cambias
`limites`, el tope real puede no coincidir con lo que muestra la fila.

El dato lo escribe la línea de estado de este repo (`claude/statusline.sh`). Quien use
otra línea de estado no tendrá topes.

**Configuración.** La clave `limites` de `~/.claude/jev/config.json` cambia los
valores. Es opcional: sin ella se usan los de `DEFAULTS_LIMITES` en
`claude/hooks/jev_limites.py`. Si cambias una lista de escalones, reemplaza la lista
entera. Ejemplo:

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
| `semana_escalones` | `[[-10,"opus","xhigh"],[5,"opus","high"],[10,"opus","medium"],[15,"sonnet","high"],[25,"sonnet","medium"]]` | Escalones de la semana: umbral de exceso, modelo y esfuerzo. |
| `h5_escalones` | `[[60,"opus","xhigh"],[75,"opus","medium"],[85,"sonnet","medium"]]` | Escalones de la ventana de 5 horas: umbral de uso, modelo y esfuerzo. |
| `h5_gracia_min` | `15` | Minutos antes del reinicio de 5 horas en que esa ventana no pone tope. |
| `corte_dia` | `3` | Día del corte, con lunes = 0 (3 es jueves). |
| `corte_hora` | `23` | Hora local del corte. |
| `max_antiguedad_h` | `6` | Horas máximas de antigüedad de `limites.json`. |

`corte_dia` y `corte_hora` deben caer poco antes de tu reinicio semanal. Si el corte
queda lejos de ese reinicio, el ritmo ideal deja de coincidir con tu semana real.

## 4. Flujo recomendado para cambios de código

1. **Pide el objetivo, no la solución.** Di qué debe pasar y cómo se verá.
2. **Prueba primero.** La regla TDD pide una prueba que falle antes del cambio. Si
   el proyecto no tiene pruebas, pide montar lo mínimo antes de tocar el código.
3. **Verifica con evidencia.** No aceptes «ya quedó» sin la salida de las pruebas.
4. **Subagentes solo para tareas independientes** (búsquedas amplias, revisiones).
   Cada subagente cuesta; no los uses para cosas que caben en una respuesta.
5. **Commit y push siempre al terminar un cambio.** Las convenciones de mensaje
   están en `claude/rules/git.md`.

## 5. Memoria persistente

- Vive en `~/.claude/projects/<proyecto>/memory/`, con un índice `MEMORY.md`.
- Sirve para lo que no se deduce del código: preferencias, decisiones y contexto
  de proyectos. No sirve para guardar código ni historial de git.
- Si Claude guarda algo que no debe, bórralo del archivo; es texto plano.
- El contenido no va al repo público. Se guarda en tu repo privado `memoria-maestra`,
  que el hook `memoria-maestra.py` sincroniza al iniciar y al terminar cada sesión.

## 6. Skills

- Una skill se activa cuando Claude ve que la tarea encaja con su descripción. No
  se activa en todas las conversaciones sobre el tema.
- Si quieres que algo siempre siga un formato (por ejemplo, commits), ponlo en una
  regla, no solo en la skill.
- Las skills de terceros no están auditadas. Revísalas antes de instalarlas (ver
  `SECURITY.md`).

## 7. Comandos útiles dentro de Claude Code

| Comando | Para qué |
|---|---|
| `/model` | Cambiar de modelo para la sesión. |
| `/plugin` | Ver plugins instalados y su estado. |
| `/mcp` | Ver servidores MCP conectados (`context7`, `codebase-memory-mcp`). |
| `/hooks` | Ver qué hooks están activos y en qué eventos. |
| `/memory` | Ver y editar los archivos de memoria. |
| `/help` | Lista de comandos disponibles. |

## 8. Cuando algo falla

- **Un MCP marca error:** revisa que la variable de entorno (por ejemplo
  `CONTEXT7_API_KEY`) esté definida en tu terminal y reinicia Claude Code.
- **Un hook bloquea algo que sí quieres:** lee el mensaje; dice qué regla lo
  disparó. Pide el cambio explícito o ajusta el hook en el repo.
- **Un mod no carga:** `claude plugin validate mods/<nombre>` dice qué falta.
- **La configuración local no coincide con el repo:** `./exportar.sh` muestra las
  diferencias sin escribir nada.
