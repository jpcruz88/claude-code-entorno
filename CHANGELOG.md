# Cambios

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El
repo no tiene versiones numeradas: cada entrada es un cambio fechado.

## Sin publicar

- Agentes y subagentes: siempre Haiku con esfuerzo medio («llow» permitido). Hook `guard-subagentes.py` en Agent, Task y Workflow; esfuerzo de Opus `xhigh` retirado de la configuración base.
- CI en GitHub Actions: pruebas, privacidad y gitleaks en Linux; PSScriptAnalyzer y
  pruebas en Windows.
- Hooks de git en `.githooks/` (`pre-commit` y `pre-push`).
- Pruebas de configuración: `settings.base.json` válido, hooks que existen, y
  `claude plugin validate` sobre el marketplace y cada mod.
- `exportar.sh` ahora muestra diferencias sin escribir; `--aplicar` escribe.
- La revisión de identidades acepta el correo acordado aunque el nombre de usuario
  de git sea otro.
- Documentación: `SECURITY.md`, `CONTRIBUTING.md`, guía de uso en `docs/`.

## 2026-10-31

- Los 8 mods de `claude-mods` se unen en `mods/`. Instalan por defecto.
- Modelo por defecto Haiku, con regla `claude/rules/modelo.md`.
- Regla de memoria persistente `claude/rules/memoria.md`.
- Se quitó la entrada duplicada de `guard-kill.py` en la config local.

## 2026-10-29

- OpenCode como respaldo, config de OpenCode, panel de servicios locales y
  Neovim con LazyVim.
- Universal Control: revisión y aviso entre dos Mac.
