# 008 · Cuenta e inicio de sesión

Estado: aprobada · Paquetes: `apps/api` (Better Auth), `apps/web`

## Objetivo

Una propietaria puede crear su cuenta, con email y contraseña o con Google, y acceder a sus datos de forma segura. Una persona por cuenta. Mientras dure la beta cerrada, solo se registra quien está invitada.

## Reglas

**Registro y acceso**

- **R1** — Se puede entrar con **email y contraseña** o con **Google**. El registro es libre salvo durante la beta cerrada (R1b).
- **R1b** — **Registro por invitación.** Solo se crea una cuenta nueva, con email o con Google, si su email está en la **lista de invitados**: la variable de entorno `REGISTRO_INVITADOS`, con emails separados por comas, sin distinguir mayúsculas ni espacios. Con `*`, el registro es libre. Sin la variable o vacía, nadie puede registrarse (si se olvida, la puerta queda cerrada, no abierta). La comprobación se hace en el servidor, antes de crear la cuenta y de enviar ningún email. A quien no está en la lista no se le crea nada y ve: «De momento Inquilinus está en beta cerrada y solo pueden registrarse personas invitadas». Con Google, vuelve al registro con ese mensaje. La lista solo decide quién se registra: quien ya tiene cuenta entra aunque no esté en ella. La lista no se escribe en los logs.
- **R2** — Con email y contraseña, la cuenta no se puede usar hasta verificar el email con el enlace que se envía. Con Google, el email ya viene verificado.
- **R3** — Si ya existe una cuenta con ese email y se entra con Google (con email verificado por Google), las dos formas de acceso se vinculan a la misma cuenta, **solo si la cuenta existente ya tiene el email verificado**. Si no lo tiene, no se vincula y se pide confirmar antes el email: así nadie puede registrar el email de otra persona con su contraseña y quedarse dentro cuando la dueña entre con Google.
- **R4** — Al registrarse hay que aceptar la política de privacidad y los términos. Se guarda la fecha y la versión aceptada ⚖️. Con Google, la cuenta solo se crea desde la pantalla de registro con los términos aceptados; si se entra con Google desde la pantalla de acceso sin tener cuenta, no se crea y se lleva al registro.
- **R5** — Contraseña de al menos 12 caracteres, sin reglas de composición ni lista de contraseñas comunes (el mínimo de 12, el límite de intentos de R11 y el doble factor opcional bastan para el MVP). Se guarda solo su hash (algoritmo de Better Auth).
- **R6** — Recuperación de contraseña con un enlace por email, de un solo uso y válido 1 hora. El mensaje es el mismo exista o no el email.
- **R7** — Doble factor **opcional**, a elegir: con una **app de autenticación** (TOTP), con códigos de recuperación, o con un **código por email** (6 cifras, válido 5 minutos), pensado para quien no se apaña con la app. Se usa uno de los dos: con la app activa no se puede entrar con un código por email, para no rebajar su protección a la del correo. Para cambiar de método se desactiva y se activa el otro.

**Sesión**

- **R8** — Sin "recordar este dispositivo", la sesión termina al cerrar el navegador. Con él, dura **30 días** y después vuelve a pedir el acceso.
- **R9** — La sesión va en una cookie técnica `HttpOnly`, `Secure` y `SameSite=Lax`. La app solo usa cookies técnicas, exentas de consentimiento según la guía de cookies de la AEPD, así que no hay banner de cookies. Si algún día se añade analítica, habrá que pedir consentimiento.
- **R10** — Desde los ajustes se puede cerrar la sesión en todos los dispositivos.

**Seguridad y abuso**

- **R11** — Tras 5 intentos fallidos en 15 minutos (por cuenta o por IP), se bloquean los intentos durante 15 minutos. El mensaje de error es genérico: "Email o contraseña incorrectos".
- **R12** — Cada cuenta tiene un máximo de facturas leídas por IA al mes según su plan (spec 010): 5 en Starter y 100 como uso razonable en Plus y en Advanced. Al alcanzarlo, se pueden seguir subiendo facturas y rellenarlas a mano.

**Datos de la cuenta (RGPD)**

- **R13** — Una persona por cuenta. Todo (inmuebles, inquilinos, facturas) pertenece a una cuenta y ninguna consulta cruza cuentas.
- **R14** — La propietaria puede **exportar** todos sus datos (JSON y ficheros) y **borrar su cuenta**. La exportación incluye todo salvo los secretos (hash de la contraseña, tokens de sesión y de enlaces, clave y códigos del doble factor), que no le sirven y serían un riesgo si el fichero se pierde; los ficheros se añaden cuando existan (fase 3). Borrarla elimina todo, incluidos los ficheros, con confirmación escribiendo su email, y cierra todas sus sesiones.
- **R15** — De la cuenta se guarda solo el email, el nombre (opcional) y el método de acceso. Con Google se piden solo los permisos de email y perfil básico.

## Casos de prueba

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Registro con email (R2) | Cuenta creada pero bloqueada hasta verificar el email |
| C2 | Contraseña corta (R5) | Con 10 caracteres, error de validación |
| C3 | Contraseña larga sin reglas (R5) | "password1234" se acepta: solo cuenta la longitud |
| C4 | Intentos fallidos (R11) | Al sexto fallo en 15 minutos, bloqueo de 15 minutos |
| C5 | Google, email nuevo (R1, R2) | Cuenta creada y verificada |
| C6 | Google, email existente (R3) | Se vincula a la cuenta existente; mismos inmuebles |
| C6b | Google, email existente sin verificar (R3) | No se vincula; se pide confirmar el email y la contraseña de la cuenta existente no da acceso a nada nuevo |
| C5b | Google sin aceptar los términos (R4) | Desde la pantalla de acceso, sin cuenta: no se crea la cuenta |
| C7 | Recuperación, email inexistente (R6) | Mismo mensaje que con un email existente |
| C8 | Enlace de recuperación reutilizado (R6) | El segundo uso da error |
| C9 | Recordar dispositivo (R8) | Sesión válida el día 30; el día 31 pide acceso |
| C10 | Doble factor (R7) | Con 2FA activo, pide el código tras la contraseña |
| C10b | Doble factor por email (R7) | Con el código por email activo, tras la contraseña llega un código al email y con él se entra |
| C10c | App activa, código por email (R7) | Con la app activa, pedir un código por email da error y no se envía nada |
| C11 | Límite de IA (R12) | La factura 101 del mes no llama a la IA; se rellena a mano |
| C12 | Borrar cuenta (R14) | No queda ningún dato ni fichero de la cuenta |
| C12b | Exportar datos (R14) | El JSON trae los datos de la cuenta y sus inmuebles, nada de otra cuenta y ningún secreto |
| C13 | Aislamiento (R13) | La usuaria A pide un inmueble de B: 404 |
| C14 | Registro con email no invitado (R1b) | Lista `ana@ejemplo.test`; se registra `luis@ejemplo.test`: error `REGISTRO_CERRADO`, no se crea la cuenta ni se envía ningún email |
| C14b | Registro con email invitado (R1b) | Lista ` Ana@Ejemplo.test , otra@ejemplo.test`; se registra `ana@ejemplo.test`: cuenta creada y email de verificación enviado |
| C14c | Google no invitado (R1b) | Desde el registro, con términos aceptados y un email fuera de la lista: no se crea la cuenta y vuelve al registro con `REGISTRO_CERRADO` |
| C14d | Cuenta existente fuera de la lista (R1b) | Una cuenta creada antes entra con su contraseña y con Google aunque su email no esté en la lista |
| C14e | Lista vacía o `*` (R1b) | Sin la variable, nadie se registra; con `*`, cualquiera |

## Fuera de alcance

- Inicio de sesión con teléfono o verificación por SMS (se decidirá con el modelo de monetización).
- Varias personas por cuenta (copropietarios, gestorías).
- Inicio de sesión con Apple u otros proveedores.
- Invitar desde la app (enviar el email de invitación, gestionar la lista en una pantalla): de momento la lista se edita en Vercel.

## Envío de emails

Verificación y recuperación con **Amazon SES** en Estocolmo (`eu-north-1`; misma cuenta y DPA de AWS).

Remitente `Inquilinus <no-reply@inquilinus.es>`, con el dominio verificado en SES (DKIM, MAIL FROM `correo.inquilinus.es` y DMARC) y SES fuera del modo de pruebas desde el 23-11-2026: los emails llegan a cualquier dirección, así que quién se registra lo decide R1b.

## Tareas

- [x] Configurar Better Auth: email y contraseña, Google, TOTP y código por email, vinculación de cuentas
- [x] Límite de intentos (el límite mensual de IA, R12, se hace con la spec 003 en la fase 5)
- [x] Pantallas de registro, acceso, recuperación y ajustes de cuenta
- [x] Exportar y borrar cuenta (los ficheros se añaden con S3 en la fase 3)
- [ ] Textos legales y aceptación versionada (con asesoría): borrador y aceptación versionada hechos; falta la revisión del asesor (tarea 2.9)
- [x] Registro por invitación (R1b) con sus tests C14–C14e · `feat/008-registro-invitacion`
- [ ] Tests C1–C13 (hechos: C1–C10c y C12–C12b; faltan C11 con la fase 5 y C13 con los inmuebles en la fase 3)
