# Tablero 1.3.0 unificado: diseño

Fecha: 2026-11-24. Estado: aprobado por el usuario con la maqueta
`docs/maquetas/tablero-unificado.html` (versión 3).

## Objetivo

Que todo lo que la pantalla dice de la sesión viva en un solo sitio, el mod
`tablero`, sin datos repetidos, en español y con mayúscula inicial. Hoy el
modelo, el contexto, el costo y los cupos salen dos o tres veces (cabecera del
tablero, sección Sesión, statusline), la rama y la hora tres veces (herdr,
tablero, statusline), y hay tres franjas sueltas encima del prompt
(`barra-plan`, `aduana-panel`, `caveman-badge`).

## Qué cambia

1. **`tablero` absorbe tres mods**, que se borran del repo y del marketplace:
   - `barra-plan`: la herramienta pasa a llamarse `mcp__tablero__plan_progress`,
     con el mismo esquema, y las mismas reglas en `prompt.compose`. Sus planes
     se dibujan en la sección **Planes**.
   - `aduana-panel`: lee `~/.cache/detector-humo/en-curso.json` igual que hoy.
     Sección **Aduana**, solo mientras corren pruebas (2 min sin cambios = se va;
     terminada, 10 min).
   - `caveman-badge`: el modo se muestra en la cabecera como `Caveman full`;
     se deja de usar `$.ui.status`.
2. **La statusline (`claude/statusline.sh`) deja de imprimir** cuando
   `tablero@claude-code-entorno` está activo en `enabledPlugins`. Sigue
   escribiendo `~/.claude/jev/limites.json` y además escribe
   `~/.claude/tablero/linea/<session_id>.json` (atómico) con lo que solo ella
   recibe: `session_name`, `thinking`, `prompt_cache` (`warm`, `ttl`,
   `expires_at`, `hit_ratio`) y `pr` (`number`, `url`, `review_state`).
3. **Sin duplicados dentro del tablero:**
   - El modelo sale solo en Sesión, no en la cabecera.
   - Se quitan `bypassPermissions`, `agentes N/N` y `permisos N` de Sesión.
   - Rama y hora: no se muestran si `HERDR_ENV=1` (herdr ya las da). Fuera de
     herdr van en la cabecera.
4. **Textos:**
   - Mayúscula inicial en etiquetas y estados.
   - Cada estado lleva símbolo y palabra: `⠹ En curso`, `◆ Te espera`,
     `✓ Hecho`, `✗ Falló`, `○ En espera`, `⠹ Trabajando`.
   - Una pregunta pendiente va en la línea siguiente, con `↳ `.
   - Nunca un `?` suelto como símbolo de estado.
5. **Nuevo en Sesión:**
   - `Modelo`: añade `thinking on|off` y el primer token.
   - `Cache`: `● Caliente  Caduca en m:ss` (ámbar si queda menos de 60 s) o
     `○ Fría`; `NN % aciertos`; tokens leídos de la cache en la sesión (no
     dólares: el mod no tiene precios fiables).
   - `Costo`: añade `$X.XX/h trabajando`, el costo dividido entre el tiempo de
     turnos en marcha (se muestra a partir de 1 min de trabajo).
   - `Hoy`: barra del gasto del día frente a `presupuestoDiario` (userConfig,
     USD, 0 la oculta).
   - Cupos: `Al ritmo actual no se agota` o `Al ritmo actual se agota HH:MM`.
   - `Proyecto`: carpeta y `«session_name»`.
   - `Git`: `N archivos +A −Q` o `Sin cambios`, `↑N sin subir`, `PR #N` con
     su estado de revisión, y el CI (`⠹ CI corriendo`, `✓ CI pasa`,
     `✗ CI falla`).
   - `Config`: cuántos CLAUDE.md, reglas, hooks y servidores MCP.
6. **Cabecera:** el estado del servicio de Claude
   (`https://status.claude.com/api/v2/status.json`, cada 5 min):
   `✓ Claude sin incidencias`, o `◆` en ámbar con el texto del indicador.
7. **Secciones nuevas:**
   - **Gasto** (plegada por omisión, tecla `g`): las 4 llamadas de herramienta
     cuyo resultado más contexto ocupó, y los archivos leídos más de una vez,
     con un consejo.
   - **Sesiones** (plegada, tecla `s`): las demás sesiones de la máquina, con
     su estado (`◆ Te espera`, `⠹ Trabajando`, `○ Inactiva`), su nombre y el
     tiempo. Cada tablero escribe `~/.claude/tablero/sesiones/<id>.json` con su
     estado; nadie lee transcripciones ajenas.
8. **Panel cerrado:** si el panel no está colocado, el tablero dibuja encima
   del prompt el resumen de hasta 8 filas. Si un mod dibuja esas filas, nadie
   más lo hace.
9. **Animaciones:** las que ya existen, sin cambios: giro braille cada 250 ms,
   barra que va y viene, relojes, redibujo cada 120 ms con trabajo y cada 1 s
   en reposo. Se añaden la barra de plan que avanza y la tira de permisos que
   crece.

## Reglas que se relajan (aprobado)

Hasta 1.2.0 el tablero no usaba red, no lanzaba procesos y no escribía
archivos. Desde 1.3.0:

- lanza `git` (cada 10 s, tope de 5 s) y `gh pr checks` (cada 60 s, solo con PR,
  tope de 10 s);
- consulta la página de estado de Claude (cada 5 min, tope de 5 s);
- escribe su propio archivo en `~/.claude/tablero/sesiones/`.

Cada fuente se apaga con la opción `extras` (lista separada por comas, por
omisión `cache,git,ci,servicio,presupuesto,gasto,sesiones`). Un fallo de
cualquier fuente oculta su fila; nunca rompe el panel.

## Fuera de alcance

Horario punta, cuenta activa y ahorro en dólares.
