# 008 · Cuenta e inicio de sesión

Estado: aprobada · Paquetes: `apps/api` (Better Auth), `apps/web`

## Objetivo

Cualquier propietaria puede crear su cuenta, con email y contraseña o con Google, y acceder a sus datos de forma segura. Una persona por cuenta.

## Reglas

**Registro y acceso**

- **R1** — Se puede entrar con **email y contraseña** o con **Google**. El registro es libre desde el principio.
- **R2** — Con email y contraseña, la cuenta no se puede usar hasta verificar el email con el enlace que se envía. Con Google, el email ya viene verificado.
- **R3** — Si ya existe una cuenta con ese email y se entra con Google (con email verificado por Google), las dos formas de acceso se vinculan a la misma cuenta.
- **R4** — Al registrarse hay que aceptar la política de privacidad y los términos. Se guarda la fecha y la versión aceptada ⚖️.
- **R5** — Contraseña de al menos 12 caracteres, sin reglas de composición. Se rechazan las contraseñas más comunes. Se guarda solo su hash (algoritmo de Better Auth).
- **R6** — Recuperación de contraseña con un enlace por email, de un solo uso y válido 1 hora. El mensaje es el mismo exista o no el email.
- **R7** — Doble factor **opcional** con una app de autenticación (TOTP), con códigos de recuperación.

**Sesión**

- **R8** — Sin "recordar este dispositivo", la sesión termina al cerrar el navegador. Con él, dura **30 días** y después vuelve a pedir el acceso.
- **R9** — La sesión va en una cookie técnica `HttpOnly`, `Secure` y `SameSite=Lax`. La app solo usa cookies técnicas, exentas de consentimiento según la guía de cookies de la AEPD, así que no hay banner de cookies. Si algún día se añade analítica, habrá que pedir consentimiento.
- **R10** — Desde los ajustes se puede cerrar la sesión en todos los dispositivos.

**Seguridad y abuso**

- **R11** — Tras 5 intentos fallidos en 15 minutos (por cuenta o por IP), se bloquean los intentos durante 15 minutos. El mensaje de error es genérico: "Email o contraseña incorrectos".
- **R12** — Cada cuenta tiene un límite de 100 facturas leídas por IA al mes, para acotar el coste. Al alcanzarlo, se pueden seguir subiendo facturas y rellenarlas a mano.

**Datos de la cuenta (RGPD)**

- **R13** — Una persona por cuenta. Todo (inmuebles, inquilinos, facturas) pertenece a una cuenta y ninguna consulta cruza cuentas.
- **R14** — La propietaria puede **exportar** todos sus datos (JSON y ficheros) y **borrar su cuenta**. Borrarla elimina todo, incluidos los ficheros, con confirmación escribiendo su email.
- **R15** — De la cuenta se guarda solo el email, el nombre (opcional) y el método de acceso. Con Google se piden solo los permisos de email y perfil básico.

## Casos de prueba

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Registro con email (R2) | Cuenta creada pero bloqueada hasta verificar el email |
| C2 | Contraseña corta (R5) | Con 10 caracteres, error de validación |
| C3 | Contraseña común (R5) | "password1234" rechazada |
| C4 | Intentos fallidos (R11) | Al sexto fallo en 15 minutos, bloqueo de 15 minutos |
| C5 | Google, email nuevo (R1, R2) | Cuenta creada y verificada |
| C6 | Google, email existente (R3) | Se vincula a la cuenta existente; mismos inmuebles |
| C7 | Recuperación, email inexistente (R6) | Mismo mensaje que con un email existente |
| C8 | Enlace de recuperación reutilizado (R6) | El segundo uso da error |
| C9 | Recordar dispositivo (R8) | Sesión válida el día 30; el día 31 pide acceso |
| C10 | Doble factor (R7) | Con 2FA activo, pide el código tras la contraseña |
| C11 | Límite de IA (R12) | La factura 101 del mes no llama a la IA; se rellena a mano |
| C12 | Borrar cuenta (R14) | No queda ningún dato ni fichero de la cuenta |
| C13 | Aislamiento (R13) | La usuaria A pide un inmueble de B: 404 |

## Fuera de alcance

- Inicio de sesión con teléfono o verificación por SMS (se decidirá con el modelo de monetización).
- Varias personas por cuenta (copropietarios, gestorías).
- Inicio de sesión con Apple u otros proveedores.

## Preguntas abiertas

- **P1** — Servicio de envío de emails (verificación y recuperación) alojado en la UE: por decidir al montar la infraestructura.

## Tareas

- [ ] Configurar Better Auth: email y contraseña, Google, TOTP, vinculación de cuentas
- [ ] Límite de intentos y límite mensual de IA
- [ ] Pantallas de registro, acceso, recuperación y ajustes de cuenta
- [ ] Exportar y borrar cuenta
- [ ] Textos legales y aceptación versionada (con asesoría)
- [ ] Tests C1–C13
