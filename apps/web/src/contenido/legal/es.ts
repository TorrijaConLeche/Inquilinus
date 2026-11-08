// Política de privacidad y términos de uso en español (tarea 2.8).
// BORRADOR pendiente de revisión por un asesor (tarea 2.9). Los huecos
// «[pendiente: …]» los rellena la titular; los «⚖️» los valida el asesor.
// Formato Markdown: lo convierte a HTML `TextoLegal`.

export const privacidad = `
**Borrador pendiente de revisión legal.** Este texto aún no es definitivo.

Esta política explica qué datos personales trata Inquilinus, para qué, durante cuánto tiempo y qué derechos tienes. Intentamos guardar lo mínimo y explicarlo con claridad.

## 1. Quién es el responsable

- **Responsable:** [pendiente: nombre y apellidos o razón social]
- **NIF:** [pendiente: NIF]
- **Domicilio:** [pendiente: dirección postal]
- **Contacto para privacidad:** [pendiente: email de contacto]

## 2. Qué datos tratamos y para qué

### Tu cuenta

- **Email**, para identificarte, enviarte los avisos de la cuenta (confirmación, recuperación de contraseña, códigos de acceso) y contestarte.
- **Nombre**, si decides indicarlo.
- **Contraseña**, guardada solo como resumen cifrado (hash): nadie, ni siquiera nosotros, puede leerla.
- **Forma de acceso**: con email y contraseña o con Google. Si entras con Google solo recibimos tu email y tu nombre; no guardamos tu foto.
- **Aceptación de esta política y de los términos**: qué versión aceptaste y cuándo.
- **Verificación en dos pasos**, si la activas: la clave de tu app de autenticación y tus códigos de recuperación, guardados cifrados.
- **Preferencias**: idioma y apariencia de la app.

### Seguridad de la cuenta

- **Sesiones abiertas**: fecha, dirección IP y navegador de cada sesión, para que puedas cerrarlas y para detectar accesos extraños.
- **Intentos de acceso fallidos**: para bloquear durante 15 minutos los intentos tras 5 fallos. Se guardan como una huella cifrada del email y de la IP, que no permite saber cuáles son.
- **Registros técnicos** de funcionamiento, que no contienen datos personales.

### Los datos de tus inmuebles e inquilinos

Para gestionar tus alquileres introduces datos de tus inquilinos: su nombre, sus fechas de estancia, los cobros, las facturas de suministros, el contrato y el justificante de la fianza. No pedimos ni guardamos DNI, nóminas, teléfonos ni emails de tus inquilinos.

**Sobre esos datos tú eres la responsable del tratamiento** y Inquilinus los trata por tu cuenta, solo para prestarte el servicio, como **encargado del tratamiento**. Las condiciones de ese encargo están en [pendiente: contrato de encargo del tratamiento (tarea 7.4)] ⚖️. Debes informar a tus inquilinos de que usas Inquilinus para gestionar sus datos.

### Lectura de facturas con inteligencia artificial

Cuando subes una factura de suministros, enviamos **solo el PDF de esa factura** y los nombres de tus tipos de gasto a un modelo de inteligencia artificial (Claude, de Anthropic, a través de Amazon Bedrock en la Unión Europea) para proponerte el periodo, el importe y el tipo de gasto. Tú revisas siempre la propuesta antes de que se use. El proveedor **no usa tus facturas para entrenar** sus modelos. Los contratos y justificantes de fianza **nunca** se envían a la inteligencia artificial.

### Pagos (cuando haya planes de pago)

Los pagos de las suscripciones los gestiona **Paddle** como vendedor oficial: es Paddle quien te cobra, emite la factura y trata tus datos de pago como responsable propio, según su propia política de privacidad. Inquilinus nunca ve ni guarda los datos de tu tarjeta; solo recibe los identificadores de tu cliente y de tu suscripción y su estado.

## 3. Por qué podemos tratarlos (base legal) ⚖️

- **Contrato:** para crear y mantener tu cuenta y prestarte el servicio que pides.
- **Interés legítimo:** para proteger tu cuenta y el servicio frente a accesos indebidos y abusos (sesiones, intentos fallidos, registros técnicos).
- **Obligación legal:** para cumplir las obligaciones fiscales y contables cuando haya pagos.

No usamos tus datos para publicidad ni los vendemos.

## 4. Cuánto tiempo los guardamos ⚖️

- **Mientras tengas la cuenta.** Si la borras, se eliminan en ese momento todos sus datos, incluidos los de tus inmuebles e inquilinos y sus ficheros.
- **Copias de seguridad:** nuestro proveedor de base de datos guarda copias durante un tiempo limitado; los datos borrados desaparecen de ellas cuando se renuevan [pendiente: plazo de retención de las copias] ⚖️.
- **Sesiones:** como máximo 30 días.
- **Datos de facturación** (cuando haya pagos): el tiempo que exija la ley fiscal.

## 5. Con quién los compartimos

Solo con los proveedores que necesitamos para funcionar, con los que tenemos un contrato que les obliga a proteger los datos y a usarlos únicamente para prestarnos el servicio:

| Proveedor | Para qué | Dónde están los datos |
| --- | --- | --- |
| Vercel | Servir la web y la API | Unión Europea (Fráncfort) |
| Neon | Base de datos | Unión Europea (Fráncfort) |
| Amazon Web Services | Ficheros, envío de emails e inteligencia artificial | Unión Europea (Estocolmo y regiones de la UE) |
| Google | Inicio de sesión con Google, si lo eliges | Según tu cuenta de Google |
| Paddle | Cobro de las suscripciones, cuando las haya | Según su política de privacidad |

Vercel, Neon y Amazon son empresas estadounidenses, pero tus datos se alojan en la Unión Europea. Cualquier acceso desde fuera de la UE está cubierto por las garantías del Reglamento General de Protección de Datos (cláusulas contractuales tipo o el Marco de Privacidad de Datos UE-EE. UU.) ⚖️.

No cedemos tus datos a nadie más, salvo obligación legal.

## 6. Tus derechos

Puedes **acceder** a tus datos, **rectificarlos**, **suprimirlos**, **oponerte** a su tratamiento, pedir que lo **limitemos** y llevártelos a otro servicio (**portabilidad**).

- Desde **Ajustes → Tus datos** puedes descargar todos tus datos y borrar tu cuenta en cualquier momento.
- Para lo demás, escríbenos a [pendiente: email de contacto].
- Si crees que no hemos atendido bien tus derechos, puedes reclamar ante la **Agencia Española de Protección de Datos** (www.aepd.es).

Si eres inquilino de una propietaria que usa Inquilinus, dirígete primero a ella: es la responsable de tus datos.

## 7. Cómo los protegemos

Conexiones cifradas, datos cifrados en reposo, ficheros en un almacenamiento privado al que solo se accede con enlaces temporales tras comprobar permisos, cada cuenta aislada de las demás, verificación en dos pasos disponible y registros técnicos sin datos personales.

## 8. Cookies

Solo usamos **cookies técnicas**, necesarias para que la app funcione, por lo que no necesitan tu consentimiento:

- **Sesión** (\`inquilinus.session_token\` y relacionadas): mantenerte dentro de tu cuenta.
- **Verificación en dos pasos e inicio con Google**: cookies temporales del proceso de acceso.
- **Preferencias** (\`idioma\`, \`tema\`): recordar tu idioma y tu apariencia.

No usamos cookies de analítica ni de publicidad. Si algún día las usáramos, te pediríamos permiso antes.

## 9. Edad

Inquilinus está pensado para propietarias y propietarios mayores de edad. No está dirigido a menores de 18 años.

## 10. Cambios en esta política

Si la cambiamos de forma importante, te avisaremos en la app o por email antes de que se aplique. Cada versión lleva su fecha.
`;

export const terminos = `
**Borrador pendiente de revisión legal.** Este texto aún no es definitivo.

Estos términos regulan el uso de Inquilinus. Al crear tu cuenta los aceptas. Los hemos escrito para que se entiendan; si algo no está claro, escríbenos.

## 1. Quién presta el servicio

Inquilinus lo presta [pendiente: nombre y apellidos o razón social], con NIF [pendiente: NIF] y domicilio en [pendiente: dirección postal]. Contacto: [pendiente: email de contacto].

## 2. Qué es Inquilinus

Una aplicación web para que propietarias y propietarios gestionen sus alquileres: inmuebles, habitaciones, inquilinos, cobros de alquiler, facturas de suministros y su reparto entre los inquilinos, y un enlace para que cada inquilino vea su desglose.

## 3. Tu cuenta

- Debes ser mayor de edad y dar un email que sea tuyo.
- La cuenta es personal: una persona por cuenta.
- Eres responsable de guardar tu contraseña. Te recomendamos activar la verificación en dos pasos.
- Si crees que alguien ha entrado en tu cuenta, cambia la contraseña y cierra las sesiones desde **Ajustes**.

## 4. Uso aceptable

- Usa Inquilinus para inmuebles que te pertenecen o que gestionas legítimamente.
- Los datos de tus inquilinos deben ser lícitos y necesarios. **Tú eres la responsable de esos datos** y debes informar a tus inquilinos de que los gestionas con Inquilinus ⚖️.
- No subas documentos de identidad, nóminas ni datos que no sean necesarios.
- No intentes acceder a datos de otras cuentas, saltarte los límites del servicio ni dañar su funcionamiento.

## 5. Tus datos son tuyos

Todo lo que introduces sigue siendo tuyo. Solo lo usamos para prestarte el servicio, como explica la **política de privacidad**. Puedes descargarlo y borrarlo cuando quieras desde **Ajustes → Tus datos**.

## 6. Inteligencia artificial y cálculos

- La lectura de facturas con inteligencia artificial **propone** el periodo, el importe y el tipo de gasto. **Tú revisas y confirmas** siempre antes de que se use. Puede equivocarse.
- Los repartos y cobros se calculan con las reglas que se explican en la app. Son una ayuda: revisa los importes antes de cobrarlos.
- Inquilinus no ofrece asesoramiento legal ni fiscal.

## 7. El enlace del inquilino

Tú decides con quién compartes el enlace de cada inquilino y puedes revocarlo en cualquier momento. Cada enlace solo muestra lo que corresponde a esa estancia.

## 8. Planes y precios

- **Starter:** gratis. Un inmueble y 2 facturas leídas con inteligencia artificial al mes.
- **Advanced:** 4,99 € al mes o 49,90 € al año, IVA incluido. Hasta 10 inmuebles y lectura de facturas sin límite práctico.
- Los pagos los gestiona **Paddle** como vendedor oficial, con sus propias condiciones de compra. Paddle te emite la factura.
- Puedes cancelar cuando quieras: el plan sigue activo hasta el final del periodo pagado y después pasa a Starter. **No se borra nada**: si tienes más de un inmueble, eliges cuál sigue activo y los demás quedan bloqueados hasta que vuelvas a Advanced.
- Si cambiamos los precios, te avisaremos con al menos 30 días de antelación y podrás cancelar antes de que se aplique.
- Derecho de desistimiento y devoluciones: [pendiente: condiciones según la ley de consumidores y las de Paddle] ⚖️.

Los planes de pago estarán disponibles más adelante; hasta entonces, Inquilinus es gratuito.

## 9. Disponibilidad

Trabajamos para que Inquilinus funcione siempre y tus datos estén seguros, pero puede haber interrupciones por mantenimiento o fallos. Te recomendamos descargar tus datos de vez en cuando.

## 10. Responsabilidad ⚖️

Respondemos de los daños que causemos por no cumplir estos términos, en los términos que establece la ley. No respondemos del uso que hagas de los cálculos ni de los datos que introduzcas. Nada de lo anterior limita los derechos que te reconoce la ley como consumidora.

## 11. Baja y suspensión

- Puedes borrar tu cuenta en cualquier momento desde **Ajustes → Tus datos**.
- Podemos suspender o cerrar una cuenta que incumpla gravemente estos términos, avisándote antes salvo que no sea posible.

## 12. Cambios en los términos

Si los cambiamos de forma importante, te avisaremos con antelación en la app o por email y te pediremos que aceptes la nueva versión. Cada versión lleva su fecha.

## 13. Ley aplicable

Estos términos se rigen por la ley española. Si eres consumidora, puedes acudir a los tribunales de tu domicilio ⚖️.
`;
