# Tablero con Jev: elegir modelo y esfuerzo de cada subagente

Fecha: 2026-11-06. Estado: borrador para aprobar.

## Intención

El usuario quiere que sus subagentes usen el modelo y el esfuerzo justos para cada tarea: ni gastar tokens de más ni elegir un modelo equivocado. Un modelo de decisiones barato y rápido, Jev, decide de verdad y el tablero muestra cada decisión. La pantalla de referencia es la captura del usuario: un lead arriba, un asesor Opus a la izquierda, una capa de decisiones «JEV · fork layer» con sus puntajes, las tarjetas de subagentes en abanico, la vuelta al lead, el session log y una barra de estado abajo.

Jev (TypeSafe, en OpenRouter, `typesafe/jev-1.13`) no escribe texto. Recibe un texto y un conjunto fijo de opciones, y devuelve la opción elegida, una probabilidad por opción y una confianza. Tarda unos 0,3 s y cuesta una fracción de centavo por decisión.

## Metas

1. **Ruteo de subagentes.** Antes de que arranque un subagente (herramienta `Agent`/`Task`), Jev elige el modelo (`haiku`, `sonnet`, `opus`) y el esfuerzo (`low`, `medium`, `high`) a partir de la descripción y el encargo. Puede subir o bajar lo que eligió Claude.
   - **sharp** (confianza ≥ 0,80): el hook reescribe `model` y `effort` antes de que arranque. Se aplica en código, sin preguntar a Claude.
   - **split** (confianza < 0,80): se respeta lo que eligió Claude y queda anotado.
2. **Reintentar o parar.** Cuando una herramienta o un subagente falla con el mismo error dos veces seguidas, Jev elige entre `reintentar`, `cambiar de enfoque` y `parar y preguntar`. La decisión le llega a Claude como nota (contexto adicional). En sharp, la nota es una instrucción; en split, una sugerencia.
3. **El tablero se ve como la captura** (ver «Pantalla»), con datos reales.

## No metas

- No se usa Fable nunca, ni como opción de Jev ni en ningún otro lugar.
- Jev no lee ni escribe código y no decide qué archivo tocar. La fila «which file» de la captura se sustituye por «qué modelo» (decisión del autor del diseño).
- No se toca el modelo de la sesión principal: el tablero muestra el que esté en uso.

## Anti-metas (sería un fracaso aunque funcione)

- **Números inventados.** Todo puntaje, conteo o costo que muestre el tablero sale de una respuesta real de Jev o de un evento real de la sesión. Nada de «tokens ahorrados» estimados.
- **Que Jev frene el trabajo.** Si no hay clave, se acaba el saldo, OpenRouter tarda más de 2 s o la respuesta no se entiende, se deja pasar lo que eligió Claude y se anota `jev sin respuesta`. Un error propio nunca bloquea.
- **Fugas.** La clave nunca entra al repo (que es público), ni al chat, ni a los registros, ni al tablero.

## Restricciones

- El repo `claude-code-entorno` es **público**. Nada de rutas de usuario, clientes ni datos personales en código, pruebas o documentos. Antes de cada commit se corre `./exportar.sh` (pruebas, gitleaks y revisión de privacidad).
- TDD en todo cambio de comportamiento. Las pruebas de Python se corren con `python3 -m unittest discover -s pruebas`, y las del mod con las que ya usa `mods/tablero/tests`.
- Python 3.6 o más nuevo, sin dependencias externas (como los guardianes actuales).
- Los subagentes que se lancen para construir esto usan Haiku con esfuerzo medio (regla vigente del usuario).

## Lo que decidió el usuario

- Jev **decide de verdad**, no es solo decorado. El usuario pone su clave de OpenRouter.
- Jev **puede subir un subagente a Sonnet u Opus** cuando la tarea lo pida. Por eso cambian la regla y el guardián:
  - `claude/rules/modelo.md`: los subagentes pueden usar Haiku, Sonnet u Opus con esfuerzo `low`, `medium` o `high`. El modelo y el esfuerzo siguen siendo obligatorios y explícitos. Fable sigue prohibido.
  - `claude/hooks/guard-subagentes.py`: deja pasar haiku, sonnet y opus con esos esfuerzos, y bloquea `xhigh`, `max` y Fable (el límite en `high` es decisión del autor del diseño). Hay que actualizar sus pruebas.
- El objetivo es optimizar los subagentes: tokens y elección de modelo.
- **A Jev se le envía el encargo completo** del subagente, junto con su descripción, para ganar precisión. El usuario acepta que ese texto salga hacia OpenRouter aunque incluya rutas o datos de clientes. Aun así, el encargo nunca se escribe en `decisiones.jsonl` ni en el tablero; solo viaja en la petición.

## Arquitectura

```
Claude lanza Agent ─▶ hook PreToolUse jev-ruteo.py ─▶ OpenRouter (Jev)
                              │   sharp: updatedInput con model/effort
                              │   split: sin cambios
                              ▼
                    ~/.claude/jev/decisiones.jsonl  (una línea por decisión)
                              ▲
Falla repetida ─▶ hook jev-reintento.py ──┘   + nota a Claude (additionalContext)

mod tablero ─▶ lee decisiones.jsonl con $.fs.read ─▶ caja JEV, session log, barra
```

- **Las llamadas de red las hacen los hooks de Python**, no el mod. El tablero conserva su promesa de no usar red ni procesos. Ahora lee un archivo más (`decisiones.jsonl`), y el README lo dice.
- `jev-ruteo.py` corre como hook `PreToolUse` sobre `Agent|Task`. Para reescribir, devuelve `permissionDecision: "allow"` con `updatedInput`.
- **Orden con `guard-subagentes.py`:** el constructor debe verificar cómo combina Claude Code varios hooks PreToolUse con `updatedInput`, y si el guardián ve la entrada original o la reescrita. Si no se puede garantizar el orden, lo más simple es que la lógica de Jev viva dentro del mismo `guard-subagentes.py`: primero decide Jev y después se valida el resultado.
- `jev-reintento.py` corre en el evento de fallo de herramienta (`PostToolUseFailure`, si existe en la versión instalada; si no, `PostToolUse` mirando el error). Guarda los últimos errores en `~/.claude/jev/estado.json` para detectar «mismo error ×2».
- **Clave:** se lee de la variable de entorno `OPENROUTER_API_KEY` y, si no está, del archivo `~/.claude/jev/clave` con permisos 600. Si el archivo tiene permisos más abiertos, se avisa y no se usa. El instalador nunca la pide por chat; el README explica cómo ponerla.
- **Proveedor: OpenRouter** (aprobado por el usuario). Es la vía más barata: 0,042 USD por millón de tokens de entrada y salida gratis, unos 8 centavos cada mil decisiones con el encargo completo. Jev no tiene pesos públicos, así que no hay opción local. Según guías de terceros, Jev se llama por la **Decisions API** de OpenRouter (`/api/alpha/decisions`), no por chat completions; el constructor lo confirma en la documentación oficial.
- **Modelo:** en el prototipo se comparan `typesafe/jev-router` (pensado para rutear tareas a modelos) y `typesafe/jev-1.14` con los mismos encargos de prueba, por precisión, latencia y costo reportado. Se queda el mejor, y queda configurable.
- **Formato de la petición a Jev:** el constructor lo toma de la documentación de OpenRouter para `typesafe/jev-1.13` (o del código de `claude-x-jev`, MIT, como referencia). No se adivina. Las preguntas son de tipo `choice`, con etiquetas y definiciones fijas para cada opción. Las definiciones de los modelos describen para qué sirve cada uno (Haiku: mecánico, búsquedas, ediciones claras; Sonnet: funcionalidad estándar; Opus: causa raíz poco clara, diseño delicado), y son ajustables en un archivo de configuración.
- **Cada línea de `decisiones.jsonl`** guarda: hora, tipo (`modelo`, `esfuerzo`, `reintento`), opción elegida, confianza, sharp/split, lo que había elegido Claude, si se aplicó, la latencia y el costo que reporte OpenRouter. No guarda el texto del encargo, solo la descripción corta del subagente, recortada a 60 caracteres.
- **Umbral sharp** de 0,80 y tiempo máximo de 2 s, configurables (decisión del autor del diseño). Se compara contra el campo de confianza que devuelva Jev; si la respuesta no trae uno aparte, se usa la probabilidad de la opción elegida. Es lo que el tablero muestra como `p=` (decisión del autor del diseño; confirmar en la documentación de Jev).
- **Si `updatedInput` no puede cambiar `model`/`effort` de `Agent`**, cosa que hay que probar primero con un prototipo, sharp pasa a `deny` con un motivo del tipo «relanza con model=sonnet effort=high». Es el mismo mecanismo que ya usa el guardián. Cuesta una vuelta más de Claude, pero la decisión se sigue aplicando (decisión del autor del diseño).
- **Por sesión:** cada línea de `decisiones.jsonl` lleva el `session_id` que recibe el hook, y el tablero solo muestra y cuenta las de la sesión actual. El archivo se recorta a sus últimas 2000 líneas (decisión del autor del diseño).
- **«Mismo error ×2»:** dos fallos seguidos de la misma herramienta con el mismo texto de error normalizado (sin rutas, números ni marcas de tiempo, primeros 200 caracteres). Un éxito de esa herramienta reinicia la cuenta (decisión del autor del diseño).

## Pantalla (mod tablero)

Disposición en diagrama, como la captura, cuando el panel tiene 66 columnas o más. Si es más angosto, se usa la disposición apilada de hoy. Es un valor nuevo de `layout`, `diagrama`, que `auto` elige desde 66 columnas. El panel nuevo tiene el id `jev` en la lista `panels` (decisión del autor del diseño).

Boceto (la captura del usuario no se sube al repo):

```
 ■ lead   ■ enjambre   ■ jev   ■ asesor
┌ ASESOR ──────┐       ┌ Lead · sesión principal ┐
│ de guardia   │······▶│ effort ▮▮▮▮ high        │
│ último consejo│       └───────────┬─────────────┘
│ consultas  2 │       ┌ JEV · decisiones   1,382┐
│ tokens 213k  │       │ qué modelo   ███▌ 0.94 sharp
│              │       │ qué esfuerzo ███  0.86 sharp
│              │       │ reintentar   ██▌  0.64 split
│              │       └───────────┬─────────────┘
│              │       delegar a subagentes
│              │     ┌──────┬──────┴──────┬──────┐
│              │   [tarjeta] [tarjeta]  [tarjeta]
│              │     └──────┴──────┬──────┴──────┘
│              │       ┌ de vuelta al lead ──────┐
└──────────────┘       │ revisar y verificar     │
                       └─────────────────────────┘
┌ session log ─────────────────────────────────────┐
barra: subagentes [3/3] · asesor [asesorando] · jev [N decisiones]
```

- **Leyenda** arriba: un color por modelo (lead, enjambre, jev, asesor).
- **Caja del lead:** modelo real de la sesión, esfuerzo y estado.
- **Columna del asesor** a la izquierda: es el panel `architect` actual (de guardia/asesorando, consultas, tokens, último consejo cuando sea visible). Si el asesor es la herramienta de servidor, su texto llega cifrado y no se muestra; se cuentan y se miden las consultas.
- **Caja JEV · capa de decisiones:** número total de decisiones, y una fila por tipo (`qué modelo`, `qué esfuerzo`, `reintentar o parar`) con barra de confianza media reciente, valor y sharp/split, más la leyenda `sharp → se aplica en código · split → decide Claude`. Todo sale de `decisiones.jsonl`.
- **Abanico:** línea «delegar a subagentes» con conectores hacia las tarjetas. Cada tarjeta muestra el título, el modelo real (el que quedó tras Jev), la barra de avance existente y el estado. Si Jev cambió el modelo, aparece una marca pequeña (p. ej. `jev ↑ sonnet`).
- **Vuelta al lead:** caja «de vuelta al lead · revisar y verificar» cuando terminan los subagentes.
- **Session log:** líneas `jev` con la decisión, `p=0,86` y `sharp → código` o `split → claude`.
- **Barra de estado:** se agrega `jev [N decisiones]` a lo que ya muestra.

## Lo que se deja al constructor

- Detalles de dibujo (caracteres de conectores, colores exactos, animación del punto que viaja), siguiendo el estilo actual del mod.
- Nombres de archivos internos y estructura de módulos.
- Cómo se instala: agregar los hooks en `claude/` y en los instaladores (`instalar.sh` e `instalar.ps1`, que conserva BOM UTF-8 y CRLF), igual que los guardianes existentes.
- La versión del mod sube a 0.3.0, con entrada en el CHANGELOG.
