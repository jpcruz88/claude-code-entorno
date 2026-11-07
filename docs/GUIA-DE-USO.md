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
| Hook `guard-subagentes.py` | Antes de cada Agent, Task o Workflow | Solo deja `haiku`, `sonnet` u `opus`, con esfuerzo `low`, `medium` o `high`. Jev puede elegir el modelo y el esfuerzo (§3). |
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
  `low`, `medium` o `high`. Fable, `xhigh` y `max` se bloquean. El hook
  `guard-subagentes.py` aplica esa regla a Agent, Task y Workflow. En un workflow,
  cada `agent()` debe fijar un `model` permitido, y ningún `effort` puede pasar de
  `high`. Jev no elige modelos dentro de los workflows.

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
