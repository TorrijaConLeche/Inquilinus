# RGPD

Estado: revisado en la tarea 6.6 (21-11-2026) contra lo que hace la app. Lo marcado con ⚖️ lo valida el asesor (tareas 2.9 y 6.7); lo de «Por comprobar», la titular.

## Quién es quién

| Datos | Responsable | Inquilinus es… | Dónde se explica |
| --- | --- | --- | --- |
| La cuenta de cada propietaria (email, sesiones, preferencias…) | Inquilinus (su titular) | Responsable | Política de privacidad |
| Los datos de los inquilinos de cada propietaria | Cada propietaria | **Encargada del tratamiento** (art. 28 RGPD): los trata solo por cuenta de la propietaria y para prestarle el servicio | Contrato de encargo (borrador en [`docs/legal/contrato-encargo.md`](legal/contrato-encargo.md)) |

**Informar a los inquilinos** (arts. 13 y 14 RGPD) es una obligación de cada propietaria, la misma que tendría sin la app. Inquilinus no lo hace por ella: la política de privacidad, los términos y el contrato de encargo se lo recuerdan. La titular, como propietaria que también usa la app, lo cumple con sus inquilinos fuera del proyecto.

## Datos que se tratan

### Cuentas de las propietarias (Inquilinus, responsable)

| Dato | Para qué | Base legal (orientativa ⚖️) |
| --- | --- | --- |
| Email, nombre (opcional), contraseña (solo su hash), forma de acceso (email o Google) | Crear y mantener la cuenta | Contrato |
| Aceptación de la política y los términos (versión y fecha) | Probar qué aceptó | Contrato y obligación legal |
| Verificación en dos pasos (clave y códigos, cifrados) | Proteger la cuenta | Contrato |
| Sesiones (fecha, IP y navegador) e intentos fallidos (huella cifrada de email e IP) | Seguridad y frenar ataques | Interés legítimo |
| Preferencias (idioma, tema) en cookies técnicas | Que la app funcione como eligió | Contrato |
| Suscripción (identificadores de Paddle y estado), cuando haya planes de pago | Saber qué plan tiene | Contrato |

### Datos de los inquilinos (encargo de cada propietaria)

| Dato | Para qué | Notas |
| --- | --- | --- |
| Nombre del inquilino | Identificarlo en sus cobros y repartos | Único dato de su ficha: ni DNI, ni email, ni teléfono (spec 007) |
| Estancias: habitación, entrada y salida | Calcular alquiler y reparto por días | |
| Cobros de alquiler y su pago | Saber qué debe y qué ha pagado | Foto fija (spec 005) |
| Facturas de suministros (PDF) y su reparto, partes y pagos | Repartir los gastos | El PDF puede llevar datos del titular del suministro |
| Liquidaciones | Agrupar facturas para cobrarlas juntas | Su nombre lo escribe la propietaria |
| Contrato firmado (PDF) | Prueba del contrato | **Puede contener datos identificativos** (DNI, domicilio…): se guarda como lo sube la propietaria, privado, nunca pasa por la IA y nunca se ve en el enlace |
| Justificante y datos de la fianza (importe, fechas, notas de hasta 300 caracteres) | Registrar la fianza y su devolución | Las notas son para los descuentos; la app pide no poner datos personales en ellas |
| Histórico de actividad (spec 012) | Que la propietaria pueda aclarar cualquier duda | Solo ids, importes y fechas, y nombres que no son personales (habitaciones, tipos de gasto, liquidaciones). El nombre del inquilino se busca al leer: si se borra, sale «Inquilino N» |
| Enlace del inquilino | Que vea lo suyo sin cuenta (spec 004) | Solo el hash del token, si permite descargar y si está revocado |

**En la ficha del inquilino no se guardan** DNI, nóminas, emails ni teléfonos. El contrato en PDF sí puede llevar datos identificativos (ver la tabla).

### Qué ve cada inquilino con su enlace

La propietaria decide si genera el enlace, a quién lo da y cuándo lo revoca (es una instrucción suya como responsable). Con él, el inquilino ve **lo suyo**: lo que debe, sus cobros, su parte de cada gasto con el cálculo, sus liquidaciones, su fianza y, si la propietaria lo permite, los PDF de sus facturas.

De **los demás** solo ve lo necesario para entender el reparto: su **nombre de pila** y las **fechas de sus estancias** (en el timeline y en el cálculo por tramos). Nunca ve lo que pagan o deben los demás, ni sus documentos, ni datos de contacto (spec 004, R6c, R7b y R9). Así consta en el contrato de encargo (punto 3), para que cada propietaria lo sepa ⚖️.

## Medidas técnicas

- **Datos en la UE**, comprobado: funciones de Vercel en Fráncfort (`fra1`), base de datos de Neon en Fráncfort (`eu-central-1`), ficheros y emails de AWS en Estocolmo (`eu-north-1`). La IA (Bedrock) aún no está activa (tarea 5.1); cuando se active, la app solo la usa con una región de la UE y el modelo base o el perfil de la UE, nunca el perfil global, y si no se cumple no la activa (spec 003, R10b). Además, el permiso de IAM del usuario de la app solo deja invocar el modelo con el perfil de la UE y en regiones `eu-*`.
- **Cifrado** en todas las conexiones (TLS) y en reposo (base de datos y ficheros; ver «Por comprobar» del bucket).
- **Ficheros privados**: se descargan solo con una URL firmada de 5 minutos, generada tras comprobar permisos. Las subidas sin confirmar se borran al día siguiente (regla de ciclo de vida).
- **Mínimo privilegio**: el usuario de AWS de la app trabaja solo con los ficheros; comprobado que no puede ni leer la configuración del bucket.
- **Aislamiento entre cuentas**: cada consulta se filtra por la propietaria, y cada ruta nueva lleva un test de aislamiento.
- **Peticiones desde otras webs (CSRF)**: lo que cambia datos solo se acepta desde la propia app (cabecera `Origin`).
- **Acceso**: Better Auth, bloqueo de 15 minutos tras 5 intentos fallidos, verificación en dos pasos y secretos fuera del código.
- **Enlace del inquilino**: token aleatorio de 256 bits del que solo se guarda el hash (se ve una vez, al generarlo); revocable y regenerable; caduca 3 meses después de la última salida. Un enlace revocado, caducado o inventado da el mismo mensaje, sin decir por qué. La vista y su API llevan `noindex`, `Cache-Control: private, no-store` y `Referrer-Policy: no-referrer`. El PDF solo se descarga si la propietaria lo permite y la factura es de ese inquilino.
- **Minimización en la IA**: a la IA solo llegan el PDF de la factura y los nombres de los tipos de gasto (un test lo comprueba). Los contratos y justificantes nunca se le envían. Bedrock no entrena con los datos. Si la lectura falla, el registro solo guarda un código, nunca el contenido de la factura ni la respuesta de la IA.
- **Histórico de solo lectura**: no hay forma de editar ni borrar una actividad. Al borrar la cuenta o el inmueble, se borra con ellos.
- **Logs sin datos personales**: el registro de la API (`apps/api/src/registro.ts`) usa una lista cerrada de campos, guarda las rutas por su patrón (nunca la URL real, ni el token del enlace) y los errores sin su mensaje.
- **Riesgo conocido**: Vercel guarda por su cuenta registros de cada petición con la **ruta completa y la IP**. En las del enlace del inquilino, la ruta lleva el token. Solo los ve quien entra en la cuenta de Vercel (la titular), se guardan poco tiempo (ver «Por comprobar») y un token expuesto se anula regenerando el enlace.

## Derechos de los interesados

- **Propietarias**: desde Ajustes descargan todos sus datos en JSON (acceso y portabilidad, sin secretos) y borran su cuenta con todo lo suyo (supresión), escribiendo su email para confirmar (spec 008, R14). Para lo demás, escriben al contacto de privacidad.
- **Inquilinos**: ejercen sus derechos ante su propietaria, que es la responsable. Inquilinus le da las herramientas y la ayuda si hace falta (contrato de encargo):
  - **Acceso**: el enlace muestra todo lo de su dinero; la propietaria puede descargar además todos los datos de su cuenta.
  - **Rectificación**: la propietaria edita nombre, estancias, importes y pagos.
  - **Supresión**: cuando ya no vive allí, borrar al inquilino borra sus documentos, su fianza, sus ficheros y su enlace; si tiene cobros o repartos, su nombre se sustituye por «Inquilino N» para que las cuentas sigan cuadrando (spec 007, R12).
  - **Limitación y oposición**: la propietaria revoca su enlace o archiva lo que corresponda.
  - Hoy **no hay una descarga solo de un inquilino**: se atiende con el enlace y la descarga de la cuenta. Se valorará si alguna propietaria lo necesita.

## Subencargados

| Proveedor | Para qué | Datos | Ubicación | Garantías |
| --- | --- | --- | --- | --- |
| Vercel | Servir la web y la API | Todo lo que pasa por la app, en tránsito; registros de peticiones | Funciones en Fráncfort | DPA |
| Neon | Base de datos y sus copias | Todos los datos de la app | Fráncfort | DPA |
| AWS | Ficheros (S3) y emails de la cuenta (SES); IA (Bedrock) cuando se active | PDF subidos; email de la propietaria; PDF de facturas para la IA | Estocolmo; Bedrock con el perfil EU | DPA; Bedrock no entrena con los datos |
| Google | Inicio de sesión con Google, si la propietaria lo elige | Email y nombre de la propietaria | Su cuenta de Google | Responsable propio de su servicio de acceso ⚖️ |
| Paddle | Cobro de suscripciones como vendedor oficial (fase 8, aún no activo) | Datos de pago de la propietaria | Reino Unido y otros | Responsable propio; la app no guarda datos de tarjeta ⚖️ |

Vercel, Neon y AWS son empresas estadounidenses con los datos alojados en la UE. Las garantías ante un acceso desde fuera de la UE (cláusulas contractuales tipo o Marco de Privacidad de Datos UE-EE. UU.) se comprueban al aceptar cada DPA ⚖️. GitHub guarda el código, que no lleva datos personales (los tests usan datos inventados): no es subencargado.

## Conservación

- **Cuentas**: hasta que la propietaria la borra; entonces se borra todo en ese momento, incluidos sus inmuebles, inquilinos y ficheros.
- **Sesiones**: como máximo 30 días.
- **Datos de inquilinos**: los conserva la propietaria mientras los necesite. Ella decide cuándo borrarlos; los plazos legales o fiscales que le aplican los fija el asesor ⚖️, y la app avisará cuando venza alguno (tarea 6.6b, spec 007, R14).
- **Subidas sin confirmar**: se borran al día siguiente.
- **Enlaces revocados**: se guardan (solo el hash) hasta que se borra el inquilino, para que nunca vuelvan a funcionar.
- **Copias de seguridad de Neon** y **registros de Vercel**: lo que dure cada uno según el plan contratado (ver «Por comprobar»). Lo borrado desaparece de ellos al renovarse.

## Brechas de seguridad

1. **Detectar y contener**: revocar o regenerar los enlaces afectados, cerrar sesiones, rotar los secretos (`BETTER_AUTH_SECRET`, `CRON_SECRET`, claves de AWS y de la base de datos) y corregir el fallo.
2. **Evaluar**: qué datos, de quién, desde cuándo y qué riesgo tiene para las personas.
3. **Avisar**:
   - Si afecta a datos de **inquilinos**, a cada propietaria afectada, **sin dilación indebida** (art. 33.2) y con lo que se sepa: qué ha pasado, qué datos, a cuántas personas, qué se ha hecho. Es ella, como responsable, quien decide si avisa a la AEPD y a sus inquilinos. El plazo con el que Inquilinus se compromete está en el contrato de encargo ⚖️.
   - Si afecta a datos de las **cuentas** (Inquilinus es responsable): a la AEPD en un máximo de 72 horas si hay riesgo, y a las propietarias si el riesgo es alto (arts. 33 y 34).
4. **Registrar** cada brecha, aunque no haga falta notificarla: qué pasó, sus efectos y qué se hizo (art. 33.5).

## Registro de actividades de tratamiento (borrador ⚖️)

**Como responsable** (art. 30.1): «Cuentas de usuarias de Inquilinus».

- **Finalidad**: prestar el servicio, proteger las cuentas y, cuando haya pagos, cumplir con Hacienda.
- **Datos y personas**: los de la tabla de cuentas; las propietarias.
- **Destinatarios**: los subencargados de arriba; Paddle como responsable propio.
- **Conservación**: la de arriba.
- **Medidas**: las de este documento.

**Como encargada** (art. 30.2): «Gestión de alquileres por cuenta de cada propietaria».

- **Responsables**: cada propietaria con cuenta.
- **Categorías de tratamiento**: guardar y calcular cobros y repartos, leer facturas con IA y mostrar a cada inquilino lo suyo.
- **Datos y personas**: los de la tabla de inquilinos.
- **Subencargados y transferencias**: los de arriba.
- **Medidas**: las de este documento.

## Medidas organizativas

| Medida | Estado |
| --- | --- |
| Este documento al día con lo que hace la app | Hecho en la tarea 6.6; repasarlo con cada spec que toque datos personales |
| Contrato de encargo para las propietarias ⚖️ | Borrador en `docs/legal/contrato-encargo.md`; lo revisa el asesor (tarea 6.7) y se publica en la app (tarea 7.3) antes de la beta con otras propietarias (tarea 7.4) |
| Política de privacidad y términos ⚖️ | Borradores publicados (tarea 2.8); los revisa el asesor (2.9) |
| Lista de subencargados con sus DPA aceptados | Arriba; aceptar o confirmar cada DPA (ver «Por comprobar») |
| Registro de actividades de tratamiento ⚖️ | Borrador arriba |
| Procedimiento de brechas | Arriba |
| Avisos de plazos de conservación | Tarea 6.6b, cuando el asesor fije los plazos |
| Informar a los inquilinos | De cada propietaria (ver «Quién es quién»); no es tarea del proyecto |

## Por comprobar (titular)

- [ ] **AWS, bucket de producción y el de previsualizaciones**: «Block Public Access» activado entero; cifrado por defecto (SSE-S3 o SSE-KMS); **versionado desactivado**, o con una regla que borre las versiones antiguas en pocos días (si no, un PDF «borrado» seguiría guardado como versión anterior).
- [ ] **Neon**: cuánto tiempo guarda el historial para restaurar (copias) en el plan actual, para ponerlo en la política de privacidad.
- [ ] **Vercel**: cuánto tiempo guarda los registros de peticiones en el plan actual.
- [ ] **DPA aceptados** de Vercel, Neon y AWS, con sus garantías de transferencia; guardar una copia o el enlace de cada uno.
- [ ] **Doble factor** activado en las cuentas de Vercel, Neon, AWS, GitHub y Google Cloud.
