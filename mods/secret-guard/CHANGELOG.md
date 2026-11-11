# Changelog

## 0.2.0 (secret-guard)

Detecta más secretos y vigila la lectura por Bash.

- Escritura: URL con credenciales (postgres, mysql, mariadb, mongodb, redis, amqp), variables `*_PASSWORD`, `*_SECRET` y `*_TOKEN` con valor no trivial, claves `sk-proj-…`, Stripe `sk_live_…`/`rk_live_…`, Google `AIza…`, JWT, tokens de bot de Telegram, la clave secreta de AWS junto a su variable y tokens `npm_…`.
- Sin falsos positivos con valores de ejemplo (`changeme`, `xxx`, `<…>`), variables (`${VAR}`, `$VAR`, `$(…)`) ni código que lee el valor de otro sitio (`process.env.X`, `os.environ[…]`).
- Lectura: además de `Read`, ahora `Bash` con `cat`, `less`, `more`, `head`, `tail` y `bat` pregunta antes de abrir un archivo sensible. El permiso dado vale para los dos caminos.
- Archivos sensibles nuevos: `.envrc`, `id_ecdsa`, `.npmrc`, `.netrc` y `*.key` (ya estaba `*.pem`).

## 0.1.0 (secret-guard)

- Primera versión: bloquea secretos conocidos al escribir y pregunta antes de leer `.env`, claves SSH y credenciales con `Read`.
