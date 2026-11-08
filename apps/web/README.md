# apps/web

Next.js (App Router): panel de la propietaria y enlace público del inquilino.

```
pnpm --filter @inquilinus/web dev     # http://localhost:3000
pnpm --filter @inquilinus/web build
pnpm --filter @inquilinus/web test
```

## Estilo

- Tokens de la paleta Salvia en `src/app/globals.css` (`docs/estilo.md`). Los componentes usan solo `var(--token)`.
- Modo oscuro: sigue al dispositivo; `data-tema="claro"` u `data-tema="oscuro"` en `<html>` lo fija.
- Figtree 400 y 600 con `next/font` (se sirve desde la propia app). Clase `.cifras` para importes y tablas.

## Idiomas

- Textos en `messages/es.json` y `messages/en.json`, con [next-intl](https://next-intl.dev). Ningún texto va escrito en los componentes; un test comprueba que los dos ficheros tienen las mismas claves.
- El idioma no va en la URL: manda la cookie `idioma` (el ajuste de la usuaria); si no hay, el del navegador; si no, español (`src/i18n/idiomas.ts`).

## API y despliegue

- La web sirve la API de `apps/api` en `/api` (`src/app/api/[[...ruta]]/route.ts`): un solo proyecto en Vercel, un solo dominio y sin CORS. `apps/api` sigue siendo independiente y se puede desplegar aparte más adelante.
- Vercel: proyecto con *Root Directory* `apps/web`, funciones en Frankfurt (`vercel.json`, `fra1`) y la variable `DATABASE_URL` (Neon con pooler) en Production y Preview.
- Vercel se salta los despliegues de los commits que no tocan `apps/web` ni los paquetes de los que depende (por ejemplo, cambios solo en `docs/` o `specs/`).
