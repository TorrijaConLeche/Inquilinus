# Rentio

Plataforma web (y más adelante móvil) para que propietarias gestionen sus alquileres. El diferencial: leer facturas de suministros con IA y repartirlas por días entre los inquilinos, con un desglose transparente.

Contexto completo en `docs/documento-arranque.md`. Modelo de datos en `docs/modelo-datos.md`. RGPD en `docs/rgpd.md`. Flujo de Git en `docs/flujo-git.md`.

## Cómo trabajamos: spec-driven development

- Toda funcionalidad parte de una spec en `specs/` (formato en `specs/README.md`).
- Solo se implementa una spec en estado `aprobada`. Al terminar, pasa a `implementada`.
- Si al implementar una regla resulta ambigua o hay que cambiarla, **se actualiza la spec primero** y se avisa a la usuaria; nunca se decide en silencio en el código.
- Cada caso de prueba de la spec (C1, C2…) es un test con el mismo nombre.

## Git

Flujo en `docs/flujo-git.md`: `main` siempre estable, una rama corta por cambio (`spec/`, `feat/`, `fix/`, `docs/`, `chore/`), código siempre con PR y CI en verde, squash merge, commits `tipo(spec): descripción` en español.

## Estructura

```
apps/api            Hono sobre Node (API-first)
apps/web            Next.js: panel de la propietaria y enlace público del inquilino
packages/domain     Lógica de negocio pura (repartos, alquiler). Sin dependencias
packages/contracts  Esquemas Zod compartidos y OpenAPI
specs/              Specs por funcionalidad
docs/               Documentación del proyecto
```

La app móvil (Expo) está fuera del MVP; todo lo reutilizable va en `packages/`.

## Convenciones

- Código, nombres de dominio y textos de la app en **español**.
- Importes siempre en **céntimos enteros**; nunca `number` con decimales para dinero.
- Fechas de negocio como día natural `YYYY-MM-DD`, sin hora ni zona horaria.
- `packages/domain` es TypeScript puro: sin I/O, sin base de datos, sin dependencias. Errores de entrada con `ErrorValidacion`.
- Repartos y cobros se guardan como foto fija; recalcular es una acción explícita de la usuaria.

## RGPD (obligatorio)

- Ningún dato personal (nombres, DNI, contenido de facturas) en logs ni en errores enviados a monitorización.
- No se guardan DNI ni nóminas. Los contratos y justificantes de fianza **nunca** se envían a la IA. A la IA solo llega la factura.
- Ficheros en bucket privado, servidos solo con URL firmada de corta duración tras comprobar permisos.
- Toda consulta se filtra por la usuaria propietaria; cada endpoint nuevo lleva un test de aislamiento.
- Datos alojados en la UE (Neon UE, S3 UE, Bedrock perfil EU, funciones de Vercel en Frankfurt).

## Comandos

```
pnpm install
pnpm test        # todos los tests (Turborepo)
pnpm typecheck
```
