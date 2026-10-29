# Panel de Servicios Locales

Página web que muestra **todo lo que corre en tu máquina** y te deja entrar a cada
servicio: los de Docker y los procesos locales, en una sola lista con estado en vivo.

Nace de un problema concreto: en un Mac con Supabase, contenedores y varios scripts
en marcha, no había un solo lugar para ver qué está levantado, en qué puerto y si
responde. Este panel lo descubre solo y lo mantiene al día.

---

## Arrancarlo

```bash
node local-services-panel/server.js
# → Panel de servicios locales → http://localhost:8790
```

Abre `http://localhost:8790`. Para verlo desde otro equipo de tu red, cambia el
equipo en el navegador por la IP de esta máquina; ver «Cómo se expone» abajo.

Requisitos: **Node.js 18 o más reciente**. No hace falta `npm install`: usa solo
módulos nativos de Node, sin dependencias.

## Qué hace

| | |
|---|---|
| **Descubre solo** | Lee `docker ps` y `lsof -nP -iTCP -sTCP:LISTEN`. No hay lista de servicios, puertos ni URLs escrita en el código: si levantas un contenedor nuevo aparece solo, y si lo paras desaparece. |
| **Estado en vivo** | Cada 10 segundos vuelve a mirar y avisa al navegador por Server-Sent Events. El navegador no recarga ni consulta nada. |
| **Abre el servicio** | Cada fila con interfaz web lleva a un enlace `↗`. |
| **Renombrar, fijar, ocultar** | Doble clic (o el botón ✎) en el nombre para renombrar; ⭐ para fijar; 👁 para ocultar. Se guardan en `state.json` y sobreviven a reinicios. |
| **Agrupa y filtra** | Columna de filtros por origen (Docker / local), Favoritos y Ocultos, más un buscador. Los grupos salen de lo que encontró, no están escritos a mano. |

Estados de cada fila: `activo` (responde por HTTP), `sin web` (escucha TCP pero no
habla HTTP, como PostgreSQL o Redis), `caído` (contenedor que no está en marcha).

Si no puede consultar Docker o `lsof`, el panel sigue funcionando con lo otro y
avisa con una franja amarilla. **Nunca borra tu renombrado o favoritos por eso**:
si una fuente falla, no toca nada de esa fuente hasta que vuelva.

## Qué NO hace

No arranca ni detiene contenedores, no muestra logs y no ejecuta comandos: solo
muestra datos y deja enlazar a ellos. No lee credenciales ni variables de entorno.

## Cómo se expone

El servidor escucha en `0.0.0.0:8790`, así que **cualquier equipo de tu red puede
abrir esta página** y ver la lista de tus servicios. Es conveniente si la quieres
desde el móvil; es un riesgo si no.

Para que solo la use esta máquina, edita `server.js` y cambia la línea 17:

```js
const HOST = '127.0.0.1';   // en vez de '0.0.0.0'
```

El puerto lo cambias con la variable `PORT` (`PORT=8800 node server.js`).

La escritura de favoritos y renombrados pide la cabecera `X-Panel-Client: 1`, que
las páginas de otros sitios no pueden enviar sin avisarte primero (evita que un
sitio que visites cambie tus etiquetas). Es una barrera, no autenticación: la
página y los datos siguen siendo legibles para quien alcance el puerto.

Donde se guarda la personalización: `state.json` junto a `server.js`. Está en
`.gitignore`; si se corrompe, el panel la mueve a `state.json.bak` y arranca de
cero sin romperse.

## Pruebas

```bash
cd local-services-panel && node --test test/
```

Son 39 pruebas: los dos descubridores (contra salidas reales de `lsof` y de
`docker ps`), la comprobación HTTP con sus límites de tiempo, la persistencia de la
personalización, el servidor (SSE, escritura, protección contra rutas que escapen
de `public/`, retención cuando una fuente falla) y el escapado de texto en la
página.

## Detalle técnico

Cuatro piezas en `lib/`, cada una con su prueba:

- `discover-sockets.js` — traduce `lsof` en filas de servicios locales.
- `discover-docker.js` — traduce `docker ps` en filas de servicios Docker.
- `healthcheck.js` — pregunta por HTTP con un límite estricto de 2 s y libera el
  socket en cuanto sabe si responde.
- `state.js` — la personalización: la clave de cada servicio es estable
  (`docker/<contenedor>:<puerto>`, `local/<proceso>:<puerto>`), así que renombrar
  en pantalla o reiniciar un contenedor no la pierde.

`server.js` orquesta; `public/index.html` es la página, sin build ni dependencias.
