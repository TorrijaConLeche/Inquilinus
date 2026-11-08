# apps/api

API REST con Hono sobre Node. Node ejecuta el TypeScript directamente (sin compilar).

```
pnpm --filter @inquilinus/api dev     # http://localhost:3001
pnpm --filter @inquilinus/api test
```

- `src/app.ts`: `crearApp(dependencias)` monta las rutas. Las dependencias (base de datos, etc.) se inyectan para poder probar sin servicios externos.
- `src/servidor.ts`: arranque local con `@hono/node-server`. Puerto en `PORT` (por defecto 3001).

## Rutas

| Ruta | Qué hace |
| --- | --- |
| `GET /salud` | `200 { estado: "ok" }`. Si hay base de datos configurada, la consulta y devuelve `503` sin detalles si falla. |
| `GET /openapi.json` | Documento OpenAPI generado desde `@inquilinus/contracts`. |

Los errores nunca devuelven ni registran el mensaje original (RGPD).

## Base de datos

PostgreSQL en Neon (Frankfurt) con [Drizzle](https://orm.drizzle.team). Esquema en `src/bd/esquema.ts`, según `docs/modelo-datos.md`; migraciones en `drizzle/`.

1. Copia `.env.example` como `.env` y pon las cadenas de conexión de Neon. El `.env` nunca se sube.
2. Tras cambiar el esquema: `pnpm --filter @inquilinus/api bd:generar --name <descripcion>` crea la migración (se revisa y se sube con el cambio).
3. `pnpm --filter @inquilinus/api bd:migrar` la aplica en la base de datos del `.env`.

Los tests aplican las migraciones en PostgreSQL en memoria ([PGlite](https://pglite.dev)), sin conexión a Neon. Con `DATABASE_URL`, el chequeo de salud consulta la base de datos.
