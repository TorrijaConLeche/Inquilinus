# 010 · Planes y suscripciones

Estado: aprobada · Paquetes: `packages/domain` (límites del plan), `apps/api` (Paddle y webhooks), `apps/web`

## Objetivo

Dos planes: uno gratuito para probar la app con un inmueble real y uno de pago, **Propietaria**. El cobro lo hace **Paddle** como vendedor oficial (*merchant of record*): cobra, gestiona el IVA y emite las facturas a las clientas. Si la app crece mucho, se valorará pasar a Stripe.

## Planes

| | **Gratis** | **Propietaria** |
| --- | --- | --- |
| Precio | 0 € | 4,99 €/mes o 49,90 €/año, IVA incluido |
| Inmuebles activos | 1 | Hasta 10 |
| Facturas leídas por IA | 2 al mes | Sin límite práctico (máximo de uso razonable: 100 al mes, spec 008, R12) |
| Todo lo demás | Completo | Completo |

## Reglas

**Límites**

- **R1** — En Gratis no se puede crear un segundo inmueble, y en Propietaria no se puede crear el undécimo. La app explica el límite: en Gratis ofrece pasar a Propietaria; en Propietaria ofrece escribir a soporte.
- **R2** — Al agotar las facturas por IA del mes, la factura se sigue subiendo y se rellena a mano (spec 003, R8). Nunca se bloquea el uso de la app.
- **R3** — El contador de facturas por IA se reinicia el día 1 de cada mes, en hora de Madrid.

**Pago**

- **R4** — La usuaria elige pago mensual (4,99 €) o anual (49,90 €) y paga en el checkout de **Paddle**. La app nunca ve ni guarda datos de tarjeta; solo los identificadores de cliente y de suscripción de Paddle.
- **R5** — Cambiar el método de pago, ver los pagos, descargar facturas, pasar de mensual a anual y cancelar se hace desde el portal de cliente de Paddle, enlazado desde los ajustes.
- **R6** — El estado de la suscripción solo cambia con los **webhooks de Paddle**, con la firma verificada. Cada evento se procesa una sola vez aunque llegue repetido.
- **R7** — En el MVP solo se vende en **España**: el checkout solo admite dirección de facturación en España. Precios con IVA incluido (21 %); Paddle lo calcula, lo cobra y lo declara.

**Cancelación, impago y bajada de plan**

- **R8** — Al cancelar, el plan sigue activo hasta el final del periodo pagado (mes o año); después pasa a Gratis.
- **R9** — Si un pago falla, Paddle lo reintenta durante unos días y la app avisa a la usuaria. Mientras tanto el plan sigue activo. Si al final no se cobra, se aplica R8.
- **R10** — Al pasar a Gratis con más de un inmueble **no se borra nada**: la usuaria elige qué inmueble sigue activo y los demás quedan en **solo lectura** (se ven, los enlaces de los inquilinos siguen funcionando, pero no se generan cobros ni se suben facturas). Hasta que elija, queda activo el más antiguo.
- **R11** — Al volver a Propietaria, todos los inmuebles vuelven a estar activos.

**Facturas**

- **R12** — Paddle emite la factura de cada cobro a la clienta, con IVA. Si la clienta quiere factura a nombre de una empresa o con su NIF, lo indica en el checkout.
- **R13** — La propietaria de la app factura a Paddle por los ingresos que este le liquida. Esa factura se hace fuera de la app (gestor o programa de facturación) y debe cumplir Verifactu cuando sea obligatorio ⚖️.

**Cambios de precio**

- **R14** — Un cambio de precio se avisa con al menos 30 días de antelación y la usuaria puede cancelar antes de que se aplique ⚖️.

## Casos de prueba

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Segundo inmueble en Gratis (R1) | No se crea; aparece la oferta de Propietaria |
| C2 | Undécimo inmueble en Propietaria (R1) | No se crea; aparece la opción de escribir a soporte |
| C3 | Tercera factura por IA en Gratis (R2) | No se llama a la IA; la factura se rellena a mano |
| C4 | Reinicio del contador (R3) | El 1 de diciembre a las 00:00 (Madrid) vuelve a haber 2 disponibles |
| C5 | Suscripción mensual (R6) | Llega el webhook de suscripción activada: la cuenta pasa a Propietaria mensual |
| C6 | Suscripción anual (R4, R8) | Con pago anual, el periodo termina un año después |
| C7 | Webhook repetido (R6) | El mismo evento dos veces: un solo cambio |
| C8 | Firma inválida (R6) | Respuesta 400 y ningún cambio |
| C9 | Cancelación (R8) | Activa hasta el fin del periodo; al día siguiente, Gratis |
| C10 | Bajada con 3 inmuebles (R10) | Elige uno activo; los otros dos en solo lectura, con sus enlaces funcionando y sin cobros automáticos |
| C11 | Impago final (R9) | Igual que C9 |
| C12 | Desglose del IVA (R7) | Mensual: 4,99 € = 4,12 € + 0,87 € de IVA. Anual: 49,90 € = 41,24 € + 8,66 € de IVA |

## Fuera de alcance

- Venta fuera de España.
- Plan para gestorías o carteras de más de 10 inmuebles.
- Cupones, descuentos y programas de referidos.
- Migración a Stripe (cuando el volumen lo justifique).

## Tareas

- [x] Límites del plan en `packages/domain`
- [ ] Contador mensual de facturas por IA
- [ ] Checkout y portal de cliente de Paddle; webhooks con verificación de firma
- [ ] Bajada de plan con elección de inmueble activo y modo solo lectura
- [ ] Tests C1–C12
