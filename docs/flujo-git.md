# Flujo de trabajo con Git

Estado: aprobado

Flujo sencillo basado en GitHub Flow: una rama principal siempre estable y una rama corta por cada cambio. No usamos Git Flow clásico (ramas `develop`, `release`, `hotfix`): con una sola persona desarrollando añade trabajo sin aportar nada.

## Ramas

- **`main`**: siempre estable y desplegable. Vercel despliega a producción desde aquí. Nadie trabaja directamente en `main`.
- **Una rama por cambio**, que sale de `main` y vuelve a `main`:

| Prefijo | Para qué | Ejemplo |
| --- | --- | --- |
| `spec/` | Escribir o cambiar una spec | `spec/009-panel` |
| `feat/` | Implementar una spec | `feat/003-lectura-facturas` |
| `fix/` | Corregir un error | `fix/redondeo-reparto` |
| `docs/` | Documentación que no es una spec | `docs/flujo-git` |
| `chore/` | Configuración, dependencias, CI | `chore/ci-github-actions` |

Las ramas son cortas: una spec grande se implementa en varias ramas `feat/` pequeñas antes que en una enorme.

## Integrar en `main`

- **Specs y documentación** (`spec/`, `docs/`): se integran cuando la usuaria las aprueba en la conversación.
- **Código** (`feat/`, `fix/`, `chore/`): siempre con **pull request**. Requisitos para integrar:
  1. Los tests y la comprobación de tipos pasan en CI (GitHub Actions).
  2. La previsualización de Vercel de la PR funciona.
  3. Claude integra la PR cuando se cumplen 1 y 2, y avisa a la usuaria con un resumen del cambio. La usuaria puede pedir revisar una PR antes de integrarla.
- Se integra con **squash merge**: cada PR queda como un único commit en `main`. La rama se borra después.
- Si `main` avanza mientras una rama está abierta, la rama se actualiza con `rebase` sobre `main` antes de integrar.

## Mensajes de commit

Formato: `tipo(spec): descripción en español, en imperativo`.

- `tipo`: `spec`, `feat`, `fix`, `docs`, `chore`, `test`, `refactor`.
- `spec`: el número de spec afectado, si lo hay.

Ejemplos: `feat(003): extraer periodo e importe con Bedrock` · `fix(001): desempate del redondeo por fecha de entrada` · `docs: flujo de trabajo con Git`.

## Versiones

- Etiquetas `vX.Y.Z` en `main` en cada hito (por ejemplo, `v0.1.0` al terminar el MVP de uso propio).
- `0.x` mientras no haya usuarias externas; `1.0.0` al abrir la app al público.

## Protección de `main` (configurar en GitHub)

- Prohibido el push directo a `main` salvo para la integración de specs y documentación aprobadas.
- PR obligatoria con CI en verde para el código.
- Prohibido el force push y el borrado de `main`.

## Secretos

- Nunca se suben claves ni `.env` al repositorio (ya lo impide `.gitignore`). Los secretos viven en Vercel y en GitHub Actions.
- Si una clave se sube por error, se revoca inmediatamente; borrarla del historial no basta.
