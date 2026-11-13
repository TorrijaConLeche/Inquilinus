# Modelo de datos — v1

Estado: borrador · Base de datos: PostgreSQL (Drizzle)

Convenciones: ids UUID; importes en céntimos (enteros); fechas de negocio como `date` (sin hora); `creado_en` / `actualizado_en` en todas las tablas. Todo cuelga de un usuario a través del inmueble: ninguna consulta cruza datos entre usuarios.

## Entidades

| Entidad | Campos principales | Notas |
| --- | --- | --- |
| **usuario** | email, nombre (opcional, vacío si no se indica), email_verificado, terminos_version, terminos_aceptados_en, doble_factor_activo, imagen | Gestionado por Better Auth (spec 008). `imagen` la exige Better Auth y siempre queda vacía (R15) |
| **sesion** | usuario, token, expira_en, ip, agente_usuario | Sesiones abiertas (Better Auth). La IP y el navegador sirven para la seguridad de la cuenta y nunca van a los logs |
| **metodo_acceso** | usuario, proveedor (`credential` \| `google`), id_en_proveedor, contrasena_hash, tokens del proveedor | Formas de entrar de cada usuario. De la contraseña solo se guarda el hash |
| **verificacion** | identificador, valor, expira_en | Tokens de verificación de email y de recuperación de contraseña, de un solo uso |
| **doble_factor** | usuario, secreto, codigos_recuperacion, verificado, fallos_seguidos, bloqueado_hasta | Doble factor con app de autenticación (R7). Secreto y códigos cifrados por Better Auth. Tras 5 códigos fallidos seguidos, 15 minutos de bloqueo |
| **intento_acceso** | clave, fallos, primer_fallo_en, bloqueado_hasta | Límite de intentos (R11). La clave es una huella HMAC del email o de la IP: nunca se guardan en claro |
| **inmueble** | usuario, nombre, ultimo_numero_liquidacion, dirección (opcional), modalidad (`entero` \| `habitaciones`), meses_parciales (`prorrateo` \| `mes_completo`), dia_cobro (1–28, por defecto 1), archivado, bloqueado | La modalidad no se puede cambiar en la v1. Por defecto, mes completo |
| **habitacion** | inmueble, nombre, archivada | Un piso entero = una sola habitación. Se archiva, no se borra, si tiene historial |
| **precio_habitacion** | habitación, desde_mes (`YYYY-MM`), precio_mensual | Historial de precios; el vigente en un mes es el último con `desde_mes` igual o anterior (spec 007) |
| **inquilino** | inmueble, nombre, anonimizado | Solo se guarda el nombre (spec 007). Al borrarlo se anonimiza como "Inquilino N". Pertenece al inmueble. Si se muda a otro inmueble de la misma propietaria, se cierran sus cuentas en el primero y se crea un inquilino nuevo en el segundo |
| **ocupacion** | inmueble, habitación, inquilino, entrada, salida (opcional) | Habitación e inquilino deben ser del mismo inmueble: lo garantiza la base de datos con claves compuestas (habitación, inmueble) e (inquilino, inmueble). Un inquilino puede tener varias si cambia de habitación. Se valida el solape (R8 de la spec 001) |
| **tipo_gasto** | inmueble, nombre (texto libre: "Luz", "Agua", "Comunidad"…), color, archivado | De 0 a N por inmueble; los define la usuaria. El color sale de una paleta fija y se mantiene en toda la app (spec 006) |
| **factura** | inmueble, tipo_gasto (vacío hasta elegirlo), fichero (PDF), lote, liquidacion (opcional), periodo_inicio, periodo_fin, importe_total, estado, propuesta_ia | Estados: `subida` → `propuesta` (o `error_extraccion`) → `confirmada` → `repartida`. `propuesta_ia` guarda lo que propuso la IA, incluido el tipo sugerido; `lote` agrupa las facturas subidas juntas (spec 003) |
| **liquidacion** | inmueble, numero, nombre, mes, creada_en | Agrupa facturas para cobrarlas juntas (spec 011). Número correlativo por inmueble, nunca reutilizado |
| **reparto** | factura, calculado_en, detalle | Foto fija del cálculo de la spec 001. `detalle`: tramos de días con los presentes, para la vista del inquilino (spec 004) |
| **actividad** | inmueble, inquilino (opcional), tipo_gasto (opcional), tipo, detalle (valores antes y después), ocurrida_en | Histórico del inmueble (spec 012). Solo se añade, nunca se edita ni se borra |
| **reparto_linea** | reparto, inquilino (vacío = sin ocupar), días, importe, pagado_en | Quién ha pagado su parte y cuándo |
| **cobro_alquiler** | inquilino, mes (`YYYY-MM`), renta, recargo_vacios, importe, fecha_cobro, origen (`auto` \| `manual`), editado, desactualizado, quitado_en, pagado_en | Foto fija del cálculo de la spec 002. Único por inquilino y mes, incluidos los quitados, para que el proceso no los recree (spec 005) |
| **suscripcion** | usuario, plan (`starter` \| `advanced`), periodicidad (`mensual` \| `anual`), estado, paddle_cliente_id, paddle_suscripcion_id, periodo_fin, cancela_al_final, inmueble_activo, activo_elegido_en (vacío = aún no elegido; la elección es única mientras siga en Starter) | Solo cambia por webhooks de Paddle (spec 010) |
| **evento_pago** | id del evento, tipo, procesado_en | Para procesar cada webhook de Paddle una sola vez |
| **uso_ia** | usuario, mes, facturas_leidas | Contador mensual de facturas leídas por IA |
| **fianza** | inquilino, importe, recibida_en, devuelta_en, importe_devuelto, notas | Una por inquilino. `importe_devuelto` permite devoluciones parciales; las notas (300 caracteres) explican los descuentos. El justificante es un `documento` (spec 007, R6d) |
| **documento** | inquilino, tipo (`contrato` \| `justificante_fianza`), fichero | Solo estos dos tipos y uno de cada por inquilino; no se guardan DNI ni nóminas. Nunca pasa por la IA |
| **fichero** | usuario, clave_s3, nombre_original, mime, tamaño, sha256 | Bucket privado; se sirve con URL firmada de corta duración |
| **enlace_inquilino** | inquilino, token_hash, permite_descarga (por defecto sí), caduca_en, revocado_en | Uno por estancia (= inquilino en ese inmueble). Se guarda el hash del token, nunca el token |

## Relaciones

```
usuario ── inmueble ─┬─ habitacion ── ocupacion ──┐
                     ├─ inquilino ────────────────┘
                     │     ├─ documento, fianza
                     │     ├─ cobro_alquiler
                     │     └─ enlace_inquilino
                     ├─ liquidacion ── factura
                     └─ tipo_gasto ── factura ── reparto ── reparto_linea ── inquilino
```

## Decisiones de diseño

- **Inquilinos por inmueble:** el cambio de inmueble es un caso raro; se resuelve cerrando la estancia y creando un inquilino nuevo. Así todo lo de un inmueble queda autocontenido.
- **Cálculos congelados:** un reparto o un cobro se guarda como foto fija. Si después se corrige una fecha de ocupación, no cambia solo: la app avisa de que está desactualizado y la usuaria decide si recalcular.
- **Pagos en la línea:** pagado o pendiente es `pagado_en` (vacío = pendiente), sin tabla de pagos aparte. No se registra el pago de la propietaria a la compañía.
- **Cobros de alquiler:** se generan automáticamente el día de cobro de cada inmueble (por defecto el 1) para cada inquilino presente ese mes (también si entra a mitad de mes), y también se pueden generar a mano. Nunca se duplican. La propietaria puede cambiar, mover o quitar cualquier cobro. Si cambian ocupaciones o precios, los cobros afectados quedan desactualizados (spec 005).
- **Borrado RGPD:** borrar un inquilino elimina sus documentos, fianza y ficheros, y anonimiza su nombre en repartos y cobros para que los importes históricos sigan cuadrando.
