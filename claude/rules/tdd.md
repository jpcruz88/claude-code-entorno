## Desarrollo guiado por pruebas (TDD)

En todo cambio de comportamiento del código (funcionalidad nueva, arreglo de un error o refactor que cambie lo que hace), sigue la skill `superpowers:test-driven-development`:

1. Escribe primero la prueba y córrela: debe fallar, y por la razón esperada.
2. Escribe el código mínimo para que pase.
3. Corre la suite completa del proyecto: todo en verde.
4. Refactoriza solo con las pruebas en verde.

Para un error, lo primero es una prueba que lo reproduzca. Si hay pantalla, incluye pruebas de navegador con Playwright: escríbelas con `playwright-best-practices` y revisa la pantalla con `playwright-cli`.

Antes de decir que algo está terminado, usa `superpowers:verification-before-completion`: corre las pruebas y muestra la salida real. Nunca digas que algo pasa sin haberlo corrido.

No hace falta en cambios solo de documentación, configuración o textos sin lógica, ni en prototipos que el usuario diga que son desechables. Si el proyecto no tiene pruebas, propón montar lo mínimo antes de cambiar el código; no te saltes las pruebas sin decirlo.
