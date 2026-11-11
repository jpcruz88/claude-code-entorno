# secret-guard

Bloquea escribir secretos en archivos y comandos y pregunta antes de leer archivos sensibles

## Qué bloquea al escribir

Revisa `Write`, `Edit`, `NotebookEdit`, `Bash` y `PowerShell`. Detecta:

- Claves y tokens con formato conocido: AWS (`AKIA…`), GitHub, Anthropic, OpenAI (`sk-proj-…`), Stripe (`sk_live_…`, `rk_live_…`), Google (`AIza…`), Slack, npm (`npm_…`), bot de Telegram y JWT.
- Claves privadas (`-----BEGIN … PRIVATE KEY-----`) y cabeceras `Bearer …`.
- URL con usuario y clave (`postgres://usuario:clave@host`, también mysql, mariadb, mongodb, redis y amqp).
- Variables `*_PASSWORD`, `*_SECRET` y `*_TOKEN` (en MAYÚSCULAS, con `=` o `:`) con un valor de 8 caracteres o más, y `AWS_SECRET_ACCESS_KEY` con su valor.
- Contraseñas dentro de cadenas de conexión de estilo ADO.NET (las que traen `Server=` o `Data Source=`).

No dispara con valores de ejemplo o de relleno (`changeme`, `xxx`, `<…>`, `example`, `password`, `postgres`), con variables (`${VAR}`, `$VAR`, `$(comando)`) ni con código que lee el valor de otro sitio (`process.env.X`, `os.environ[…]`, `getToken()`, `OTRA_CONSTANTE`).

El aviso nombra el tipo y una muestra enmascarada, nunca el valor completo.

## Qué pregunta al leer

Antes de leer un archivo sensible pregunta si se permite. Vale para `Read` y para `Bash` con `cat`, `less`, `more`, `head`, `tail` o `bat` (también tras `sudo`, `env`, en tuberías, `&&`, `;` y `$(…)`). Archivos sensibles: `.env` y `.env.*` (menos `.env.example`, `.env.sample` y `.env.template`), `.envrc`, `id_rsa`, `id_ed25519`, `id_ecdsa`, `credentials`, `credentials.json`, `.npmrc`, `.netrc`, `*.pem`, `*.pfx` y `*.key`. Si respondes Permitir, no vuelve a preguntar por ese archivo en la sesión, lo leas con `Read` o con `cat`.

## Límites

- La lectura por `Bash` solo mira esos seis lectores; `grep`, `cp`, `xxd`, `Get-Content` de PowerShell y similares no se vigilan.
- Un comando armado con variables o `eval` puede esconder la ruta.
- Una variable `*_PASSWORD=` cuyo valor sea solo un identificador en MAYÚSCULAS se toma por referencia a una constante y no se marca.

Licencia: MIT (ver [../../LICENSE](../../LICENSE)).
