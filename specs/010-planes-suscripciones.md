# 010 · Planes y suscripciones

Estado: aprobada · Paquetes: `packages/domain` (límites del plan), `apps/api` (Paddle y webhooks), `apps/web`

## Objetivo

Dos planes: **Starter**, gratuito, para probar la app con un inmueble real, y **Advanced**, de pago. El cobro lo hace **Paddle** como vendedor oficial (*merchant of record*): cobra, gestiona el IVA y emite las facturas a las clientas. Si la app crece mucho, se valorará pasar a Stripe.

## Planes

| | **Starter** | **Advanced** |
| --- | --- | --- |
| Precio | 0 € | 4,99 €/mes o 49,90 €/año, IVA incluido |
| Inmuebles activos | 1 | Hasta 10 |
| Facturas leídas por IA | 2 al mes | Sin límite práctico (máximo de uso razonable: 100 al mes, spec 008, R12) |
| Todo lo demás | Completo | Completo |

## Reglas

**Límites**

- **R1** — En Starter no se puede crear un segundo inmueble, y en Advanced no se puede crear el undécimo. La app explica el límite: en Starter ofrece pasar a Advanced; en Advanced ofrece escribir a soporte.
- **R2** — Al agotar las facturas por IA del mes, la factura se sigue subiendo y se rellena a mano (spec 003, R8). Nunca se bloquea el uso de la app.
- **R3** — El contador de facturas por IA se reinicia el día 1 de cada mes, en hora de Madrid.

**Pago**

- **R4** — La usuaria elige pago mensual (4,99 €) o anual (49,90 €) y paga en el checkout de **Paddle**. La app nunca ve ni guarda datos de tarjeta; solo los identificadores de cliente y de suscripción de Paddle.
- **R5** — Cambiar el método de pago, ver los pagos, descargar facturas, pasar de mensual a anual y cancelar se hace desde el portal de cliente de Paddle, enlazado desde los ajustes.
- **R6** — El estado de la suscripción solo cambia con los **webhooks de Paddle**, con la firma verificada. Cada evento se procesa una sola vez aunque llegue repetido.
- **R7** — En el MVP solo se vende en **España**: el checkout solo admite dirección de facturación en España. Precios con IVA incluido (21 %); Paddle lo calcula, lo cobra y lo declara.

**Cancelación, impago y bajada de plan**

- **R8** — Al cancelar, el plan sigue activo hasta el final del periodo pagado (mes o año); después pasa a Starter.
- **R9** — Si un pago falla, Paddle lo reintenta durante unos días y la app avisa a la usuaria. Mientras tanto el plan sigue activo. Si al final no se cobra, se aplica R8.
- **R10** — Al pasar a Starter con más de un inmueble **no se borra nada**: la usuaria elige qué inmueble sigue activo y los demás quedan **bloqueados**. Hasta que elija, queda activo el más antiguo.
- **R10b** — Un inmueble bloqueado aparece en la lista con un candado y la opción de pasar a Advanced, pero **no se puede entrar en él**: ni verlo, ni editarlo, ni marcar pagos. No se generan sus cobros. Sus datos se conservan intactos.
- **R10c** — El inmueble activo se puede cambiar como máximo una vez cada 30 días, para que el límite de Starter no se sortee alternando inmuebles.
- **R10d** — Los enlaces de los inquilinos de un inmueble bloqueado siguen funcionando con lo que había y muestran el aviso **"Este inmueble no está actualizado"** (spec 004).
- **R10e** — Los inmuebles bloqueados no cuentan en el panel principal; el panel muestra el aviso "N inmuebles bloqueados" con la opción de pasar a Advanced.
- **R10f** — Aunque un inmueble esté bloqueado, la usuaria siempre puede **exportar todos sus datos** y borrar su cuenta (spec 008, R14), por sus derechos de acceso y portabilidad ⚖️.
- **R11** — Al volver a Advanced, todos los inmuebles se desbloquean.

**Facturas**

- **R12** — Paddle emite la factura de cada cobro a la clienta, con IVA. Si la clienta quiere factura a nombre de una empresa o con su NIF, lo indica en el checkout.
- **R13** — La propietaria de la app factura a Paddle por los ingresos que este le liquida. Esa factura se hace fuera de la app (gestor o programa de facturación) y debe cumplir Verifactu cuando sea obligatorio ⚖️.

**Cambios de precio**

- **R14** — Un cambio de precio se avisa con al menos 30 días de antelación y la usuaria puede cancelar antes de que se aplique ⚖️.

## Casos de prueba

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Segundo inmueble en Starter (R1) | No se crea; aparece la oferta de Advanced |
| C2 | Undécimo inmueble en Advanced (R1) | No se crea; aparece la opción de escribir a soporte |
| C3 | Tercera factura por IA en Starter (R2) | No se llama a la IA; la factura se rellena a mano |
| C4 | Reinicio del contador (R3) | El 1 de diciembre a las 00:00 (Madrid) vuelve a haber 2 disponibles |
| C5 | Suscripción mensual (R6) | Llega el webhook de suscripción activada: la cuenta pasa a Advanced mensual |
| C6 | Suscripción anual (R4, R8) | Con pago anual, el periodo termina un año después |
| C7 | Webhook repetido (R6) | El mismo evento dos veces: un solo cambio |
| C8 | Firma inválida (R6) | Respuesta 400 y ningún cambio |
| C9 | Cancelación (R8) | Activa hasta el fin del periodo; al día siguiente, Starter |
| C10 | Bajada con 3 inmuebles (R10, R10b) | Elige uno activo; los otros dos bloqueados: no se puede entrar en ellos ni marcar pagos, y no generan cobros |
| C11 | Impago final (R9) | Igual que C9 |
| C12 | Desglose del IVA (R7) | Mensual: 4,99 € = 4,12 € + 0,87 € de IVA. Anual: 49,90 € = 41,24 € + 8,66 € de IVA |
| C13 | Cambio del inmueble activo (R10c) | Cambiado el 2026-11-01: el 2026-11-20 no se puede volver a cambiar; el 2026-12-01 sí |
| C14 | Enlace de un inmueble bloqueado (R10d) | El inquilino ve lo que había y el aviso "Este inmueble no está actualizado" |
| C15 | Panel con bloqueados (R10e) | Sus pendientes no cuentan; aparece "2 inmuebles bloqueados" |
| C16 | Exportar con bloqueados (R10f) | La exportación incluye los datos de los inmuebles bloqueados |
| C17 | Volver a Advanced (R11) | Los tres inmuebles se desbloquean |

## Fuera de alcance

- Venta fuera de España.
- Plan para gestorías o carteras de más de 10 inmuebles.
- Cupones, descuentos y programas de referidos.
- Migración a Stripe (cuando el volumen lo justifique).

## Tareas

- [x] Límites del plan en `packages/domain`
- [ ] Contador mensual de facturas por IA
- [ ] Checkout y portal de cliente de Paddle; webhooks con verificación de firma
- [ ] Bajada de plan con elección de inmueble activo y bloqueo
- [ ] Tests C1–C17
