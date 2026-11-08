# Modelo de datos — v1

Estado: borrador · Base de datos: PostgreSQL (Drizzle)

Convenciones: ids UUID; importes en céntimos (enteros); fechas de negocio como `date` (sin hora); `creado_en` / `actualizado_en` en todas las tablas. Todo cuelga de una usuaria a través del inmueble: ninguna consulta cruza datos entre usuarias.

## Entidades

| Entidad | Campos principales | Notas |
| --- | --- | --- |
| **usuaria** | email, nombre | Gestionada por Better Auth |
| **inmueble** | usuaria, nombre, dirección (opcional), modalidad (`entero` \| `habitaciones`), meses_parciales (`prorrateo` \| `mes_completo`), dia_cobro (1–28, por defecto 1), archivado, solo_lectura | La modalidad no se puede cambiar en la v1. Por defecto, mes completo |
| **habitacion** | inmueble, nombre, archivada | Un piso entero = una sola habitación. Se archiva, no se borra, si tiene historial |
| **precio_habitacion** | habitación, desde_mes (`YYYY-MM`), precio_mensual | Historial de precios; el vigente en un mes es el último con `desde_mes` igual o anterior (spec 007) |
| **inquilino** | inmueble, nombre, anonimizado | Solo se guarda el nombre (spec 007). Al borrarlo se anonimiza como "Inquilino N". Pertenece al inmueble. Si se muda a otro inmueble de la misma propietaria, se cierran sus cuentas en el primero y se crea un inquilino nuevo en el segundo |
| **ocupacion** | habitación, inquilino, entrada, salida (opcional) | Habitación e inquilino deben ser del mismo inmueble. Un inquilino puede tener varias si cambia de habitación. Se valida el solape (R8 de la spec 001) |
| **tipo_gasto** | inmueble, nombre (texto libre: "Luz", "Agua", "Comunidad"…), color, archivado | De 0 a N por inmueble; los define la usuaria. El color sale de una paleta fija y se mantiene en toda la app (spec 006) |
| **factura** | tipo_gasto, fichero (PDF), periodo_inicio, periodo_fin, importe_total, estado, propuesta_ia | Estados: `subida` → `propuesta` (o `error_extraccion`) → `confirmada` → `repartida`. `propuesta_ia` guarda lo que propuso la IA (spec 003) |
| **reparto** | factura, calculado_en, detalle | Foto fija del cálculo de la spec 001. `detalle`: tramos de días con los presentes, para la vista del inquilino (spec 004) |
| **reparto_linea** | reparto, inquilino (vacío = sin ocupar), días, importe, pagado_en | Quién ha pagado su parte y cuándo |
| **cobro_alquiler** | inquilino, mes (`YYYY-MM`), renta, recargo_vacios, importe, fecha_cobro, origen (`auto` \| `manual`), editado, desactualizado, quitado_en, pagado_en | Foto fija del cálculo de la spec 002. Único por inquilino y mes, incluidos los quitados, para que el proceso no los recree (spec 005) |
| **suscripcion** | usuaria, plan (`gratis` \| `propietaria`), periodicidad (`mensual` \| `anual`), estado, paddle_cliente_id, paddle_suscripcion_id, periodo_fin, cancela_al_final | Solo cambia por webhooks de Paddle (spec 010) |
| **evento_pago** | id del evento, tipo, procesado_en | Para procesar cada webhook de Paddle una sola vez |
| **uso_ia** | usuaria, mes, facturas_leidas | Contador mensual de facturas leídas por IA |
| **fianza** | inquilino, importe, recibida_en, devuelta_en, importe_devuelto, fichero (opcional), notas | `importe_devuelto` permite devoluciones parciales |
| **documento** | inquilino, tipo (`contrato` \| `justificante_fianza`), fichero | Solo estos dos tipos; no se guardan DNI ni nóminas. Nunca pasa por la IA |
| **fichero** | usuaria, clave_s3, nombre_original, mime, tamaño, sha256 | Bucket privado; se sirve con URL firmada de corta duración |
| **enlace_inquilino** | inquilino, token_hash, permite_descarga (por defecto sí), caduca_en, revocado_en | Uno por estancia (= inquilino en ese inmueble). Se guarda el hash del token, nunca el token |

## Relaciones

```
usuaria ── inmueble ─┬─ habitacion ── ocupacion ──┐
                     ├─ inquilino ────────────────┘
                     │     ├─ documento, fianza
                     │     ├─ cobro_alquiler
                     │     └─ enlace_inquilino
                     └─ tipo_gasto ── factura ── reparto ── reparto_linea ── inquilino
```

## Decisiones de diseño

- **Inquilinos por inmueble:** el cambio de inmueble es un caso raro; se resuelve cerrando la estancia y creando un inquilino nuevo. Así todo lo de un inmueble queda autocontenido.
- **Cálculos congelados:** un reparto o un cobro se guarda como foto fija. Si después se corrige una fecha de ocupación, no cambia solo: la app avisa de que está desactualizado y la usuaria decide si recalcular.
- **Pagos en la línea:** pagado o pendiente es `pagado_en` (vacío = pendiente), sin tabla de pagos aparte. No se registra el pago de la propietaria a la compañía.
- **Cobros de alquiler:** se generan automáticamente el día de cobro de cada inmueble (por defecto el 1) para cada inquilino presente ese mes (también si entra a mitad de mes), y también se pueden generar a mano. Nunca se duplican. La propietaria puede cambiar, mover o quitar cualquier cobro. Si cambian ocupaciones o precios, los cobros afectados quedan desactualizados (spec 005).
- **Borrado RGPD:** borrar un inquilino elimina sus documentos, fianza y ficheros, y anonimiza su nombre en repartos y cobros para que los importes históricos sigan cuadrando.
