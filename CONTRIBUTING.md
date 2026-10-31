# Cómo contribuir

Gracias por tu interés. Este repo es configuración personal publicada para que
otros la reusen: los cambios se revisan para que no entre nada privado.

## Antes de empezar

1. Activa los hooks de git una vez en tu clon:
   ```bash
   git config core.hooksPath .githooks
   ```
2. Instala `gitleaks` (`brew install gitleaks`) y Python 3.

## Flujo

1. **Prueba primero.** Todo cambio de comportamiento lleva una prueba que falla
   antes del cambio (`pruebas/`). Los cambios solo de documentación no la necesitan.
2. **Corre las pruebas:**
   ```bash
   python3 -m unittest discover -s pruebas
   ```
3. **Revisa privacidad y secretos:** `./exportar.sh` (sin `--aplicar` no escribe
   nada). Si todo está en orden, los hooks y el CI hacen lo mismo en cada commit,
   push y pull request.
4. **Commit:** mensaje en español, con una línea de resumen clara. Si lo escribe
   Claude Code, lleva la línea `Co-Authored-By`.
5. **Pull request:** describe qué cambia y cómo lo probaste. El CI debe quedar en
   verde (Linux y Windows).

## Qué no se acepta

- Datos personales, rutas de usuario, claves, correos o nombres de clientes.
- Skills, plugins o hooks sin revisar su código.
- Cambios que obliguen a un Mac específico (las pruebas deben pasar en cualquier Mac).

## Mods

Cada mod vive en `mods/<nombre>/` con su propio README, sus pruebas y su
`.claude-plugin/plugin.json`. Pruébalo con `claude plugin test mods/<nombre>`.
