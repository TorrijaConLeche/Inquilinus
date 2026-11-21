# apps/web

Next.js (App Router): panel de la propietaria y enlace público del inquilino.

```
pnpm dev                              # desde la raíz: con la base y el bucket de previsualizaciones (recomendado)
pnpm --filter @inquilinus/web dev     # http://localhost:3000, sin variables de entorno
pnpm --filter @inquilinus/web build
pnpm --filter @inquilinus/web test
```

## Estilo

- Tokens de la paleta Salvia en `src/app/globals.css` (`docs/estilo.md`). Los componentes usan solo `var(--token)`.
- Colores de gasto (spec 006, R7): tokens `--gasto-<color>` y `--gasto-<color>-suave`, y `--alquiler` para el gris reservado al alquiler. `src/componentes/ColorGasto.tsx` tiene el punto de color, el nombre con su color y el selector; `test/colores.test.ts` comprueba que cada color existe en claro y oscuro y su contraste.
- Modo oscuro: sigue al dispositivo; `data-tema="claro"` u `data-tema="oscuro"` en `<html>` lo fija.
- Figtree 400 y 600 con `next/font` (se sirve desde la propia app). Clase `.cifras` para importes y tablas.

## Idiomas

- Textos en `messages/es.json` y `messages/en.json`, con [next-intl](https://next-intl.dev). Ningún texto va escrito en los componentes; un test comprueba que los dos ficheros tienen las mismas claves.
- El idioma no va en la URL: manda la cookie `idioma` (el ajuste de la usuaria); si no hay, el del navegador; si no, español (`src/i18n/idiomas.ts`).

## API y despliegue

- La web sirve la API de `apps/api` en `/api` (`src/app/api/[[...ruta]]/route.ts`): un solo proyecto en Vercel, un solo dominio y sin CORS. `apps/api` sigue siendo independiente y se puede desplegar aparte más adelante.
- Vercel: proyecto con *Root Directory* `apps/web`, funciones en Frankfurt (`vercel.json`, `fra1`) y la variable `DATABASE_URL` (Neon con pooler) en Production y Preview.
- Cron (`vercel.json`): `/api/procesos/cobros-diarios` cada día a la 01:00 UTC (entre las 2 y las 4 en Madrid). Vercel solo lo lanza en producción y manda la variable `CRON_SECRET`, que solo existe en Production.
- Vercel se salta los despliegues de los commits que no tocan `apps/web` ni los paquetes de los que depende (por ejemplo, cambios solo en `docs/` o `specs/`).

## Pantallas de la cuenta (spec 008)

| Ruta | Qué hay |
| --- | --- |
| `/registro` | Email, contraseña (12+), nombre opcional, aceptación de términos y Google (solo con los términos aceptados) |
| `/acceso` | Email y contraseña, «recordar este dispositivo», paso del doble factor (app o código de recuperación), reenviar la verificación y Google |
| `/recuperar`, `/restablecer` | Enlace por email y contraseña nueva |
| `/inmuebles` | Lista de inmuebles (cada tarjeta lleva al detalle); si no hay ninguno, invita a crear el primero. Los archivados, aparte con `?archivados=1` |
| `/inmuebles/nuevo` | Asistente de alta en 5 pasos (spec 007, R1): el inmueble se crea al terminar el paso 3, todo o nada; los tipos de gasto y los inquilinos (opcionales) se guardan al momento |
| `/inmuebles/[id]` | Detalle del inmueble (lo ajeno da 404): arriba, la línea de tiempo (spec 006: alquiler, cada tipo de gasto y cada inquilino sobre un eje de días, con zoom mes, trimestre y año; componente compartido en `src/componentes/timeline`), que al pulsar abre la ventana del alquiler del mes (por inquilino, con la explicación de los vacíos y su pago), de la factura (tramos, reparto con su pago, liquidación y PDF) o de la liquidación, y debajo las últimas actividades con el enlace al histórico; editar datos, habitaciones con precio actual e historial (cambiar precio desde un mes), inquilinos con sus estancias (entrada, salida, cambio de habitación, corregir fechas), sus documentos (contrato y justificante, en PDF, subidos directamente al bucket), su fianza y su enlace (generar, copiar o enviar por WhatsApp solo al generarlo, permitir la descarga, regenerar y revocar), y tipos de gasto con su color (selector con los ocho de la paleta; los ya usados dicen quién los usa). Cada acción guarda al momento. Habitaciones y gastos se archivan si tienen historial y se borran si no; los inquilinos que ya se fueron pasan a «Antiguos inquilinos» y se pueden borrar (anonimizados si tienen cobros o repartos); el inmueble se archiva, se restaura o se borra escribiendo su nombre |
| `/inmuebles/[id]/historico` | Histórico del inmueble (spec 012): filtros en la URL (inquilinos, gastos, tipo de actividad, estado de pago y fechas), los activos como chips que se quitan con un toque, resumen de lo filtrado y actividades por mes que abren su ventana de detalle |
| `/inmuebles/[id]/cobros` | Cobros del inmueble por mes (`?mes=YYYY-MM`, por defecto el mes en curso; spec 009): pendientes de meses anteriores destacados, cobros del mes por inquilino con «Cobrado» de un toque y «Todo pagado» (con deshacer), cada liquidación en una línea desplegable con «Marcar pagada» (spec 011), cambiar importe, mover, quitar, restaurar y recalcular, generar los que faltan, añadir a mano y totales del mes con lo que asumes tú |
| `/inmuebles/[id]/facturas` | Facturas del inmueble (spec 003): subir hasta 20 PDF de una vez (directos al bucket) y lista «Por revisar»: cada factura con lo que propuso la IA, su formulario (tipo, con «+ Nuevo tipo de gasto», periodo e importe), «Guardar», «Confirmar» con aviso de solapes y «Descartar»; «Confirmar todas»; liquidaciones (spec 011): propuesta al confirmar un lote con dos o más repartidas (descartarla se recuerda en el navegador), crear a mano, renombrar, añadir o quitar facturas, «Marcar pagada» por inquilino y borrar; y las confirmadas con su reparto por inquilino (cada parte con «Cobrado» de un toque), su liquidación, lo sin ocupar, «Recalcular» si está desactualizado y «Deshacer confirmación» |
| `/panel` | Panel principal (spec 009): pendiente de cobro y cobrado este mes, avisos (cobros desactualizados por inmueble, inmuebles bloqueados), pendientes por inmueble e inquilino con lo atrasado destacado (cada inquilino lleva a los cobros de su inmueble; cada liquidación es una línea que se despliega en sus facturas con el cálculo y el PDF) y una tarjeta por inmueble |
| `/ajustes` | Idioma, apariencia (claro, oscuro, como el dispositivo), doble factor con app (QR y códigos de recuperación) o con código por email, cerrar sesión en todos los dispositivos |
| `/privacidad`, `/terminos` | Borradores de la tarea 2.8 (en `src/contenido/legal/`, uno por idioma, en Markdown), pendientes de revisión legal |

- `src/servidor/api.ts`: la instancia de la API compartida por `/api` y las páginas (sesión del usuario en el servidor).
- `src/lib/cliente-auth.ts`: cliente de Better Auth en el navegador. `src/lib/errores.ts` traduce los códigos de error de la API a textos propios.
- `(privado)/layout.tsx` exige sesión; sin ella, a `/acceso`.
- Idioma y apariencia se guardan en las cookies técnicas `idioma` y `tema`.
- El botón de Google no aparece en las previsualizaciones de Vercel.
- Todos los campos de contraseña (`Campo` con `type="password"`) llevan un botón para mostrarla u ocultarla.
