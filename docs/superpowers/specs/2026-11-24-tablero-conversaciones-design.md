# Tablero: quién le habla a quién (diseño)

Fecha: 2026-11-24. Mod: `tablero` (sobre 1.3.2).

## Para qué

El usuario trabaja con varias sesiones de Claude en pestañas de herdr que se mandan trabajo entre sí. Quiere ver de un vistazo **quién le habla a quién** y **quién está esperando la respuesta de quién**, para saber dónde está atascada la cadena. Todas sus sesiones corren con bypass de permisos: «esperar» casi nunca es un permiso pendiente, es esperar a otra sesión.

## Objetivos

- Una sección **Conversaciones** en el tablero con los mensajes recientes entre sesiones: quién envía, a quién, cuándo y si se espera respuesta.
- La pestaña que recibe un mensaje lo ve también («Mazda → esta · te pidió algo»).
- Textos que se entienden solos (ver la regla de textos claros del tablero).

## Fuera de alcance

- Pestañas que no corren Claude con este tablero (Codex, Gemini…): no dejan registro. Si se necesitan, se añade después el estado de `herdr agent get` (opción 3 descartada por ahora).
- El contenido completo de los mensajes: solo un resumen de una línea.
- Permisos pendientes (bypass siempre activo).

## Anti-objetivos

- Que diga «espera respuesta» de algo que ya se respondió, o al revés: mejor no mostrar que mostrar mal.
- Que el tablero lance comandos lentos en cada redibujado.

## Enfoques considerados

1. **Cada tablero anota lo que su sesión envía** en `~/.claude/tablero/conversaciones/` y todos leen todo. **Elegido por el usuario.** Responde justo a «quién habla a quién y quién espera» y reutiliza el mecanismo de Sesiones.
2. Preguntar a herdr el estado de cada pestaña (`herdr agent get`). Ve todas las pestañas, pero no sabe quién mandó qué a quién.
3. La 1 más el estado de herdr para pestañas que no son Claude. Más completo, el doble de trabajo.

## Diseño

**Qué cuenta como mensaje.** En `tool.call` de la sesión principal (no de subagentes):

- `SendMessage` a otra sesión: destino por el campo `to`.
- `Bash` cuyo comando sea `herdr agent prompt <destino> …`, `herdr agent send-keys <destino> …` o `herdr pane run <destino> …`. El resumen es el texto enviado (o las teclas), recortado a una línea.
- `herdr agent wait <destino>` no es un mensaje nuevo: marca que esta sesión está esperando a ese destino mientras dura la llamada.

**A qué sesión va.** Para herdr, el tablero resuelve el destino con `herdr agent get <destino>`: el `agent_session.value` es el id de la sesión de Claude, y el nombre de la pestaña sale de `terminal_title_stripped`. Si no se puede resolver (otra herramienta, herdr no responde en 2 s), se guarda el nombre tal cual y el mensaje sale sin estado de respuesta. Para `SendMessage`, el destino se busca por nombre entre las sesiones del registro de Sesiones.

**Registro.** Cada sesión escribe `~/.claude/tablero/conversaciones/<su id>.json` con sus últimos 20 mensajes de menos de 24 h: `{ id, a, aNombre, canal: 'herdr' | 'claude', resumen, enviado, esperaFin }`. El registro de Sesiones gana un campo `turnoFin` (ms del último turno terminado).

**¿Se espera respuesta?** Un mensaje está «esperando respuesta» mientras el destino no haya terminado un turno después del envío (`turnoFin < enviado`) y no hayan pasado 30 min. Si el envío fue con `--wait` o hubo un `agent wait`, el final de esa llamada también cierra la espera. Si el destino no se resolvió, no se dice nada de la respuesta.

**Lo que se ve.** Sección plegada en una línea, como Sesiones, que se abre con la tecla `c`. Solo aparece si hay mensajes de la última media hora o alguna espera abierta.

```
Conversaciones  1 espera respuesta · 1 te pidió algo                c: abrir

  esta → reviewer   ◆ Espera respuesta  2m  «Revisa el diff y…»
  Mazda → esta      ◆ Te pidió algo     1m  «¿Subo el PR?»
  esta → tests      ✓ Respondió         hace 5m
  Mazda → reviewer  ○ Enviado           hace 8m
```

Primero lo que toca a esta sesión, luego las conversaciones entre otras. «Te pidió algo» se apaga cuando esta sesión termina un turno después del mensaje.

## Decisiones que deja al constructor

- Cómo partir el comando de Bash (comillas, `&&`, rutas a `herdr`): basta con reconocer el primer `herdr agent|pane …` de cada orden.
- Con qué frecuencia se leen los registros: la misma vuelta de 5 s que Sesiones.
- Anchos estrechos: a 40 columnas ninguna fila pasa del ancho (como las demás secciones).
