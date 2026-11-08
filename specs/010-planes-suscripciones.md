# 010 · Planes y suscripciones

Estado: borrador · Paquetes: `packages/domain` (límites del plan), `apps/api` (Stripe, webhooks, facturación), `apps/web`

## Objetivo

Dos planes: uno gratuito para probar la app con un inmueble real y uno de pago, **Propietaria**, sin límites. El pago se hace con Stripe y cada cobro genera una factura conforme a Verifactu.

## Planes

| | **Gratis** | **Propietaria** |
| --- | --- | --- |
| Precio | 0 € | 4,99 €/mes, IVA incluido |
| Inmuebles activos | 1 | Ilimitados (ver P1) |
| Facturas leídas por IA | 2 al mes | Sin límite práctico (máximo de uso razonable: 100 al mes, spec 008, R12) |
| Todo lo demás | Completo | Completo |

## Reglas

**Límites**

- **R1** — En el plan Gratis no se puede crear un segundo inmueble: la app explica el límite y ofrece pasar a Propietaria.
- **R2** — Al agotar las facturas por IA del mes, la factura se sigue subiendo y se rellena a mano (spec 003, R8). Nunca se bloquea el uso de la app.
- **R3** — El contador de facturas por IA se reinicia el día 1 de cada mes, en hora de Madrid.

**Pago**

- **R4** — Para suscribirse, la usuaria va a la página de pago de **Stripe** (Checkout). La app nunca ve ni guarda datos de tarjeta; solo los identificadores de cliente y de suscripción de Stripe.
- **R5** — Cambiar la tarjeta, ver los pagos y cancelar se hace desde el portal de cliente de Stripe, enlazado desde los ajustes.
- **R6** — El estado de la suscripción solo cambia con los **webhooks de Stripe**, con la firma verificada. Cada evento se procesa una sola vez aunque llegue repetido.
- **R7** — Precios con IVA incluido. El IVA se calcula según el país de la clienta ⚖️ (ver P3).

**Cancelación, impago y bajada de plan**

- **R8** — Al cancelar, el plan sigue activo hasta el final del periodo pagado; después pasa a Gratis.
- **R9** — Si un pago falla, Stripe lo reintenta durante unos días y la app avisa a la usuaria. Mientras tanto el plan sigue activo. Si al final no se cobra, se aplica R8.
- **R10** — Al pasar a Gratis con más de un inmueble **no se borra nada**: la usuaria elige qué inmueble sigue activo y los demás quedan en **solo lectura** (se ven, los enlaces de los inquilinos siguen funcionando, pero no se generan cobros ni se suben facturas). Hasta que elija, queda activo el más antiguo.
- **R11** — Al volver a Propietaria, todos los inmuebles vuelven a estar activos.

**Facturas de la suscripción**

- **R12** — Cada cobro genera una factura a la usuaria con un programa de facturación adaptado a **Verifactu**, de forma automática al recibir el webhook de cobro. La usuaria la descarga desde los ajustes ⚖️.
- **R13** — Si la usuaria quiere factura a nombre de una empresa o con su NIF, puede indicarlo en el pago de Stripe.

**Cambios de precio**

- **R14** — Un cambio de precio se avisa con al menos 30 días de antelación y la usuaria puede cancelar antes de que se aplique ⚖️.

## Casos de prueba

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Segundo inmueble en Gratis (R1) | No se crea; aparece la oferta de Propietaria |
| C2 | Tercera factura por IA en Gratis (R2) | No se llama a la IA; la factura se rellena a mano |
| C3 | Reinicio del contador (R3) | El 1 de diciembre a las 00:00 (Madrid) vuelve a haber 2 disponibles |
| C4 | Suscripción (R6) | Llega el webhook de pago completado: la cuenta pasa a Propietaria |
| C5 | Webhook repetido (R6) | El mismo evento dos veces: un solo cambio |
| C6 | Firma inválida (R6) | Respuesta 400 y ningún cambio |
| C7 | Cancelación (R8) | Activa hasta el fin del periodo; al día siguiente, Gratis |
| C8 | Bajada con 3 inmuebles (R10) | Elige uno activo; los otros dos en solo lectura, con sus enlaces funcionando y sin cobros automáticos |
| C9 | Impago final (R9) | Igual que C7 |
| C10 | Factura del cobro (R12) | Cada cobro genera una factura Verifactu descargable |
| C11 | Desglose del IVA (R7) | 4,99 € = 4,12 € de base + 0,87 € de IVA al 21 % |

## Fuera de alcance

- Plan para gestorías o carteras grandes (ver P1).
- Cupones, descuentos y programas de referidos.
- Pago anual (ver P2).

## Preguntas abiertas

- **P1** — ¿Inmuebles ilimitados en Propietaria, o un tope por ahora (por ejemplo, 10)? Con tope, crear después un plan mayor no obliga a subir el precio a quien ya paga.
- **P2** — ¿Ofrecemos también pago anual (por ejemplo, 49,90 €/año, dos meses gratis)? Reduce el peso de la comisión fija de Stripe.
- **P3** — ¿Vendemos solo en España al principio (IVA del 21 % siempre) o en toda la UE (IVA del país de cada clienta, con el régimen de ventanilla única)? A validar con el gestor ⚖️.
- **P4** — Programa de facturación con Verifactu: Quaderno es una opción con API e integración con Verifactu; a confirmar al implementar.

## Tareas

- [ ] Límites del plan en `packages/domain`
- [ ] Contador mensual de facturas por IA
- [ ] Stripe Checkout, portal de cliente y webhooks
- [ ] Bajada de plan con elección de inmueble activo y modo solo lectura
- [ ] Facturación Verifactu automática
- [ ] Tests C1–C11
