# Changelog

## 1.3.2 (tablero)

Textos que se entienden solos, sin conocer el mod.

- **Cabecera:** el modo caveman se dice en palabras llanas: «Respuestas cortas» (`full`), «Respuestas breves» (`lite`) o «Respuestas mínimas» (`ultra`). En paneles de menos de 44 columnas no sale.
- **Servicio:** el estado de status.claude.com dice de qué se trata: «Servicio de Claude: normal», «fallos parciales», «fallos graves», «caído» o «en mantenimiento».
- **Config:** «1 archivo de instrucciones · 10 reglas · 33 hooks · 9 conexiones MCP». Un `CLAUDE.md` del proyecto que solo importa `@AGENTS.md` cuenta como un solo archivo, no como dos.
- **Sesiones:** solo cuenta como abierta una sesión que escribió su registro en los últimos 30 s. Antes una sesión cerrada seguía como «1 más abierta» hasta 24 h. Las cerradas siguen contando para el gasto del día.

## 1.3.1 (tablero)

Arreglos de la revisión final de 1.3.0.

- **Statusline:** `thinking: false` se guarda como `false` (antes salía `null` y la fila Modelo no decía `thinking off`).
- **Sesiones:** una sesión que lleva más de 30 s sin escribir cuenta como inactiva. Una sesión cerrada con un permiso pendiente ya no sale como «Te espera» durante horas.
- **CI:** `gh pr checks` se lanza en cuanto aparece un PR y después como mucho una vez por minuto, aunque `gh` falle o el PR no tenga comprobaciones. Antes se lanzaba cada 10 s.
- **Teclas:** Sesiones se abre con `v`. La `s` ya era del grupo «shell» de Permisos.
- **Cache:** la fila sale siempre que la statusline mande datos de cache, también con la cache fría y sin dato de aciertos (`○ Fría`).
- **40 columnas:** Gasto abierto, su consejo y Sesiones abiertas caben a 40 columnas. La prueba mide ahora cada fila con sus Text anidados.
- **Fuentes:** la vuelta de las fuentes externas nunca lanza.

## 1.3.0 (tablero)

Todo el estado de la sesión en un solo sitio, sin datos repetidos. Absorbe tres mods y la statusline.

- **Absorbe `barra-plan`, `aduana-panel` y `caveman-badge`**, que salen del repo. La herramienta de planes pasa a llamarse `mcp__tablero__plan_progress` (mismo contrato) y sus reglas van en `prompt.compose` como sección `tablero:planes`. Aduana se lee cada 5 s, como antes. El modo caveman sale en la cabecera (`Caveman full`) en vez de en la línea de estado.
- **La statusline calla con el tablero activo** (`claude/statusline.sh`). Sigue escribiendo `~/.claude/jev/limites.json` y además deja en `~/.claude/tablero/linea/<sesión>.json` lo que solo ella recibe: nombre de la sesión, thinking, cache del prompt y PR.
- **Sin duplicados.** La cabecera deja el modelo a Sesión. Sesión ya no repite `bypassPermissions`, `agentes N/N` ni `permisos N`. La rama y la hora solo salen fuera de herdr (`HERDR_ENV`).
- **Textos.** Mayúscula inicial en etiquetas y estados. Cada estado lleva símbolo y palabra (`⠹ En curso`, `◆ Te espera`, `✓ Hecho`, `✗ Falló`). Una pregunta pendiente va debajo con `↳`. Nunca un `?` como símbolo.
- **Nuevo en Sesión:**
  - **Cache:** caliente o fría, cuenta atrás hasta que caduca (ámbar en el último minuto), aciertos y tokens leídos.
  - **Costo:** `$/h trabajando`.
  - **Hoy:** gasto del día frente a `presupuestoDiario`.
  - **Cupos:** «Al ritmo actual…».
  - **Proyecto:** con el nombre de la sesión.
  - **Git:** cambios, commits sin subir, PR y CI.
  - **Config:** cuántos CLAUDE.md, reglas, hooks y servidores MCP carga la sesión.
- **Cabecera:** el estado del servicio de Claude (`status.claude.com`).
- **Secciones nuevas.** Planes, Aduana (solo mientras corre), Gasto (lo que más contexto consume, plegada, tecla `g`) y Sesiones (las demás sesiones de la máquina y cuál te espera, plegada, tecla `v`).
- **Con el panel sin colocar**, el resumen de hasta 8 filas va sobre el prompt.
- **Reglas que se relajan:** el tablero ahora lanza `git` y `gh`, consulta la página de estado y escribe su archivo de sesión. Todo con topes de tiempo y apagable con la opción `extras`. Un fallo oculta su fila y nunca el panel.
- Opciones nuevas: `extras` y `presupuestoDiario`.

## 1.2.0 (tablero)

La vista por defecto es una lista limpia: secciones con título, sin cajas ni conectores.

- `layout: auto` dibuja una columna de secciones separadas por una fila en blanco. La sección **Sesión** pone una fila por dato: modelo (con esfuerzo y modo), contexto, costo y cada cupo, con barras `█░` del mismo ancho, el porcentaje alineado (`tabular`), el ritmo `⇡/⇣` y la hora de reinicio. El color solo marca el umbral (aviso 65 %, alerta 85 %).
- Cabecera de la lista en una línea: `TABLERO · modelo · ○ en espera` a la izquierda y versión, tiempo y hora atenuados a la derecha, con una línea fina debajo. Sin emoji ni leyenda de colores.
- El mapa de cajas pasa a ser una opción: `layout: mapa` (o `/tablero layout mapa`). `diagrama`, `compact`, `wide` y `mini` siguen igual. Sobre el prompt, `auto` usa el resumen de 8 filas.
- Corrige la entrada 1.1.0: allí se decía que el panel ya no dibujaba cajas, pero la vista por defecto (el mapa) las conservaba. Desde 1.2.0 la vista por defecto no tiene cajas.
- Pruebas nuevas en `tests/lista-defecto.test.tsx`. Las pruebas que miran el mapa fijan `layout: 'mapa'`.

Pendiente: estado del dibujo a `$.state`, el mapa con `Raster` y `$.ui.blit`, y `tabular` en los cronómetros de las demás distribuciones.

## 1.1.0 (tablero)

Segunda pasada del rediseño: menos marcos y la línea de ritmo del mapa con ⇡/⇣.

- El panel ya no dibuja cajas dentro de la caja exterior. Principal, asesor, permisos, JEV y la tarjeta vista son títulos con `weight` en color `subtle` (la cabecera de la principal conserva el color del tema). Las cajas de la distribución `diagrama` (con JEV) también salen sin marco.
- La línea de ritmo de ESTADO en el mapa pasa a la misma notación que el panel: `rojo ⇡61%` en lugar de `rojo +61 pts`; `⇣` si hay margen.
- `bold` sale de todos los textos del panel: se usa `weight` (`semibold` para lo que iba en negrita). El tipo `Span` de `linea.tsx` lleva `weight`.
- Pruebas nuevas: el panel no dibuja más de un marco en `diagrama` y `compact`; ningún texto dibujado lleva `bold`; `textoRitmoMapa` da `⇡`/`⇣` según el signo.

Pendiente, no entra en 1.1.0:
- Mapa en terminal (`mapa.ts`): sus cajas (ESTADO, LEAD, AL DÍA, REGISTRO) siguen con marco; son glifos dibujados en cuadrícula, así que quitarlos cambia la instantánea y las pruebas del mapa.
- Separación entre secciones con `gap` en la columna: hoy la separan los enlaces `▾` entre paneles, que un `gap` partiría. Falta decidir cómo.
- Barras de cupo y contexto como barra de Boxes o `Progress`: siguen en `▓░` / `▰▱` de texto.
- `tabular` en cronómetros y porcentajes.
- Estado del dibujo a `$.state` con contrato en `types/` (`register.tsx`, variables de módulo que dibujan).
- Mapa con `Raster` y `$.ui.blit`: no se toca en esta versión.

## 1.0.0 (tablero)

Rediseño visual: menos marcos, colores del tema y símbolos en lugar de emoji. Mismo contenido.

- Paleta por defecto `theme`, que sigue el tema de Claude Code. `neon` y `pastel` siguen en `/config`.
- Los estados son símbolos, no emoji: `✓` listo, `○` en cola o detenido, `✗` falló, y un giro de un carácter mientras un agente trabaja (un `●` quieto con la animación apagada). Los emoji ocupan dos columnas y desalineaban la lista de agentes y el mapa.
- Cupos y contexto: aviso desde 65 % (ámbar) y alerta desde 85 % (rojo). El cupo de 5 h y el de 7 d muestran su ritmo: `⇡N%` si se gasta más rápido que el tiempo de la ventana, `⇣N%` si hay margen. Con menos de 72 columnas el ritmo se oculta antes que partir la línea.
- Las tarjetas de subagentes no llevan marco; la tarjeta vista se distingue por el peso del título.
- La instantánea del mapa (`tests/instantaneas-mapa.ts`) se regeneró tras el cambio de glifos. Antes era la de 2281d5e.

Pendiente, no bloquea 1.0:
- Los marcos del resto de cajas (principal, asesor, permisos, JEV, bucles y mapa) siguen igual; se quitarán en una versión siguiente.
- El estado del dibujo sigue en variables de módulo; pasará a `$.state` con contrato en `types/`.
- El mapa en terminal sigue con un `Text` por tramo; `Raster` con `$.ui.blit` queda para más adelante.
- `bold` restante (pasa a `weight`) y `tabular` en cronómetros.

## 0.13.0 (tablero)

En reposo el panel deja de redibujarse cada segundo.

- Con nada trabajando y sin permisos pendientes, el tiempo de sesión de la cabecera y el «hace» del asesor van en minutos (`t 12m`, `hace 3m`) y la franja EN ESPERA queda quieta: el panel se redibuja como mucho una vez por minuto. Con trabajo en curso o con un permiso esperando, todo sigue por segundo. Medido en una sesión real: el panel abierto en reposo gastaba ~1,1 s de CPU por minuto; ahora ~0,38 s, frente a 0,30 s con el panel cerrado.
- Pruebas de conexión con el motor para `agent.offer` y `SubagentHandback`. `ui.fault` no tiene prueba de conexión porque el kit no expone ese evento; su lógica sí está probada.

## 0.12.0 (tablero)

El mapa respeta `panels` y lo que faltaba probar tiene prueba.

- En el mapa se pueden ocultar también `jev` (la caja JEV y su REGISTRO), `agents` (las tarjetas y su bus; el mapa pasa a la variante compacta) y `gate` (los datos de permisos de ESTADO). `main` siempre se ve. Las cajas ocultas no dejan conectores colgando.
- La lógica de `ui.fault`, `SubagentHandback` y `agent.offer` vive en funciones de `core.ts` con pruebas propias.
- La carrera del reloj tras cerrar el panel y la limpieza de `autoAsks` cuando una llamada lanza tienen prueba que falla con el código anterior.
- El redibujo por segundo en reposo se queda: componer el mapa cuesta de 0,08 a 0,14 ms y la franja en reposo cambia cada segundo.

## 0.11.0 (tablero)

Revisión de seguridad, correctitud y rendimiento.

- El texto que llega de fuera (comandos, descripciones y respuestas de subagentes, decisiones de Jev, «Al día», nombre de rama) pierde los caracteres de control antes de guardarse o dibujarse. Antes un ESC en la descripción de un subagente hacía que el motor rechazara el panel entero.
- La redacción de secretos cubre también `mysql -p<clave>`, `curl -u usuario:clave`, IDs de clave de AWS (`AKIA…`, `ASIA…`), el valor de `aws_secret_access_key`, claves de Google (`AIza…`) y `secret_key=`. Las respuestas, descripciones y consejos de subagentes pasan por la misma redacción.
- Las lecturas de `decisiones.jsonl`, `limites.json`, `al-dia/resultado.json` y `.git/HEAD` tienen tope de 2 MB. Un `gitdir:` relativo de un worktree se resuelve contra su carpeta. `SECURITY.md` y el README dicen qué archivos lee el mod.
- Una consulta al asesor interrumpida ya no queda «asesorando» para siempre: se cierra al abrir la sesión y al terminar el turno del lead (todas si fue con Esc; si no, solo las de la herramienta de servidor). Un asesor reanudado vuelve a «asesorando».
- El tope de 24 tarjetas quita primero las terminadas, nunca la de un subagente en curso.
- La vista mini y la línea de tiempo de escritorio respetan `panels`. En el mapa, que tiene cajas fijas, solo se ocultan `architect` y `aldia`; la descripción de la opción lo dice.
- Una tarjeta terminada o fallida sin pasos enseña su estado, no «iniciando…».
- `/clear` limpia también el contexto mostrado y las muestras de costo por minuto.
- `decisiones.jsonl` no se vuelve a parsear si no cambió desde la última lectura, y un dibujo tardío ya no reinicia el reloj después de cerrar el panel o la sesión.
- Una prueba del repo (`pruebas/test_tablero_topes.py`) compara los topes del panel con `DEFAULTS_LIMITES` de `jev_limites.py`.
- README: la fila de ritmo va en ámbar hasta +25 (no +15) y un agente detenido sale con 🛑.
- Refactor sin cambio visible: el mapa y piezas de línea salen de `register.tsx` a `mapa-vista.tsx`, `carriles-svg.tsx` y `linea.tsx`.

## 0.10.1 (tablero)

`TE ESPERA` solo sale cuando de verdad hay algo que responder.

- En modo automático, un permiso que decide el clasificador ya no cuenta como pendiente ni pone la franja en `TE ESPERA`: no hay diálogo que contestar. La llamada entra al recuento cuando termina (`auto` o denegado). El permiso que pide el hook de un plugin sigue contando: ese siempre lo responde la persona.
- El permiso pendiente de un subagente se retira cuando ese subagente termina. Antes se quedaba en `1 pend.` hasta abrir otra sesión.

## 0.10.0 (tablero)

Revisión: el panel deja de enseñar estados viejos, no se contradice y no redibuja cuando no hace falta.

- Con más de 8 subagentes, la lista del mapa enseña primero los que están en curso y después los más recientes; el resto va en `+N más`. Antes salían los 7 más viejos y los que trabajaban quedaban escondidos.
- `DETENIDO · el lead paró` solo sale cuando el turno del lead ya terminó; con tres fallos seguidos pero el lead aún trabajando, la franja sigue en `TRABAJANDO`.
- Al abrir Claude tras un cierre brusco o al reanudar una sesión, el turno y los subagentes que quedaron «en curso» se dan por detenidos.
- Un permiso pendiente que nadie va a responder ya no deja la franja en `TE ESPERA` para siempre: se retira al terminar el turno del lead o al abrir otra sesión.
- La fila de ritmo de la caja JEV toma el color del mismo tope que la línea `tope ahora`: las dos ya no se contradicen (verde si deja pasar Opus o Fable con esfuerzo alto, ámbar si recorta, rojo si baja a Haiku). Sin dato de uso, `tope ahora` va en ámbar, no en verde.
- Jev reconoce la familia Fable: su id completo y su alias son el mismo modelo, y la tarjeta dice `jev ↓ opus` cuando el tope la baja. El motivo `tope: fable → opus` se lee `tope → opus · pedía fable`.
- El panel solo se anima rápido con trabajo en curso (lead ocupado o subagentes corriendo). En reposo se redibuja como mucho una vez por segundo, para los relojes, y con el panel cerrado (o sin abrir con `openOnStart` apagado) no se redibuja.
- Con `animacion` apagada el mapa se dibuja quieto y completo: sin paquetes en las líneas, sin spinner girando y con los bordes encendidos; los relojes siguen avanzando cada segundo.
- AL DÍA ya no dice «ayer» para una hora por delante del reloj: dice hoy, ayer o la fecha.
- Un `limites.json` leído a medio escribir ya no borra el tope: se queda el último dato válido.
- `/tablero` ya no promete teclas que el mapa no tiene.
- La versión del pie (`tablero v0.10.0`) se comprueba contra `plugin.json` en las pruebas.
- Limpieza: se van la banda sobre el prompt, que ya no se dibujaba, y código sin uso. Los layouts `compact`, `wide`, `mini` y `diagrama` se quedan.

## 0.9.0 (tablero)

El tope de uso tiene un escalón más alto: Fable, solo con mucho margen.

- La línea `tope ahora` puede decir `fable xhigh · sin recorte`: la semana va 20 puntos o más por debajo del ritmo (o ya pasó el corte y está bajo 97 %) y la ventana de 5 h, si la cuenta la trae, va bajo 40 % o está en gracia.
- `opus xhigh` ya no dice `sin recorte`: dice qué ventana lo pone, por ejemplo `opus xhigh · semana −15 pts` o `opus xhigh · 5h 50%`.
- La fila de ritmo añade `· fable ok` cuando el tope dejaría pasar Fable; `· xhigh ok` queda para cuando solo llega a xhigh.
- Sin dato de la semana, o con la ventana de 5 h vencida, el máximo sigue siendo `opus high`.
- Réplica de `claude/hooks/jev_limites.py`, que es quien decide: en cada Agent o Task mira el uso de la cuenta y baja el modelo pedido. Ver «Fable con mucho margen» en el README.

## 0.8.2 (tablero)

La caja JEV dice el tope que rige ahora para los subagentes.

- Línea nueva `tope ahora: <modelo> <esfuerzo> · <causa>`, por ejemplo `tope ahora: opus xhigh · sin recorte` o `tope ahora: sonnet high · semana +12 pts`. Se calcula del uso de la cuenta (`~/.claude/jev/limites.json`) con las mismas reglas que `jev_limites.py`. Verde si deja pasar Opus con esfuerzo alto, ámbar si recorta, rojo si baja a Haiku. Sin dato de uso lo dice: `opus high · sin dato de uso`.
- Antes la caja mostraba el último tope aplicado, que podía ser de horas atrás y no decía nada si nunca hubo uno.
- Una cuenta sin ventana de 5 h decide solo con la semana: `xhigh ok` y `opus xhigh` ya no exigen ese dato. El mismo cambio va en `claude/hooks/jev_limites.py`, que antes bajaba siempre xhigh a high en esas cuentas.

## 0.8.1 (tablero)

Instalable desde un clon limpio.

- `marketplace.json` listaba tablero en 0.3.5 y con la descripción vieja de la banda; ahora usa la misma versión y descripción que `plugin.json`. Una prueba del repo (`pruebas/test_mods.py`) vigila que no vuelvan a separarse.
- El README dice cómo instalarlo y verlo funcionar.

## 0.8.0 (tablero)

Caja AL DÍA en el mapa: lo que la revisión diaria actualizó, justo bajo la franja de situación.

- La caja `AL DÍA · hoy 09:12` sale en la fila 5, con una fila en blanco debajo; todo lo demás baja y nada se tapa. Una fila por cosa: `↑` (verde) actualizada, `✗` (rojo) que no se pudo bajar y `…` (ámbar) pendiente, con el nombre (máximo 18), `antes → después`, el tipo (skill, plugin, MCP, programa) y `⚠ cambió texto` si cambiaron sus instrucciones.
- Máximo 6 filas; con más, 5 y `+N más`. Al pie: `N al día · reinicia Claude para usar lo nuevo`; si no hay ninguna fila `↑` (nada se actualizó), solo `N al día`.
- Por debajo de 66 columnas, el tipo y `⚠ cambió texto` se acortan a `⚠` antes de recortar el nombre.
- Lee `~/.claude/al-dia/resultado.json` al abrir la sesión y en cada relectura de Jev. Ausente, roto o de hace más de 24 h: no hay caja y el mapa sale igual que antes.
- Al abrir la sesión, el tablero ya lee las decisiones y los límites de Jev, así que JEV y el ritmo salen desde el primer cuadro.
- Panel nuevo `aldia` en la opción `panels`, activo por defecto. Quítalo de la lista para ocultar la caja.

## 0.7.0 (tablero)

El mapa se dibuja como la maqueta aprobada (`docs/tablero-maquetas/tablero-terminal.html`), a 100 columnas y apilado.

- ESTADO: barras de cupo `▓░` en magenta, «último turno», «bucles» siempre (también en 0) y la gráfica `costo/min ▁▂▃` con lo gastado en cada uno de los últimos 24 minutos. Skills y MCP se rotulan siempre (con `—` si no hay).
- JEV · decisiones: `umbral 0.80` y las tres últimas decisiones en filas `21:52 modelo → sonnet ▮▮▮▮▮▮▮▮▮▯ 0.91`, con el tope en ámbar. Los esfuerzos se dicen en español (`medio`, `alto`).
- REGISTRO: filas `hora · rol · texto` con el rol de color, la más nueva arriba, en una caja de cinco filas.
- LEAD: barra de contexto `▓░` en magenta y conector `▾` hacia JEV.
- Pie: `SIN TAREAS · el lead espera trabajo · subagentes 0/0` o `3 tareas · subagentes 1/3`.
- Cabecera y grises (etiquetas en gris medio, bordes en gris oscuro) como en la maqueta.
- Aún no está, por falta de datos: las filas «permisos» y «modelo» del asesor, y las líneas del lead y del asesor en el registro.

## 0.6.1 (tablero)

- Se borran 40 archivos `.js` viejos del 6-nov que quedaban en `hooks/` y `tests/` sin seguimiento en git. Se copiaban a la caché del plugin, y como los imports van sin extensión, el cargador podía tomar código antiguo en lugar de los `.ts` actuales.

## 0.6.0 (tablero)

Limpieza: fuera lo que nunca recibía datos y arreglos de valores que salían mal.

- ESTADO muestra el costo real de la sesión. Antes leía `u.cost?.usd`, un campo que no existe, y siempre decía `$0.00`.
- El contador `turno` del LEAD y de la franja solo corre mientras el lead trabaja. Antes seguía subiendo después de terminar el turno.
- Las tareas detenidas dicen «⛔ detenido» y las fallidas «❌ falló». Antes salían como «en cola» y «reintenta», y una fallida contaba como en curso.
- Las tareas sin un plan de pasos reportado muestran «N pasos», sin barra. Antes la barra salía siempre llena (`n/n`).
- La caja ASESOR solo aparece si hubo consultas al asesor, en el mapa, en el diagrama y en el pie. Sin asesor configurado se quedaba siempre «de guardia» y vacía. Ya no repite los permisos pendientes de ESTADO.
- «bucles» solo sale en ESTADO cuando hay alguno. «último turno» se llama ahora «costo turno», porque es un costo.
- El reloj del panel corre siempre. Antes dependía de la opción `banda`, y si se apagaba, el panel dejaba de redibujarse.
- Se quitan las opciones `banda` y `statusLine`, que ya no hacían nada.
- Se quita la copia de savvy-progress que llevaba el tablero: las herramientas `progreso` y `paso`, su banda sobre el prompt y su panel. Solo se activaba con agentes `savvy-*`, y el plugin savvy-progress ya hace lo mismo.
- Fuera el código sin uso: la banda vieja (`bandaFilas`, `bandaElemento`, `footerTexto`) y el resumen viejo (`resumenLineas`, `modoLabel`, `partirLinea`).

## 0.5.3 (tablero)

- The footer shows the right version: `MOD_VERSION` in `hooks/core.ts` was left at 0.5.0 in 0.5.1 and 0.5.2.

## 0.5.2 (tablero)

- In the stacked map (40 to 99 columns), AGENTES goes right under the status band, before ESTADO, when there are tasks. At the bottom of a 53-row map a short pane cut it off and only the first agent showed. Without tasks the order is unchanged.
- Tests: two new cases in `tests/mapa-responsivo.test.ts`.

## 0.5.1 (tablero)

- Jev's texts read without a glossary. The JEV box is titled `JEV · elige modelo y esfuerzo`; each row says how sure Jev was and what happened in its last decision: `97% seguro · lo cambió Jev`, `igual a Claude`, `lo eligió Jev` (Claude gave no choice) or `decide Claude` (Jev was under 80 %). The bottom line states the rule: `Jev cambia lo de Claude si está ≥80% seguro`. Gone: `sharp`, `split`, `umbral 0.80` and `p=0.97`.
- REGISTRO is titled `REGISTRO · decisiones de Jev` and each line is a sentence of 40 columns or less: `Jev cambió esfuerzo low→medium (88%)`, `Jev dejó modelo haiku (98%)`, `Jev no tocó esfuerzo low (solo 62%)`, `Jev decidió: parar y preguntar (85%)`, `Jev no respondió sobre modelo`. Model ids show as their family (`claude-haiku-5-5` → `haiku`).
- In the stacked map, a row whose long text doesn't fit drops «seguro» (`97% · lo cambió Jev`), and the rule line has a shorter form.
- Tests: `tests/jev-textos.test.ts`.

## 0.5.0 (tablero)

- The map is responsive. Docked beside the transcript, `auto` draws it from 40 columns and fits the pane's real width: from 100 columns, the two-column layout of 0.4.0; from 40 to 99, everything stacked at full width (header, status band, ESTADO, LEAD, JEV, ASESOR, REGISTRO, AGENTES, footer). Before, the map only showed at 100 columns or more, and the pane asks for 66 (Claude Code caps it at 45 % of the terminal), so most terminals kept the old diagram.
- In the stacked layout, ESTADO pieces wrap to the next row when they don't fit; bars shrink to the space left; long texts are cut before the box border; the band uses plain letters when the spaced title doesn't fit; the AGENTES title drops parts instead of cutting a word.
- Inline above the prompt the map is too tall: there `auto` keeps the diagram and the summary, as before. Below 40 columns, the old stacked column. `layout: diagrama` and `compact` keep their views.
- Tests: `tests/mapa-responsivo.test.ts` (widths 40 to 99, boxes never overrun their border, 100+ unchanged), `tests/diagrama.test.tsx` covers the stacked map on the mounted pane at 40, 66 and 99 columns. Tests of the old diagram now ask for `layout: diagrama`.

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
