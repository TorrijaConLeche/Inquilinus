# RGPD — Medidas desde el inicio

Estado: borrador · Revisar con un asesor antes de la fase 3

La propietaria es **responsable del tratamiento** de los datos de sus inquilinos. Cuando otros propietarios usen la app, la app pasará a ser **encargada del tratamiento** para ellos. Este documento recoge lo que se cumple desde la v1; lo marcado con ⚖️ debe validarlo un asesor.

## Datos que se tratan

| Dato | Para qué | Base legal (orientativa ⚖️) |
| --- | --- | --- |
| Nombre del inquilino (único dato de su ficha) | Gestionar el contrato | Ejecución del contrato |
| Fechas de estancia, cobros, repartos | Calcular y cobrar alquiler y suministros | Ejecución del contrato |
| Contrato firmado y justificante de la fianza | Prueba del contrato y de la fianza | Ejecución del contrato |
| Facturas de suministros | Repartir el gasto | Ejecución del contrato |

## Medidas técnicas (v1)

- **Datos en la UE:** base de datos, ficheros, copias de seguridad y la IA (Bedrock, perfil EU) alojados en regiones de la UE.
- **Cifrado:** TLS en todas las conexiones; cifrado en reposo en base de datos, copias y ficheros.
- **Ficheros privados:** bucket sin acceso público; descarga solo con URL firmada de pocos minutos, generada tras comprobar permisos.
- **Aislamiento:** cada consulta se filtra por la usuaria propietaria del inmueble; tests que lo verifiquen.
- **Minimización en la IA:** solo se envía el PDF de la factura y los nombres de los tipos de gasto del inmueble. Los contratos y justificantes nunca pasan por la IA. Bedrock no usa los datos para entrenar.
- **Enlace del inquilino:** token aleatorio largo, guardado como hash; revocable; caduca 3 meses después de la salida; páginas con `noindex` y sin caché; solo muestra datos de esa estancia; de los demás, solo el nombre de pila en el detalle del cálculo, nunca lo que pagan o deben, ni documentos ni datos de contacto (spec 004).
- **Minimización en la ficha:** del inquilino solo se guarda el nombre; ni DNI, ni email, ni teléfono (spec 007). Como documentos, solo el contrato y el justificante de la fianza; no se guardan DNI ni nóminas.
- **Logs sin datos personales:** ni DNI, ni nombres, ni contenido de facturas en los logs ni en los errores enviados a monitorización. Lo garantiza el registro de la API (`apps/api/src/registro.ts`): lista cerrada de campos, rutas por su patrón y errores sin su mensaje.
- **Acceso:** autenticación con Better Auth; doble factor disponible; secretos fuera del código.
- **Derechos del inquilino:** exportar sus datos (acceso y portabilidad) y borrarlos o anonimizarlos (ver modelo de datos).

## Subencargados

| Proveedor | Uso | Ubicación de los datos | Garantías |
| --- | --- | --- | --- |
| Vercel | Web y API | Funciones en Frankfurt | DPA |
| Neon | Base de datos | Región UE | DPA |
| AWS | Ficheros (S3), IA (Bedrock, perfil EU) y emails (SES) | Estocolmo (`eu-north-1`); Bedrock con el perfil EU | DPA; Bedrock no entrena con los datos |
| Paddle | Cobro de suscripciones como vendedor oficial (spec 010) | Reino Unido y otros | Trata los datos de pago como responsable propio; revisar sus condiciones ⚖️. La app no guarda datos de tarjeta |
| Google | Inicio de sesión con Google (spec 008) | — | Elegido por la usuaria; solo email y perfil básico |

Los tres son proveedores estadounidenses con datos alojados en la UE; las garantías de transferencia (cláusulas tipo o marco UE-EE. UU.) se comprueban al aceptar cada DPA ⚖️.

## Conservación ⚖️

- Durante la estancia: todo.
- Al terminar: el justificante de la fianza se conserva hasta su devolución y el plazo legal posterior ⚖️.
- Contratos, cobros, repartos y facturas: se conservan mientras haya obligaciones legales o fiscales; plazo exacto a validar. Después, borrado o anonimización.
- La app avisa a la propietaria cuando un dato alcanza su plazo.

## Medidas organizativas

| Medida | Cuándo |
| --- | --- |
| Lista de subencargados (hosting, almacenamiento, Bedrock) con sus contratos de encargo (DPA) aceptados | Al contratar cada proveedor |
| Cláusula informativa para los inquilinos (qué datos, para qué, cuánto tiempo, derechos) ⚖️ | Fase 2, antes de usarla con inquilinos reales |
| Registro de actividades de tratamiento | Fase 2 (versión simple) |
| Procedimiento de brechas de seguridad (notificar a la AEPD en 72 h si procede) | Fase 2 |
| Política de privacidad y términos ⚖️ | Antes de difundir la app: el registro es libre desde el principio (spec 008) |
| Contrato de encargo (DPA) para otros propietarios ⚖️ | Antes de que la use otra propietaria |
