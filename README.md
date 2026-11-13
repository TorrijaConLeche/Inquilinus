# Inquilinus

Gestión de alquileres para propietarias: inmuebles, habitaciones, inquilinos, cobros y reparto de suministros por días con lectura de facturas por IA.

- **Estado:** fase 2 (MVP para uso propio). Implementado: motor de reparto de suministros y de cálculo del alquiler (`packages/domain`).
- **Documentación:** [`docs/`](docs/) · **Specs:** [`specs/`](specs/)

## Desarrollo

Requisitos: Node 22.18 o superior y pnpm 10.

```
pnpm install
pnpm dev     # la app en http://localhost:3000
pnpm test
```

`pnpm dev` arranca la web (con la API en `/api`) contra la base de datos y el bucket de **previsualizaciones**, así que lo que crees en local no toca los datos reales. Necesita `apps/api/.env` (ver `apps/api/.env.example`) con `DATABASE_URL_PREVIEW` y, para los documentos, `APP_S3_BUCKET` con el bucket `…-preview`; se niega a arrancar si alguno apunta a producción.

Para entrar en local: con Google, o con email y contraseña usando un correo verificado en Amazon SES (mientras SES esté en modo de pruebas, solo esos reciben el email de verificación).
