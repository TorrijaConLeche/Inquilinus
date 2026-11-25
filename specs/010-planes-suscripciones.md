# 010 · Planes y suscripciones

Estado: aprobada · Paquetes: `packages/domain` (límites del plan), `apps/api` (Paddle, webhooks y cortesía), `apps/web`

## Objetivo

Tres planes: **Starter**, gratuito, para probar la app con un inmueble real, y dos de pago: **Plus**, para quien tiene pocos inmuebles, y **Advanced**, hasta 10. El cobro lo hace **Paddle** como vendedor oficial (*merchant of record*): cobra, gestiona el IVA y emite las facturas a las clientas. Si la app crece mucho, se valorará pasar a Stripe. Durante la beta, la propietaria de la app puede dar **Advanced de cortesía**, sin pago.

El límite de 5 facturas con IA de Starter es una prueba: si no mejora la retención, se cambiará.

## Planes

| | **Starter** | **Plus** | **Advanced** |
| --- | --- | --- | --- |
| Precio (IVA incluido) | 0 € | 4,99 €/mes o 49,90 €/año | 9,99 €/mes o 99,90 €/año |
| Inmuebles activos | 1 | Hasta 3 | Hasta 10 |
| Facturas leídas por IA | 5 al mes | Sin límite práctico (uso razonable: 100 al mes, spec 008, R12) | Igual que Plus |
| Todo lo demás | Completo | Completo | Completo |

## Reglas

**Límites**

- **R1** — No se puede crear un inmueble por encima del límite del plan. La app explica el límite y ofrece el paso siguiente: en Starter, pasar a Plus o a Advanced; en Plus, pasar a Advanced; en Advanced, escribir a soporte. Los inmuebles archivados no cuentan.
- **R2** — Al agotar las facturas por IA del mes, la factura se sigue subiendo y se rellena a mano (spec 003, R8). Nunca se bloquea el uso de la app. Una factura solo gasta del límite si la IA llega a leerla: si la lectura falla, se rellena a mano y no cuenta.
- **R3** — El contador de facturas por IA se reinicia el día 1 de cada mes, en hora de Madrid.
- **R3b** — El plan de una cuenta es el mayor entre el de su suscripción de pago vigente y el de cortesía vigente (R15). Sin ninguno de los dos, Starter.

**Pago**

- **R4** — La usuaria elige Plus o Advanced, con pago mensual o anual, y paga en el checkout de **Paddle**. La app nunca ve ni guarda datos de tarjeta; solo los identificadores de cliente y de suscripción de Paddle.
- **R5** — Cambiar el método de pago, ver los pagos, descargar facturas, pasar de mensual a anual y cancelar se hace desde el portal de cliente de Paddle, enlazado desde los ajustes.
- **R5b** — Cambiar entre Plus y Advanced se hace desde los ajustes de la app. **Subir** (de Plus a Advanced) se aplica al momento y Paddle cobra la diferencia prorrateada del periodo en curso. **Bajar** (de Advanced a Plus) se aplica al final del periodo pagado; hasta entonces sigue en Advanced.
- **R6** — El estado de la suscripción solo cambia con los **webhooks de Paddle**, con la firma verificada. Cada evento se procesa una sola vez aunque llegue repetido.
- **R7** — En el MVP solo se vende en **España**: el checkout solo admite dirección de facturación en España. Precios con IVA incluido (21 %); Paddle lo calcula, lo cobra y lo declara.

**Cancelación, impago y bajada de plan**

- **R8** — Al cancelar, el plan sigue activo hasta el final del periodo pagado (mes o año); después pasa a Starter.
- **R9** — Si un pago falla, Paddle lo reintenta durante unos días y la app avisa a la usuaria. Mientras tanto el plan sigue activo. Si al final no se cobra, se aplica R8.
- **R10** — Cuando la cuenta pasa a un plan que admite menos inmuebles de los que tiene (a Starter, o de Advanced a Plus), **no se borra nada**: la usuaria elige qué inmuebles siguen activos, tantos como permite el plan, y los demás quedan **bloqueados**. Hasta que elija, quedan activos los más antiguos.
- **R10b** — Un inmueble bloqueado aparece en la lista con un candado y la opción de subir de plan, pero **no se puede entrar en él**: ni verlo, ni editarlo, ni marcar pagos. No se generan sus cobros. Sus datos se conservan intactos.
- **R10c** — La elección de los inmuebles activos es **única**: una vez hecha, no se puede cambiar mientras la cuenta siga en ese plan. Solo se puede cambiar subiendo de plan. Mientras la usuaria no haya elegido, la selección provisional de R10 sigue en vigor y la elección sigue disponible. Cada vez que la cuenta cambia de plan y tiene más inmuebles que el nuevo límite, vuelve a elegir.
- **R10d** — Los enlaces de los inquilinos de un inmueble bloqueado siguen funcionando con lo que había y muestran el aviso **"Este inmueble no está actualizado"** (spec 004).
- **R10e** — Los inmuebles bloqueados no cuentan en el panel principal; el panel muestra el aviso "N inmuebles bloqueados" con la opción de subir de plan.
- **R10f** — Aunque un inmueble esté bloqueado, la usuaria siempre puede **exportar todos sus datos** y borrar su cuenta (spec 008, R14), por sus derechos de acceso y portabilidad ⚖️.
- **R11** — Al subir de plan, se desbloquean inmuebles hasta el nuevo límite: en Advanced, todos. Si el nuevo plan sigue sin admitirlos todos (por ejemplo, de Starter a Plus con 5 inmuebles), vuelve a elegir (R10c); hasta que elija, siguen activos los que ya lo estaban y, después, los más antiguos.

**Facturas**

- **R12** — Paddle emite la factura de cada cobro a la clienta, con IVA. Si la clienta quiere factura a nombre de una empresa o con su NIF, lo indica en el checkout.
- **R13** — La propietaria de la app factura a Paddle por los ingresos que este le liquida. Esa factura se hace fuera de la app (gestor o programa de facturación) y debe cumplir Verifactu cuando sea obligatorio ⚖️.

**Cambios de precio**

- **R14** — Un cambio de precio se avisa con al menos 30 días de antelación y la usuaria puede cancelar antes de que se aplique ⚖️.

**Advanced de cortesía**

- **R15** — La propietaria de la app puede dar Advanced sin pago a cuentas concretas, por ejemplo a las propietarias de la beta (tarea 7.4 del plan). Se configura con la variable de entorno `PLAN_CORTESIA`: emails separados por comas, cada uno con una fecha de fin opcional (`ana@ejemplo.es:2027-06-30`); sin fecha, no caduca. Mayúsculas y espacios no cuentan. Una entrada mal escrita (por ejemplo, una fecha que no existe) se ignora y se avisa en el registro, sin el email (docs/rgpd.md).
- **R15b** — La cortesía dura hasta el final del día de su fecha de fin, en hora de Madrid. Después, la cuenta pasa al plan que pague o a Starter, con la elección de R10.
- **R15c** — En los ajustes se ve "Advanced de cortesía" y, si tiene fecha de fin, hasta cuándo. En los 14 días anteriores al fin, el panel lo avisa con la opción de suscribirse.
- **R15d** — La cortesía no pasa por Paddle. Con cortesía vigente, la usuaria puede suscribirse igualmente: el cobro empieza el día que se suscribe, y la app se lo dice antes de pagar.

**Página pública de precios**

- **R16** — Hay una página pública de precios en `/precios`, sin sesión, en español e inglés. Muestra los tres planes y, de cada uno: el precio con IVA incluido, mensual y anual (el anual sale a 2 meses gratis); los inmuebles activos y las facturas leídas con IA; y que todo lo demás va incluido en los tres. Debajo, respuestas breves: qué pasa al llegar al límite (R1, R2), al cancelar o bajar de plan (R8, R10: no se borra nada), quién emite la factura (R12) y que de momento solo se vende en España (R7).
- **R16b** — El botón de Starter lleva a crear la cuenta. Los de Plus y Advanced dicen «Muy pronto» hasta que llegue el pago (tarea 8.5 del plan).
- **R16c** — Los precios y los límites salen del mismo sitio que usa la app (`packages/domain`), nunca escritos a mano en la página.
- **R16d** — Se enlaza desde la portada y desde «Tu plan» en los ajustes.

## Casos de prueba

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Segundo inmueble en Starter (R1) | No se crea; aparece la oferta de Plus y de Advanced |
| C2 | Undécimo inmueble en Advanced (R1) | No se crea; aparece la opción de escribir a soporte |
| C3 | Sexta factura por IA en Starter (R2) | No se llama a la IA; la factura se rellena a mano |
| C4 | Reinicio del contador (R3) | El 1 de diciembre a las 00:00 (Madrid) vuelve a haber 5 disponibles |
| C5 | Suscripción mensual (R6) | Llega el webhook de suscripción a Plus activada: la cuenta pasa a Plus mensual |
| C6 | Suscripción anual (R4, R8) | Con pago anual, el periodo termina un año después |
| C7 | Webhook repetido (R6) | El mismo evento dos veces: un solo cambio |
| C8 | Firma inválida (R6) | Respuesta 400 y ningún cambio |
| C9 | Cancelación (R8) | Activa hasta el fin del periodo; al día siguiente, Starter |
| C10 | Bajada a Starter con 3 inmuebles (R10, R10b) | Elige uno activo; los otros dos bloqueados: no se puede entrar en ellos ni marcar pagos, y no generan cobros |
| C11 | Impago final (R9) | Igual que C9 |
| C12 | Desglose del IVA (R7) | Plus: 4,99 € = 4,12 € + 0,87 € de IVA y 49,90 € = 41,24 € + 8,66 €. Advanced: 9,99 € = 8,26 € + 1,73 € y 99,90 € = 82,56 € + 17,34 € |
| C13 | Elección única de los inmuebles activos (R10c) | Sin elegir: activo el más antiguo y se puede elegir. Tras elegir "playa": ya no se puede cambiar. Tras volver a Advanced y bajar de nuevo: se puede elegir otra vez |
| C14 | Enlace de un inmueble bloqueado (R10d) | El inquilino ve lo que había y el aviso "Este inmueble no está actualizado" |
| C15 | Panel con bloqueados (R10e) | Sus pendientes no cuentan; aparece "2 inmuebles bloqueados" |
| C16 | Exportar con bloqueados (R10f) | La exportación incluye los datos de los inmuebles bloqueados |
| C17 | Volver a Advanced (R11) | Los tres inmuebles se desbloquean |
| C18 | Cuarto inmueble en Plus (R1) | No se crea; aparece la oferta de Advanced |
| C19 | Subir de Plus a Advanced (R5b) | Advanced al momento; Paddle cobra la diferencia prorrateada |
| C20 | Bajar de Advanced a Plus con 5 inmuebles (R5b, R10) | Sigue en Advanced hasta el fin del periodo; después, activos los 3 más antiguos hasta que elija 3; los otros 2, bloqueados |
| C21 | De Starter a Plus con 5 inmuebles (R11) | Siguen activos el que ya lo estaba y los 2 más antiguos de los demás; puede elegir otros 3 una vez |
| C22 | Cortesía sin fecha (R15, R3b) | Email en `PLAN_CORTESIA`, aunque esté en mayúsculas: Advanced sin pago y sin fecha de fin |
| C23 | Fin de la cortesía (R15b, R15c) | Con `:2027-06-30`: el 16 de junio el panel avisa; el 30 a las 23:59 (Madrid) sigue en Advanced; el 1 de julio pasa a Starter con la elección de R10 |
| C24 | Cortesía y suscripción a la vez (R3b, R15d) | Cortesía vigente y Plus pagado: Advanced; al acabar la cortesía, Plus |
| C25 | Entrada mal escrita (R15) | `ana@ejemplo.es:2027-02-30` se ignora; el registro avisa sin el email |
| C26 | Lectura fallida (R2) | Starter con 4 leídas este mes; la IA falla con la quinta | La quinta queda para rellenar a mano y sigue quedando 1 lectura disponible |
| C27 | Página de precios sin sesión (R16, R16c) | Responde sin sesión y muestra 4,99 € / 49,90 € y 9,99 € / 99,90 €, iguales que en la app |

## Fuera de alcance

- Venta fuera de España.
- Plan para gestorías o carteras de más de 10 inmuebles.
- Cupones, descuentos y programas de referidos.
- Prueba gratuita de los planes de pago (fuera de la cortesía).
- Pantalla de administración para la cortesía: se gestiona con la variable `PLAN_CORTESIA`.
- Migración a Stripe (cuando el volumen lo justifique).

## Tareas

- [x] Límites de los tres planes, elección de inmuebles activos y lectura de `PLAN_CORTESIA` en `packages/domain`
- [x] Contador mensual de facturas por IA y reparto dentro de un lote (spec 003, R15)
- [x] Plan de cada cuenta en la API, con el Advanced de cortesía de `PLAN_CORTESIA`
- [x] Límite de inmuebles al crear uno (R1) en la API
- [x] Bajada de plan con elección de inmuebles activos y bloqueo en la API (R10–R11)
- [x] Web: mensajes del límite (R1, R2), plan en los ajustes con el aviso de fin de la cortesía (R15c), candado en los inmuebles bloqueados y pantalla para elegir los activos (R10c)
- [x] Email de soporte en la app para quien pasa de 10 inmuebles (R1): soporte@inquilinus.es, en `apps/web/src/lib/soporte.ts`
- [ ] Checkout y portal de cliente de Paddle; webhooks con verificación de firma
- [ ] Cambio entre Plus y Advanced desde los ajustes
- [ ] Sección 8 de los términos con los tres planes (con los textos definitivos, tarea 8.2 del plan)
- [x] Página pública de precios (R16–R16d)
- [ ] Tests C1–C27
