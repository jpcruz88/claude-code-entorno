# Origen de plan-progress

Copia de [`zycck/claude-mods`](https://github.com/zycck/claude-mods), carpeta
`plugins/plan-progress`, versión 1.0.0, commit `aa1c260a1fd0f73f7845262ac0937ed21832793a`
(5-nov-2026). Autor: Kirill Serditov. Licencia MIT (ver `LICENSE`, el aviso original).

## Qué cambia respecto al original

- **Sin auto-actualización.** Instalado desde el marketplace `claude-code-entorno`, el mod
  se comporta como una copia de carpeta: no consulta `api.github.com` cada 6 horas ni
  ofrece «Actualizar» (que instalaría código nuevo sin revisar). El cambio está en
  `readInstall` de `hooks/register.tsx` y lo prueba `tests/sin-actualizar.test.tsx`.
- Versión 1.0.1 para que la caché de plugins tome esta copia.
- Las rutas de ejemplo falsas de las pruebas llevan el marcador `privacidad-ok` para la revisión de privacidad del repo.
- Se añadieron `tsconfig.json`, `.gitignore` y la prueba anterior; no se copiaron los
  README traducidos ni los vídeos de demostración.

## Cómo traer una versión nueva del original

1. Lee el diff entre el commit de arriba y el nuevo en `zycck/claude-mods`.
2. Copia `plugins/plan-progress` encima de esta carpeta y vuelve a aplicar el cambio de
   `readInstall`.
3. Corre `claude plugin test mods/plan-progress` y la regresión del autor
   (`tests/README.md`), sube la versión y actualiza este archivo.

## Qué cuesta

El mod añade al prompt de cada sesión unas reglas cortas (una frase de unas 100
palabras) y Claude llama a la herramienta `plan_progress` en cada paso de una tarea
larga. Es el único gasto en tokens; las filas de subagentes salen de los eventos del
motor. Para no usarlo: `claude plugin disable plan-progress@claude-code-entorno`.
