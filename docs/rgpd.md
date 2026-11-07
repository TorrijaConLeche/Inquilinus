# RGPD — Medidas desde el inicio

Estado: borrador · Revisar con un asesor antes de la fase 3

La propietaria es **responsable del tratamiento** de los datos de sus inquilinos. Cuando otros propietarios usen la app, la app pasará a ser **encargada del tratamiento** para ellos. Este documento recoge lo que se cumple desde la v1; lo marcado con ⚖️ debe validarlo un asesor.

## Datos que se tratan

| Dato | Para qué | Base legal (orientativa ⚖️) |
| --- | --- | --- |
| Nombre, contacto, DNI del inquilino | Gestionar el contrato | Ejecución del contrato |
| Fechas de estancia, cobros, repartos | Calcular y cobrar alquiler y suministros | Ejecución del contrato |
| Nóminas, contratos firmados | Solvencia y prueba del contrato | Ejecución del contrato / interés legítimo |
| Facturas de suministros | Repartir el gasto | Ejecución del contrato |

## Medidas técnicas (v1)

- **Datos en la UE:** base de datos, ficheros, copias de seguridad y la IA (Bedrock, perfil EU) alojados en regiones de la UE.
- **Cifrado:** TLS en todas las conexiones; cifrado en reposo en base de datos, copias y ficheros.
- **Ficheros privados:** bucket sin acceso público; descarga solo con URL firmada de pocos minutos, generada tras comprobar permisos.
- **Aislamiento:** cada consulta se filtra por la usuaria propietaria del inmueble; tests que lo verifiquen.
- **Minimización en la IA:** solo se envía la imagen de la factura. DNI, nóminas y contratos nunca pasan por la IA. Bedrock no usa los datos para entrenar.
- **Enlace del inquilino:** token aleatorio largo, guardado como hash; revocable; caduca automáticamente al cerrar la estancia (con un margen configurable); páginas con `noindex`; solo muestra datos de ese inquilino (el resto aparecen como "otro inquilino").
- **Logs sin datos personales:** ni DNI, ni nombres, ni contenido de facturas en los logs ni en los errores enviados a monitorización.
- **Acceso:** autenticación con Better Auth; doble factor disponible; secretos fuera del código.
- **Derechos del inquilino:** exportar sus datos (acceso y portabilidad) y borrarlos o anonimizarlos (ver modelo de datos).

## Subencargados

| Proveedor | Uso | Ubicación de los datos | Garantías |
| --- | --- | --- | --- |
| Vercel | Web y API | Funciones en Frankfurt | DPA |
| Neon | Base de datos | Región UE | DPA |
| AWS | Ficheros (S3) e IA (Bedrock, perfil EU) | Regiones UE | DPA; Bedrock no entrena con los datos |

Los tres son proveedores estadounidenses con datos alojados en la UE; las garantías de transferencia (cláusulas tipo o marco UE-EE. UU.) se comprueban al aceptar cada DPA ⚖️.

## Conservación ⚖️

- Durante la estancia: todo.
- Al terminar: DNI y nóminas se borran tras un plazo corto configurable (propuesta: al devolver la fianza).
- Contratos, cobros, repartos y facturas: se conservan mientras haya obligaciones legales o fiscales; plazo exacto a validar. Después, borrado o anonimización.
- La app avisa a la propietaria cuando un dato alcanza su plazo.

## Medidas organizativas

| Medida | Cuándo |
| --- | --- |
| Lista de subencargados (hosting, almacenamiento, Bedrock) con sus contratos de encargo (DPA) aceptados | Al contratar cada proveedor |
| Cláusula informativa para los inquilinos (qué datos, para qué, cuánto tiempo, derechos) ⚖️ | Fase 2, antes de usarla con inquilinos reales |
| Registro de actividades de tratamiento | Fase 2 (versión simple) |
| Procedimiento de brechas de seguridad (notificar a la AEPD en 72 h si procede) | Fase 2 |
| Política de privacidad, términos y DPA para otros propietarios ⚖️ | Fase 3 |
