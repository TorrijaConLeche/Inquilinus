# packages/contracts

Esquemas Zod compartidos por la API, la web y la futura app móvil. De ellos se genera el documento OpenAPI.

- Cada área tiene su fichero (`src/salud.ts`…) con sus esquemas y la descripción de sus rutas (`rutasX`, en formato de [zod-openapi](https://github.com/samchungy/zod-openapi)). No depende de Hono ni de Next.
- Los esquemas que se reutilizan llevan `.meta({ id })` y salen en `components.schemas`.
- `generarOpenApi()` junta todas las rutas. La API lo sirve en `GET /openapi.json`.
- `pnpm --filter @inquilinus/contracts openapi` escribe `dist/openapi.json` (no se sube).

Al añadir un endpoint: esquema y ruta aquí, se añade la ruta a `generarOpenApi()` y la API valida y responde con esos esquemas.
