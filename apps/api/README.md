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
| `GET /cuenta/exportacion` | Con sesión: todos los datos de la cuenta en JSON, sin secretos (spec 008, R14). |
| `POST /cuenta/borrar` | Con sesión, `{ email }` y cabecera `Origin` de la propia app: borra la cuenta y todo lo suyo, primero los ficheros (R14, C12). |
| `GET /inmuebles`, `POST /inmuebles` | Lista (sin archivados, salvo `?archivados=true`) y alta con habitaciones y precio inicial, todo o nada (spec 007, R1 y R3). |
| `GET` y `PATCH /inmuebles/:id` | Detalle con el precio actual (hora de Madrid) y el historial; edición de todo menos la modalidad (R2). |
| `POST /inmuebles/:id/habitaciones`, `PATCH …/habitaciones/:id` | Añadir y renombrar habitaciones. |
| `POST …/habitaciones/:id/precios` | Precio desde un mes (R4); otro cambio en el mismo mes lo sustituye. |

| `GET`, `POST /inmuebles/:id/inquilinos`; `PATCH …/inquilinos/:id` | Inquilinos con sus estancias; alta solo con nombre (R6), opcionalmente con su primera estancia; renombrar. |
| `POST …/inquilinos/:id/ocupaciones`; `PATCH /inmuebles/:id/ocupaciones/:id` | Nueva estancia o corregir fechas y poner la salida (R7, R9), sin solapes en la habitación (el día de relevo no cuenta). |
| `POST …/inquilinos/:id/cambio-habitacion` | Cierra la estancia abierta el día anterior y abre otra en la habitación nueva, todo o nada (R8). |
| `GET`, `POST /inmuebles/:id/tipos-gasto`; `PATCH …/tipos-gasto/:id` | Tipos de gasto; sin color, el primero libre de la paleta (`COLORES_GASTO`); renombrar y cambiar color (R10). |
| `POST …/inquilinos/:id/subidas` | Permiso firmado (5 minutos) para que el navegador suba un PDF de hasta 10 MB directamente al bucket, a `pendientes/<usuario>/<id>.pdf` (R6c). |
| `PUT`, `GET`, `DELETE …/inquilinos/:id/documentos/:tipo` | `tipo` es `contrato` o `justificante_fianza`. `PUT { subidaId, nombre }` comprueba que es un PDF por su contenido, lo mueve a `documentos/<usuario>/<id>.pdf` y reemplaza el anterior del mismo tipo (R6b); `GET` redirige a una URL firmada de 5 minutos; `DELETE` lo borra del bucket y de la base de datos. |
| `DELETE /inmuebles/:id` | Con `{ nombre }` exactamente igual al del inmueble: lo borra con todo, ficheros del bucket incluidos (R13). `PATCH { archivado }` lo archiva o restaura (R11c). |
| `PATCH { archivada }`, `DELETE …/habitaciones/:id` | Archivar o restaurar (con estancias) y borrar (sin estancias); nunca con alguien viviendo ni dejando el inmueble sin habitaciones activas (R11, R11b). |
| `PATCH { archivado }`, `DELETE …/tipos-gasto/:id` | Archivar o restaurar; borrar solo sin facturas (R11). |
| `DELETE …/inquilinos/:id` | Derecho de supresión, solo si ya no vive allí: con cobros o repartos lo anonimiza como «Inquilino N» y borra sus documentos, fianza, ficheros y enlace; sin ellos, lo borra del todo. Un anonimizado ya no se puede editar (R12). |
| `GET /procesos/cobros-diarios` | Proceso diario del cron de Vercel (spec 005, R2, R8): en cada inmueble no archivado ni bloqueado cuyo día de cobro ya ha llegado, crea los cobros del mes en curso que falten (origen `auto`). Solo con `Authorization: Bearer <CRON_SECRET>`; sin la variable responde `503`. Devuelve y registra solo recuentos. |
| `GET`, `POST /inmuebles/:id/cobros` | Cobros del inmueble por fecha de cobro (`?mes=YYYY-MM`; los quitados solo con `?quitados=true`). `POST { inquilinoId, mes, renta?, recargoVacios?, fechaCobro? }` añade uno a mano: sin renta, la calculada si vivió allí ese mes (spec 005, R10b). |
| `POST /inmuebles/:id/cobros/generar` | `{ mes }`: crea los que falten de ese mes con el cálculo de la spec 002, sin duplicar ni recrear quitados y nunca de meses futuros (R4, R5, R5b). |
| `GET /inmuebles/:id/cobros/mes/:mes` | Pantalla de cobros de un mes (spec 009): los del mes, los quitados, los pendientes de meses anteriores al mes en curso y lo que asume la propietaria por vacíos. |
| `POST /inmuebles/:id/cobros/pagar-todo` | `{ inquilinoId, mes, fecha? }`: «Todo pagado» (por defecto hoy); devuelve lo marcado para poder deshacerlo (spec 009, R10). |
| `POST /inmuebles/:id/cobros/:id/recalcular` | `{ confirmar? }`: pone los importes del cálculo actual (R6b). Si está pagado o editado hace falta `confirmar: true` (`CONFIRMACION_NECESARIA`); conserva una fecha movida; si el inquilino ya no vivió ese mes, `SIN_ESTANCIA_EN_EL_MES`. |
| `PATCH /inmuebles/:id/cobros/:id` | Renta, recargo o fecha (queda editado si cambia algo), `quitado` para quitar o restaurar, y `pagadoEn` (no posterior a hoy) o `null` (R7, R10, R11). |
| `PUT`, `DELETE …/inquilinos/:id/fianza` | Una fianza por inquilino: importe, recepción y devolución (fecha e importe juntos, nunca mayor que la fianza) y notas cortas (R6d). |

Cualquier cambio que pueda alterar el cálculo de meses con cobros (estancias, precios, meses a medias, habitaciones nuevas, archivadas o borradas, borrar un inquilino) pasa por `vigilarCobros` (`src/cobros.ts`): calcula esos meses antes y después y marca como desactualizados los cobros no quitados cuyo cálculo cambia (spec 005, R6).

Todas las rutas de `/inmuebles` exigen sesión, filtran por la cuenta (lo ajeno responde 404) y, para escribir, la cabecera `Origin` de la propia app. Los errores de datos responden 400 con su código en `error` (`SIN_HABITACIONES`, `MODALIDAD_NO_EDITABLE`, `DATOS_INVALIDOS`…). Las escrituras de varias filas van en un bloque atómico (`src/bd/bloque.ts`).

Los errores nunca devuelven ni registran el mensaje original (RGPD).

## Base de datos

PostgreSQL en Neon (Frankfurt) con [Drizzle](https://orm.drizzle.team). Esquema en `src/bd/esquema.ts`, según `docs/modelo-datos.md`; migraciones en `drizzle/`.

1. Copia `.env.example` como `.env` y pon las cadenas de conexión de Neon. El `.env` nunca se sube.
2. Tras cambiar el esquema: `pnpm --filter @inquilinus/api bd:generar --name <descripcion>` crea la migración (se revisa y se sube con el cambio).
3. `pnpm --filter @inquilinus/api bd:migrar:todo` la aplica en las dos bases de datos: la de producción (`bd:migrar`) y la rama de Neon de las previsualizaciones de Vercel (`bd:migrar:previsualizaciones`, que se niega si apunta a producción). Así las pruebas de cada PR no tocan los datos reales.

Los tests aplican las migraciones en PostgreSQL en memoria ([PGlite](https://pglite.dev)), sin conexión a Neon. Con `DATABASE_URL`, el chequeo de salud consulta la base de datos.

## Registro (logs)

`src/registro.ts` escribe una línea JSON por evento en la consola (en producción, los logs de Vercel). Nunca lleva datos personales (`docs/rgpd.md`):

- Solo admite una lista cerrada de campos: id de petición, método, patrón de ruta, estado, duración y, en los errores, tipo, código y pila. Cualquier otro campo se descarta.
- Las rutas se registran por su patrón (`/inmuebles/:id`), nunca la URL real, que puede llevar el token del enlace del inquilino o parámetros de búsqueda.
- De los errores nunca se guarda el mensaje. Solo el tipo, el código de dominio (`FECHA_INVALIDA`) o de PostgreSQL (`28P01`) y las líneas `at …` de la pila.
- Cada respuesta lleva la cabecera `x-id-peticion` para encontrar su línea en los logs. En Vercel coincide con su id de petición.

Eventos: `peticion`, `error_no_controlado`, `base_datos_no_responde` y, del proceso diario, `cobros_diarios` (recuentos de inmuebles, creados y fallidos) y `cobro_diario_fallido` (solo el código). En la API, `dependencias.registro` permite capturarlo en los tests.

## Cuentas (spec 008)

[Better Auth](https://better-auth.com) en `<rutaBase>/auth/*` (en la web, `/api/auth/*`), configurado en `src/auth.ts`:

- Tablas `usuario`, `sesion`, `metodo_acceso` y `verificacion`; los nombres de Better Auth se traducen a las columnas en español.
- Email y contraseña con verificación obligatoria (R2), mínimo de 12 caracteres sin reglas (R5), recuperación con enlace de un solo uso válido 1 hora (R6) y aceptación de la versión vigente de los términos (R4, `VERSION_TERMINOS` en `@inquilinus/contracts`).
- Emails por Amazon SES (`src/correo/`) en el idioma del usuario. Si SES falla, el registro sigue y solo el tipo de error va al log.
- Google (R1, R3): solo email y perfil básico, sin foto. Se vincula a una cuenta existente solo si Google confirma el email y la cuenta ya lo tenía verificado. Una cuenta nueva con Google exige que la web pase la versión de los términos en `additionalData` al iniciar el flujo (pantalla de registro); si no, se redirige a `errorCallbackURL?error=TERMINOS_NO_ACEPTADOS`.
- Seguridad (tarea 2.5): sesión de 30 días exactos sin renovación con «recordar» y cookie de navegador sin él (R8); `/revoke-sessions` cierra todas (R10); doble factor con app (TOTP, 10 códigos de recuperación) o con código por email de 6 cifras válido 5 minutos (R7; con la app activa, `/two-factor/send-otp` y `verify-otp` responden `403 METODO_NO_PERMITIDO`); y límite de intentos en `src/limitador.ts`: 5 fallos en 15 minutos por cuenta o por IP bloquean 15 minutos (R11), guardando solo huellas HMAC. El doble factor se pide al entrar con email; con Google se aplica el de la cuenta de Google.
- Google no funciona en las previsualizaciones de Vercel: su dirección cambia en cada rama y Google solo acepta direcciones registradas. Se prueba en local y en producción.
- `src/configuracion.ts` monta todo desde las variables de entorno (`.env.example`). Sin alguna de ellas, la API funciona pero sin cuentas.

## Ficheros (spec 007, R6b y R6c)

Bucket privado de S3 en Estocolmo (`APP_S3_BUCKET`; uno para producción y otro, `…-preview`, para las previsualizaciones y local), con las mismas credenciales que SES. `src/almacen.ts` define la interfaz `Almacen` (en los tests, `test/almacen-memoria.ts`):

- La API nunca recibe el fichero: firma un permiso de subida y el navegador lo manda directamente al bucket. Así no hay límite de tamaño de las funciones de Vercel (4,5 MB).
- Al confirmar, la API lee el objeto, comprueba que es un PDF, calcula su SHA-256 y lo copia a su clave definitiva. Si no es válido, lo borra.
- Para ver un documento, la API comprueba el permiso y redirige a una URL firmada de 5 minutos.
- Sin `APP_S3_BUCKET`, las rutas de documentos responden `503` y una cuenta con ficheros no se puede borrar.

Configuración de cada bucket (en la consola de AWS; el usuario de la app no tiene permiso para cambiarla):

- **CORS**: `POST` desde la URL de la app (en el de previsualizaciones, también `http://localhost:3000` y `https://*.vercel.app`).
- **Ciclo de vida**: regla `borrar-subidas-pendientes` que borra lo que hay en `pendientes/` al día siguiente (subidas que no se llegaron a confirmar).
