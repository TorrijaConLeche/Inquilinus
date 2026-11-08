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
