# Tablero con Jev: hallazgos del prototipo (Tarea 0)

Fecha: 2026-11-06. Rama: `feat/tablero-jev`. Prototipo desechable: no contiene código de producto ni pruebas.

Este documento resuelve las incógnitas que la spec dejó abiertas antes de escribir código. Cada dato indica si está **confirmado** (documentación oficial, código fuente leído o prueba real en este equipo) o **inferido**.

## Resumen

| Paso | Resultado |
| --- | --- |
| 1. Formato de la Decisions API | Confirmado con la documentación oficial de OpenRouter. Sin llamada real: falta la clave. |
| 2. `updatedInput` sobre `model` de `Agent` | **Sí.** Probado: el subagente arrancó con `claude-sonnet-5-5` aunque Claude pidió `haiku`. `effort` no se pudo verificar. |
| 3. Evento de fallo | `PostToolUseFailure` existe en Claude Code 2.1.319 y se dispara con un error de Bash. `PostToolUse` no se dispara en ese caso. |
| 4. Lectura de la carpeta personal | `$.fs.read` usa la ruta tal cual si es absoluta. La carpeta personal sale de `$.env.get("HOME")`. No se confirmó que `~` se expanda. |
| 5. `jev-router` contra `jev-1.14` | **Pendiente de clave.** Modelo por defecto provisional: `typesafe/jev-1.14`. |

## Paso 1: formato de la Decisions API

**Confirmado (documentación oficial de OpenRouter, consultada el 2026-11-06):**

- Endpoint: `POST https://openrouter.ai/api/alpha/decisions`. Está fuera de `/api/v1`. Las cabeceras son `Authorization: Bearer <clave>` y `Content-Type: application/json`.
- Otro endpoint, `POST /api/v1/systemone`, existe para el SDK de TypeSafe. No se usa.
- Cuerpo de la petición: `model` (obligatorio), `state` (obligatorio: cadena, objeto o arreglo) y `questions` (obligatorio, objeto). Opcionales: `session_id` (máximo 256 caracteres, no se envía al proveedor), `user` (máximo 256), `provider`, `trace`, `assets`.
- Pregunta `choice`: `type: "choice"`, `instructions` (texto), `criteria` (**objeto** de etiqueta → definición; obligatorio). Las etiquetas van en snake_case.
- Pregunta `noul`: `type: "noul"`, `instructions`, `criteria` opcional con las claves `true` y `false`.
- Pregunta `score`: `type: "score"`, `instructions`, `criteria` (**arreglo** ordenado; el índice 0 es el nivel más bajo; obligatorio).
- Enviar `criteria` de `score` como objeto, o el de `choice` como arreglo, devuelve `400`.
- Respuesta `choice`: `answers.<pregunta>` con `type: "choice"`, `choice` (etiqueta elegida), `confidence` (número) y `probabilities` (objeto etiqueta → probabilidad).
- Respuesta `noul`: `noul` (probabilidad de sí, de 0 a 1).
- Respuesta `score`: `score` (posición ponderada, por ejemplo 1.99), `probabilities` (clave índice), `confidence` y `legend`.
- Bloque `usage`: `input_tokens`, `output_tokens` y `cost` (en USD; la salida es gratis). El `cost` es lo que se registra.
- Códigos de error documentados: `400` (parámetros inválidos), `401` (sin autenticación), `402` (créditos insuficientes), `403`, `404`, `413` (carga demasiado grande), `429` (límite de tasa). `429` y `5xx` se reintentan (así lo hace el código de referencia).
- Modelos: `typesafe/jev-1.14` (recomendado por OpenRouter), `~typesafe/jev-latest` (alias del más nuevo) y `typesafe/jev-1.13` (sigue disponible). Los tres cuestan 0,042 USD por millón de tokens de entrada. Contexto: 262.144 tokens.
- Requisito de texto largo: OpenRouter indica que las peticiones con más de unos 32.000 bytes de texto usan un modo de contexto largo, que el propio proveedor describe como más lento y menos preciso.
- Jev no devuelve texto ni razonamiento. Solo respuestas tipadas.

**Código fuente de referencia (`charlesdove977/claude-x-jev`, licencia MIT, rama `main`):** `skill/scripts/jev.py` usa la misma URL, el mismo cuerpo (`model`, `state`, `questions`) y los mismos campos de respuesta (`choice`, `confidence`, `probabilities`, `noul`, `score`, `usage.cost`). Reintenta `429` y `5xx` con espera exponencial. Lee la clave de `OPENROUTER_API_KEY`. Usa `typesafe/jev-1.13` como valor por defecto.

**Ejemplo de petición** (tomado de la documentación oficial; **no es una llamada real** porque no hay clave):

```bash
curl https://openrouter.ai/api/alpha/decisions \
  -H "Authorization: Bearer sk-or-…" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "typesafe/jev-1.14",
    "state": {
      "customer_tier": "enterprise",
      "ticket": "My checkout page shows a blank screen after I click Pay."
    },
    "questions": {
      "team": {
        "type": "choice",
        "instructions": "Which team should own this ticket?",
        "criteria": {
          "payments": "Checkout, billing, or payment processing issues.",
          "frontend": "Rendering, layout, or browser compatibility issues.",
          "account": "Login, permissions, or profile issues."
        }
      }
    }
  }'
```

**Ejemplo de respuesta** (de la documentación oficial):

```json
{
  "answers": {
    "team": {
      "type": "choice",
      "choice": "payments",
      "confidence": 0.75,
      "probabilities": { "account": 0, "frontend": 0.16, "payments": 0.84 }
    }
  },
  "model": "typesafe/jev-1.13-20260917",
  "provider": "TypeSafe",
  "usage": { "cost": 0.000019992, "input_tokens": 476, "output_tokens": 70 }
}
```

**Consecuencia para la spec (importante):** en este ejemplo, la probabilidad de la opción elegida es 0,84, pero `confidence` es 0,75. Según la documentación de primitivas, `confidence` mide cuánto se concentra la distribución, no la probabilidad de la opción elegida. La spec dice que el tablero muestra `p=` con la confianza. Para no mostrar un dato distinto del que se llama `p`, hay que decidir cuál se muestra y etiquetarlo. Además, el umbral sharp de 0,80 se compara con `confidence`, como dice la spec.

**Pendiente:** una llamada real con la clave del usuario, para confirmar el `cost` y la forma exacta de la respuesta con `typesafe/jev-1.14`.

## Paso 2: `updatedInput` sobre `model` de `Agent`

**Prueba (Claude Code 2.1.319, `claude -p` en una carpeta temporal):**

- Hook `PreToolUse` con matcher `Agent`. Devolvió `hookSpecificOutput` con `hookEventName: "PreToolUse"`, `permissionDecision: "allow"` y `updatedInput` igual al de entrada, pero con `model: "sonnet"`.
- Claude pidió `model: "haiku"` y `effort: "medium"`.
- Resultado: el mensaje del subagente trae `model: "claude-sonnet-5-5"` con el `parent_tool_use_id` de la llamada `Agent`. **El subagente arrancó con Sonnet.** El `tool_use` que se ve en el flujo sigue mostrando `haiku`, porque es la entrada original.
- El guardián global (`~/.claude/hooks/guard-subagentes.py`) no bloqueó la llamada. Eso es coherente con que vea la entrada original (`haiku`) y no la reescrita (`sonnet`), porque si viera `sonnet` la habría denegado. Es una inferencia a partir de un único caso.
- El subagente se lanzó en segundo plano («Async agent launched»).

**Veredicto del paso 2: sí** (`updatedInput` cambia `model`).

**No probado:**

- `effort`. No se encontró ningún campo observable en el flujo que muestre el esfuerzo del subagente. Hay que decidirlo con una prueba indirecta o asumirlo.
- El caso inverso: Claude pide `sonnet` y Jev baja a `haiku`. Según la inferencia anterior, el guardián vería `sonnet` y denegaría. Es probable, pero no está probado.

**Consecuencia para el diseño:** con el guardián actual, Jev puede **subir** un subagente pedido como `haiku` (a `sonnet` u `opus`), pero no puede **bajar** uno que Claude pidió como `sonnet` u `opus`. Además, la regla del usuario (`~/.claude/rules/modelo.md`) dice que todo subagente usa Haiku. Subir a Sonnet contradice esa regla, así que la Tarea 1 tiene que cambiar el guardián o la regla. El usuario debe decidirlo.

## Paso 3: evento de fallo

- Versión instalada: `claude --version` devuelve `2.1.319 (Claude Code)`.
- `PostToolUseFailure` existe en el binario instalado (aparece en sus cadenas de texto).
- **Prueba:** un hook `PostToolUseFailure` con matcher `Bash` se disparó cuando `cat ./no_existe.txt` falló con código 1. Un hook `PostToolUse` con el mismo matcher no se disparó en ese caso.
- Campos recibidos (confirmados en la prueba y en la documentación de hooks):
  - `session_id`, `transcript_path`, `cwd`, `permission_mode`, `prompt_id`, `effort` (`{"level": "medium"}`), `hook_event_name`.
  - `tool_name` (`"Bash"`), `tool_input` (objeto), `tool_use_id`.
  - `error` (cadena: `"Exit code 1\ncat: …: No such file or directory"`).
  - `is_interrupt` (booleano) y `duration_ms` (número).
- Notas de la documentación: no se dispara si la herramienta fue rechazada antes de ejecutarse (nombre desconocido, validación de esquema o denegación de permiso). Una denegación de permiso dispara `PermissionDenied`.
- Salida útil del hook: `hookSpecificOutput` con `hookEventName: "PostToolUseFailure"` y `additionalContext`, que se añade al contexto de Claude.

**Veredicto del paso 3:** `PostToolUseFailure` existe. Se usa en lugar de `PostToolUse`.

## Paso 4: lectura de la carpeta personal desde el mod

- **`$.fs.read(path)`**: según los tipos del motor, «una ruta absoluta se usa tal como está; una relativa va bajo el directorio de trabajo de la sesión». Rechaza si el archivo no existe o pesa más de 4 MiB. El código existente usa `.catch(() => null)` para ese caso.
- **Confirmado en el código del propio mod:** `mods/tablero/hooks/register.tsx` (función `leerRama`) lee `${dir}/.git/HEAD` con `$.fs.read`, donde `dir` sale de `$.session.cwd()`. Es decir, rutas absolutas construidas a partir del cwd ya funcionan en producción.
- **`~` no está documentado** como expandido. Hay que asumir que **no** se expande y usar una ruta absoluta.
- **Carpeta personal:** `await $.env.get("HOME")` devuelve la variable o `undefined` (el nombre debe ser un literal de cadena). Con ella, la ruta es `${home}/.claude/jev/decisiones.jsonl`. Alternativas descartadas: `$.session.cwd()` (es la carpeta del proyecto, no la personal) y `userConfig` (pensado para opciones del mod, no para rutas del sistema).
- **No probado:** que `$.fs.read` acepte una ruta fuera del directorio de trabajo sin restricciones. La documentación dice que «dónde puede ir» lo decide un hook de `fs.*`. Hay que comprobarlo en la Tarea 5 con un mod real.

**Veredicto del paso 4:** usar `$.env.get("HOME")` y una ruta absoluta. No hace falta `userConfig`.

## Paso 5: `jev-router` contra `jev-1.14` (pendiente de clave)

No se ejecutó. Faltan la clave de OpenRouter y los diez encargos de prueba. La clave la pone el usuario en su terminal, no en el chat.

- **Modelo por defecto provisional:** `typesafe/jev-1.14`. Es el que OpenRouter recomienda y el alias `~typesafe/jev-latest` apunta a él. Cuesta lo mismo que `jev-1.13`.
- **Motivo:** la documentación oficial indica que `jev-1.14` es el actual. `jev-router` no aparece en la lista de modelos de decisiones (`output_modalities=decisions`). Su página de documentación habla de un router que elige modelo y esfuerzo por petición, que es otro uso distinto del de este plan. Hay que confirmarlo antes de compararlo.
- **Pendiente:** comparar precisión, latencia y costo con diez encargos (5 mecánicos, 3 de funcionalidad, 2 de causa raíz poco clara) y fijar el modelo definitivo. Mientras tanto, la configuración usa `typesafe/jev-1.14`.

## Hallazgos adicionales que afectan al plan

1. **`confidence` no es la probabilidad de la opción elegida** (ver paso 1). El tablero debe decidir qué muestra como `p=` y etiquetarlo bien.
2. **Texto largo y el límite de 2 s.** OpenRouter dice que más de unos 32.000 bytes de texto activan un modo de contexto largo, más lento y menos preciso. El tope de 200.000 caracteres de la Tarea 2 entra en ese modo y puede superar los 2 s de tiempo máximo. Conviene bajar el tope o medir la latencia real.
3. **Choice y score usan formas distintas de `criteria`.** Un error de forma devuelve `400`. El código debe construir cada pregunta con la forma correcta.
4. **`session_id` del cuerpo.** Es un campo documentado (máximo 256 caracteres) que sirve para agrupar peticiones por sesión. El plan puede usarlo en lugar de inventar un campo propio.
5. **Guardián y regla de Haiku.** Ver paso 2: Jev no puede bajar subagentes pedidos como no-Haiku, y subir a Sonnet contradice la regla del usuario.
6. **Ejecución de `exportar.sh`.** Con `--aplicar` regenera el repo desde la configuración real de esta Mac y reescribe archivos. Este prototipo solo lo ejecuta en modo de solo lectura (sin argumentos), que muestra las diferencias sin escribir.

## Limpieza

Las carpetas temporales creadas para las pruebas (una para el hook de `updatedInput`, otra para el de `PostToolUseFailure`, y las de descarga de documentación) se borran al terminar. Las claves no aparecen en ningún archivo del repo.
