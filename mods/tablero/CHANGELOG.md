# Changelog

## 0.4.0 (tablero)

- New status band at the top of the map (100 columns or more): three rows of solid colour that say at a glance what the agent is doing. Cyan `T R A B A J A N D O` with a spinner, amber `T E   E S P E R A` when a permission is pending, red `D E T E N I D O` after 3 errors in a row (`UMBRAL_ERRORES`), grey `E N   E S P E R A` when idle. The amber and red bands blink; the idle one beats slowly.
- ESTADO moves to the top, full width, and gathers cost, last turn cost, the 5 h and 7 d limits (with time to reset and the weekly pace), permissions (pending, denied, mode), loops, error streak, edits of the turn, skills and MCP servers used.
- The map is reorganised: ASESOR and REGISTRO on the left, LEAD and JEV on the right, task cards below. The lead shows model, context bar, lines added and removed, and answers. JEV shows decisions, threshold, the last cap and its reason. The «EN CURSO» label is gone (the band says it). The header shows the git branch.
- The footer carries the version and «desarrollado por JP» on the right.
- Animation, all in text cells: the LEAD border breathes while it works, the spinner turns, packets cross the connectors, the idle band beats between ○ and ●.
- Heights: 32 rows with 0 or 1 task, 49 with 2 or more. The long «de vuelta al lead» line on the right edge is gone; its box stays at the bottom.
- Tests: `tests/situacion.test.ts` (rule, threshold and texts), `tests/mapa.test.ts` rewritten for the new layout, `tests/diagrama.test.tsx` covers the band and the footer on the mounted panel.

## 0.3.17 (tablero)

- The ESTADO box fits its lines: without limits it ends at row 17 instead of leaving three empty rows. The REGISTRO box has one row per entry (up to 4), so no blank rows under the entries.
- Tests: `tests/mapa.test.ts` covers the bottom border of both boxes.

## 0.3.16 (tablero)

- The JEV box leaves a free column between the label and the bar, so «qué esfuerzo» no longer touches `█`. The bar starts at column 49 and the text at 62.
- The threshold line in the JEV box is `| = umbral 0.80` in ASCII: `┆` came out wider in some terminals and pushed the box border.
- Tests: `tests/mapa.test.ts` covers the gap before the bar.

## 0.3.15 (tablero)

- With 0 or 1 task the map is compact: 28 rows instead of 42. The task card sits under the lead, in the right half, with its «de vuelta al lead» line. The registro and the status bar move up with it. With 0 tasks the card reads «SIN TAREAS · el lead espera trabajo».
- Fix: with 0 tasks the map no longer shows «de vuelta al lead».
- Tests: `tests/mapa.test.ts` covers the compact height, the 0-task text, the 1-task card and the status row.

## 0.3.14 (tablero)

- The main card shows the skills and MCP servers the session has used, with a count each: `habilidades caveman×2 · MCP tablero×3`. The line appears only once something has been used. The counts reset with `/clear`. They count from every loop, so a subagent's use counts too.
- Tests: `tests/usos.test.ts` covers the counting and the line's format.

## 0.3.13 (tablero)

- The panel header shows the mod version (`v0.3.13`) from 40 columns, right after the model name, so you can tell which copy is running. The constant `MOD_VERSION` in `hooks/core.ts` must match `.claude-plugin/plugin.json`.

## 0.3.12 (tablero)

- At rest, nothing moves. With no agent running and no permission pending, the pulse of the status row stays still, the dot of "en espera" in the main card is a fixed ○, and the map draws no packets along its lines, no pulse at the lead, and no spinner. The pulse and the packets come back when there is work.

## 0.3.11 (tablero)

- ESTADO shows bars for the 5 h and 7 d limits, as in the proposal; before there were only text lines.

## 0.3.10 (tablero)

- From 100 columns, `layout: auto` (the default) draws the layout of the proposal: a text grid of 100 by 42 with the advisor and the state on the left, the lead, the JEV box and the agents on the right, the return path to the lead, the REGISTRO box with the last decisions, and the status bar. The line from the advisor to the lead, the packets, the connectors and the agent glyphs animate with the clock (every 120 ms with `animacion` on; still with it off). The grid is built by `hooks/mapa.ts`, a pure function with tests.
- Below 100 columns the diagram of 0.3.9 is unchanged. `layout: diagrama` keeps that diagram at any width, `layout: mini` keeps the summary.
- The agent bars show steps taken, not progress: the mod does not know how many steps an agent will take. A finished agent shows a full bar.
- The grid shows real data: cost, permissions, loops, context and turn time in ESTADO; the JEV decisions; the last four decisions in REGISTRO. Text that does not fit its box is cut at the box edge.

## 0.3.9 (tablero)

- With `layout: auto` (the default), the diagram is drawn inline above the prompt too, from 66 columns. Before, the inline panel always showed the summary of at most 8 rows. Below 66 columns, or with `layout: mini`, the summary stays.
- The inline summary tests pin `layout: mini` explicitly, so they keep checking the summary.

## 0.3.8 (tablero)

- The line between the advisor and the lead is five columns wide and drawn on the lead's content row. While there is work in progress a packet (● with its tail • ·) crosses it from the advisor to the lead, and the arrow ▶ ends it. With `motion: off` it is a still line.
- The lead box is five columns narrower in the diagram, to make room for the line.

## 0.3.7 (tablero)

- Each agent row starts with an emoji for its state: a moon that turns while it works (each agent at its own phase, so they don't turn in step), ✅ when done, ❌ when failed, 🛑 when stopped. The walking crab in the bar is gone; the bar is drawn in the agent's colour.
- The lane list shows up to seven agents (it showed six). Older ones past that are counted as «+N anteriores».
- The card status line uses the same emoji. Emoji take two columns, so the lane label and bar are one column narrower.

## 0.3.6 (tablero)

- The default `panels` drops `receipt` (the «último turno» box): the diagram already shows the flow. `receipt` still works if you list it in `panels`.
- The main box's limit rows show the hour each window resets (`↻ vie 06:00`, `↻ hoy 21:10`), where the line has room for it.
- The header shows the session's elapsed time (`⏱ 14m`) and the local clock (`🕐 21:40`) at 56 columns or more.

- The session log (`registro de sesión`) and the session panel (`sesión`) are gone: the default `panels` is now `main,jev,architect,gate,agents,loops,receipt`. The context bar moves into the main card, under its speed line. The jev decisions no longer write lines to a log; they still show in the JEV box. The diagram layout loses its log box. The git branch no longer has a place in the pane (it was a row of the session panel); it is still read. Values saved under the old `log` and `sesion` keys are no longer read.

## 0.3.5 (tablero)

- La paleta por defecto es `neon` (colores fijos saturados para que las líneas de las cajas brillen). Antes el default era `theme`, así que sin `/config` no se veía. Para volver a los colores del tema, pon `palette` en `theme`; `pastel` sigue disponible.
- Las pruebas de ritmo y de la barra de contexto fijan `palette: theme`, porque comprueban nombres de color del tema.

## 0.3.4 (tablero)

- Latido en el panel SESIÓN: el punto de «en espera» de la tarjeta principal alterna entre ● y ○ con la animación encendida; con `animacion` apagada queda ○ fijo. Antes el latido de 0.3.3 se dibujaba en la banda sobre el prompt, que se quitó el 31-oct (commit 7f8b310), así que no se veía nada en reposo.
- Corrige la entrada 0.3.3: la banda sobre el prompt no se dibuja desde 7f8b310; el latido real es el de esta versión.

## 0.3.3 (tablero)

- Latido en la banda: con `animacion` encendida, el punto ● de la fila 1 pulsa también en reposo, sin subagentes ni permisos. Antes el pulso solo salía con actividad, así que en reposo la banda no se movía. Con `animacion` apagada no sale.
- El reloj de la banda redibuja al ritmo del pulso (unas 8 veces en 5 s en reposo), no en cada cuadro de 120 ms.

## 0.3.2 (tablero)

- Vista en diagrama: los conectores verticales (lead → caja JEV y la bajada a «delegar a subagentes») son módulos animados. Con `motion: while-active` un paquete ● con su cola • baja por la columna mientras hay subagentes en curso; en reposo queda una línea tenue. Con `motion: off` siguen siendo texto `│` y `▼`, como antes.
- El conector sale de `hooks/conector-v.ts` (función pura, con pruebas) y `hooks/conector-v.tsx` (módulo que dibuja cada cuadro).

## 0.3.1 (tablero)

- Caja JEV: una fila de ritmo semanal cuando hay dato de uso en `~/.claude/jev/limites.json`, por ejemplo `semana 52% · ritmo 40% · +12`. Muestra el uso de la semana, el ritmo ideal (90 % hacia el jueves a las 23:00) y la diferencia en puntos. Es verde hasta +5, ámbar de +5 a +15 y rojo por encima de +15. Añade `· xhigh ok` solo cuando el tope de Python devolvería `xhigh`: hay datos de las dos ventanas y la de 5 horas está vigente; la de 5 horas va bajo 60 % o está en gracia (reinicia en menos de 15 minutos); y, antes del corte, la semana va a −10 o menos del ritmo, o, después del corte, está bajo 97 %. Sin dato de la semana, o con un dato de más de 6 horas, la fila no aparece.
- El mod calcula el ritmo con la misma fórmula que `claude/hooks/jev_limites.py`, pero con los valores por defecto: no lee `config.json`. Si cambias `limites`, el tope real puede no coincidir con lo que muestra la fila. Solo lee `limites.json`; sigue sin usar red.
- El dato lo escribe la línea de estado de este repo (`claude/statusline.sh`): quien use otra línea de estado no tendrá topes ni fila de ritmo.
- El log muestra cada tope como `tope → sonnet · semana +12 pts`, o `tope → opus · semana +6 pts · esfuerzo medium` si solo bajó el esfuerzo.
- Los topes no cuentan en el total de decisiones de Jev: ni en la caja JEV ni en la barra. Son límites que ya se aplicaron, no elecciones de Jev.

## 0.3.0 (tablero)

- Vista en diagrama (`layout: diagrama`): el asesor a la izquierda, el lead y la caja JEV a la derecha, y debajo las tarjetas de los subagentes. Los paneles que el diagrama no tiene sitio (permisos, bucles, turno y sesión) siguen en columna debajo, sin perderse.
- `auto` elige el diagrama desde 66 columnas acopladas y lo usa en lugar de las dos columnas que tenía desde 110. Por debajo de 66, sigue la columna de siempre.
- Caja JEV y panel `jev`: muestran las decisiones que tomaron los hooks de Jev (`~/.claude/jev/decisiones.jsonl`). El mod solo lee ese archivo; no usa red.
- El log muestra una línea `jev` por cada decisión: qué eligió Jev, con qué confianza, y si se aplicó (`sharp → código`) o quedó para Claude (`split → claude`). Sin respuesta, dice `sin respuesta`.
- La barra sobre el prompt muestra `jev [N decisiones]` cuando hay decisiones registradas.
- Las tarjetas de subagente muestran la marca `jev ↑ sonnet` (o `jev ↓ haiku`) solo cuando Jev cambió el **modelo** que había elegido Claude. Un cambio de esfuerzo no pone marca, y si Jev coincidió con Claude, tampoco.
- El asesor de guardia siempre aparece en el diagrama, también sin consultas («de guardia», «aún sin consultas»); solo lo quita `panels` si no incluye `architect`.
- La etiqueta por defecto del asesor pasa de `ARQUITECTO` a `ASESOR`, que cabe en la columna del diagrama y coincide con la spec. Si la tenías configurada, no cambia; si usabas la de por defecto, verás `ASESOR`.

## 0.2.4 (tablero)

- Cada tarjeta de subagente tiene una barra de avance: llena según los pasos que reporta (`██████░░ 3/4`). Sin pasos, mientras camina, un bloque va y viene por la barra; con la animación apagada queda fijo.

## 0.2.3 (tablero)

- Los agentes integrados se muestran en español: `Explore` → «explorar», `general-purpose` → «propósito general», `Plan` → «plan», en la fila, la tarjeta y el panel expandido.
- Con la animación apagada, el reloj mira el estado cada segundo (antes cada 30 s): un agente que termina se ve al momento. Sigue sin redibujar si nada cambió.
- El tono de la barra de vida usa la vida redondeada, como la barra: 29.6 de vida es ámbar, no rojo.

## 0.2.2 (tablero)

- Textos en español: las etiquetas «mcp» y «skills» pasan a «MCP» y «habilidades», y «max_tokens» a «tope de tokens» (tarjeta y aviso).

## 0.2.1 (tablero)

- Quita la pestaña «Agentes»: ya no se abre sola al lanzar subagentes ni con `/agentes-info`. Los agentes viven en el Tablero (PR #7 y #8 en `main`).
- Sube la versión para que Claude Code reinstale el mod en lugar de seguir con la copia en caché 0.2.0.

## 0.2.0 (tablero)

- Panel «Agentes» y barra de progreso sobre el prompt, adaptados de savvy-progress (MIT): flujo con fase y tareas, subagentes en marcha, terminados y planificados, cangrejos animados por nivel, y el comando `/agentes-info`.
- Los subagentes `savvy-*` reciben al final de su encargo la instrucción de reportar pasos (`mcp__tablero__paso`). Cambia el encargo de esos subagentes.
- La barra de vida se dibuja con degradado continuo en la app de escritorio. En la terminal sigue en tres tonos.
- El reloj de los agentes se cancela al terminar la sesión.
- Sin el nivel `fable`, sin traducciones a inglés, ruso ni hebreo.

## 0.5.1

- The main box's `last req` line shows only the time to first token. Its tokens per second divided the reported output tokens, which include thinking, by the time from the first streamed piece, so when thinking wasn't streamed it read thousands of tokens a second. It is gone rather than wrong. ([#19](https://github.com/scasella/claude-flightdeck/pull/19))
- On the desktop app the connector between panels no longer jitters at its right end while work runs. It is drawn in the surface's monospaced face, where its dashes and moving dot are each one cell, and clipped at its width. In a terminal it looks the same. ([#19](https://github.com/scasella/claude-flightdeck/pull/19))

## 0.5.0

- The context gauge, its `tokens/window` and the status line's `ctx N%` measure against the compaction window when the session compacts in a smaller one than the model's, whether `autoCompactWindow` (global or per model) or Claude Code sets it. Auto-compaction runs a little before 100%, and the figure reads higher than Claude Code's own status-line percentage, which measures against the model's window. The window comes from a local `summary` breakdown (no request sent), read once per model. ([#9](https://github.com/scasella/claude-flightdeck/issues/9), thanks @DrWBlow)
- A subagent resumed with `SendMessage` runs again on its card: ◐ running from its next request, `resumed` in the log, and counted in the status line's `agents N/M`. Its clock still counts from the first spawn; the log's `done · …` times each run. A second spawn under the same id resumes the card rather than adding another. ([#8](https://github.com/scasella/claude-flightdeck/issues/8), thanks @momchilon; [#12](https://github.com/scasella/claude-flightdeck/pull/12), thanks @Alendro305)
- A subagent's turn start no longer logs its prompt as yours or resets the main turn's receipt.
- `paneColumns` sets the width the docked pane asks for (default 66, at least 40; Claude Code caps the dock at 45% of the terminal). ([#6](https://github.com/scasella/claude-flightdeck/issues/6), thanks @matheusmaais)
- The pane draws at its real width down to 24 columns, the narrowest dock Claude Code seats, instead of never narrower than 40, so a narrow desktop pane or terminal dock no longer has the right side of every box cut off. Below 40 columns the agents header, the lanes, other loops and the session log take shorter forms, and the gate's file, shell and other buttons wrap. From 40 columns up the pane draws as before.
- On the desktop app, lines of several colours stay on one line. They are rows of pieces a gap apart, as the session log's lines are, rather than nested Texts the desktop app wrapped; a piece that doesn't fit is left out, and the gate's totals fall back to numbers alone. In a terminal these lines read as before wherever they fit.
- On graphical surfaces (desktop, VS Code, mobile) the gate strip and the other rows of marks hold fewer marks, since a mark draws wider than a cell there, and still end on the newest; the legend keeps a row of air above the panels; the agents' time axis scales down to a narrow pane. ([#10](https://github.com/scasella/claude-flightdeck/pull/10), thanks @bhpdev1; also found in [#11](https://github.com/scasella/claude-flightdeck/pull/11) by @darrentmorgan)
- A draw that fails shows `draw failed (…)` in the pane instead of an empty box, and a surface module that faults, such as the cut-off `flightdeck: Client hooks/rail.tsx: …` line in the desktop app, is drawn as plain text on that surface while the rest keeps animating. ([#12](https://github.com/scasella/claude-flightdeck/pull/12), thanks @Alendro305; [#7](https://github.com/scasella/claude-flightdeck/issues/7), thanks @NathanAB)
- README: the `pluginConfigs` key is the plugin's id, `flightdeck@claude-flightdeck` when installed and `flightdeck` with `--plugin-dir`, and project settings aren't read ([#13](https://github.com/scasella/claude-flightdeck/issues/13), thanks @jangerhard). Troubleshooting notes that the VS Code extension may show no mod pane yet ([#5](https://github.com/scasella/claude-flightdeck/issues/5), thanks @jonathon-lawlor798). A statuslin.es badge ([#7](https://github.com/scasella/claude-flightdeck/issues/7)).
- CI runs `claude plugin validate`, the tests and `tsc` on every pull request and on `main`.

## 0.4.0

- The main box shows the time left until each rate-limit window resets (`5h ▰▱▱▱▱ 19% ↻3h10m`), from the `resetsAt` the session already reports. Below 56 columns the gauges stay as they were. ([#3](https://github.com/scasella/claude-flightdeck/pull/3), thanks @vihrea1337)
- The main box shows the last main-loop request's time to first token and decode speed (`last req  ttft 0.8s · 60 tok/s`), timed as its response streams past. ([#1](https://github.com/scasella/claude-flightdeck/issues/1))
- The session log has a one-row gap above it, in both layouts. ([#2](https://github.com/scasella/claude-flightdeck/issues/2))

## 0.3.2

- A background architect's advice is read from its `SubagentHandback` tool call, where the report actually arrives, with the hand-back text as a fallback. Bold markers no longer leak into the advice line.
- README: no longer promises that counters survive every update; a change to the state's shape may reset them once.

## 0.3.1

- The main box shows the model and effort as soon as a request starts, not after the first one finishes.
- Advice from a background architect agent (such as `fable-advisor`) now reaches the architect's `»` line; it arrives as a hand-back message, not as the agent's own answer.
- New README media showing the Flightdeck header; plainer wording about opening on start.
- More gate tests (24 in all).

## 0.3.0

First public release.

- Panels: main vitals (context, compactions, cost, rate limits), architect timeline, permission gate strip with per-family drill-down, agent cards and swimlanes, other loops, turn receipt, session log.
- Layouts: docked one- or two-column, and an 8-row inline summary for the main screen. Cards fall back to swimlanes when they don't fit.
- Theme colours by default, with a `pastel` palette option.
- Animated connectors and live clocks as surface modules, only while work flows.
- Works on the terminal, desktop app, VS Code and mobile surfaces.
- Config for the architect pattern, labels, panels, layout, card limit, motion, moments, palette, opening on start and the status line.
- `/clear` and `/flightdeck reset` start the pane fresh; reads tolerate missing or older fields.
