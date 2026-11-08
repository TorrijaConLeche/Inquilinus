# 005 · Generación de cobros de alquiler

Estado: aprobada · Paquetes: `packages/domain` (qué cobros tocan), `apps/api` (proceso diario y endpoints)

## Objetivo

Crear cada mes, sin que la propietaria tenga que acordarse, el cobro de alquiler de cada inquilino con el cálculo de la spec 002. También se pueden generar a mano, y la propietaria puede cambiar, mover o quitar cualquier cobro en cualquier momento. Cada cobro está pagado o pendiente.

## Reglas

- **R1** — Cada inmueble tiene un **día de cobro** (del 1 al 28), configurable en sus opciones. Por defecto, el 1.
- **R2** — Un proceso diario hace, en cada inmueble, **una sola generación por mes**: el día de cobro (o el primer día posterior en que corra, ver R8) crea los cobros del mes en curso de cada inquilino registrado que esté presente al menos un día ese mes. Usa el cálculo de la spec 002 con las ocupaciones y precios de ese momento. Queda anotado que la generación de ese mes ya se hizo.
- **R3** — Si un inquilino se registra después de la generación del mes, su cobro de ese mes no se crea solo: lo genera la propietaria a mano (R5). A partir del mes siguiente entra en la generación automática.
- **R4** — Nunca se duplica un cobro: si ya existe el de ese inquilino y mes, no se toca.
- **R5** — La propietaria puede generar a mano los cobros de un mes concreto de un inmueble, también de meses pasados. Usa el mismo cálculo, respeta R4 y solo crea los que falten.
- **R6** — Si cambian las ocupaciones o los precios de un mes que ya tiene cobros, esos cobros se marcan como **desactualizados**. La propietaria decide si recalcularlos. Si el cobro ya estaba pagado o había sido editado a mano (R10), al recalcularlo se pide confirmación; un cobro pagado sigue como pagado.
- **R7** — Estados: pendiente o pagado (con fecha). Se puede marcar y desmarcar.
- **R8** — El proceso corre una vez al día y el día se evalúa en hora de Madrid. Si falla el día de cobro, la generación del mes se hace el primer día en que vuelva a correr.
- **R9** — No hay recordatorios de impago en el MVP: los pendientes solo se ven en la app y en el enlace del inquilino.
- **R10** — La propietaria puede, en cualquier momento y en cualquier cobro: cambiar la renta y el recargo; **moverlo** a otra fecha de cobro (el mes del cobro no cambia); y **quitarlo**, con confirmación. Un cobro cambiado o movido queda marcado como editado. También puede añadir a mano un cobro para un inquilino y un mes que no lo tengan.
- **R11** — Un cobro quitado no lo vuelve a crear el proceso automático (R2). Solo vuelve si la propietaria lo genera a mano.

## Casos de prueba

Inmueble por habitaciones con prorrateo. A en H1 (500 €) y B en H2 (400 €) desde antes de octubre.

| # | Caso | Datos | Resultado esperado |
| --- | --- | --- | --- |
| C1 | Generación del día 1 (R2) | Día de cobro 1; proceso del 2026-10-01 | Cobros de octubre: A 500 €, B 400 €, pendientes, origen `auto` |
| C2 | Día de cobro configurable (R1) | Día de cobro 5 | El 2026-10-04 no genera nada; el 2026-10-05 genera los de octubre |
| C3 | Sin duplicados (R4) | El proceso corre dos veces el 2026-10-01 | Siguen siendo dos cobros |
| C4 | Recuperación tras un fallo (R8) | El proceso no corre el 2026-10-01 | El 2026-10-02 genera los de octubre |
| C5 | Inquilino que ya se fue | A sale el 2026-09-30 | Sin cobro de octubre para A |
| C6 | Generación manual de un mes pasado (R5) | Se generan a mano los de septiembre; el de A ya existía | Se crea el de B (origen `manual`); el de A no cambia |
| C7 | Cobro desactualizado (R6) | Cobro de octubre de B generado; luego se registra su salida el 2026-10-15 | Cobro de B marcado como desactualizado; al recalcular: 400 × 15/31 = 193,55 € |
| C8 | Día de cobro inválido (R1) | Día de cobro 30 | Error de validación |
| C9 | Marcar pagado (R7) | Se marca el cobro de A el 2026-10-03 y luego se desmarca | Pagado el 2026-10-03; después, pendiente |
| C10 | Inquilino nuevo a mitad de mes (R3) | Día de cobro 1; C se registra el 2026-10-11 con entrada ese día | Sin cobro de octubre automático; la generación manual de octubre crea el de C; el 2026-11-01 se genera el de noviembre de C |
| C11 | Quitar un cobro (R10, R11) | Se quita el cobro de agosto de A | Desaparece; el proceso no lo vuelve a crear; la generación manual de agosto sí |
| C12 | Mover un cobro (R10) | Cobro de octubre de A del 2026-10-01 se mueve al 2026-10-10 | Fecha 2026-10-10, mes octubre, marcado como editado; la chincheta del timeline se mueve al día 10 |
| C13 | Cambiar el importe (R10, R6) | Renta de octubre de A de 500 € a 450 €; después cambia su ocupación | 450 €, editado; luego desactualizado; recalcular pide confirmación |
| C14 | Una sola generación al mes (R2) | Tras generar octubre, el proceso corre el 2026-10-12 | No crea nada nuevo |

## Fuera de alcance

- Recordatorios y avisos de impago.
- Pagos parciales.
- Actualización anual de la renta (IPC).
- Conciliación con el banco.
- Marcar meses sin alquiler para que no se generen (por ejemplo, el verano); en el MVP se quitan a mano (R10).

## Tareas

- [ ] Función de dominio: qué cobros faltan para un inmueble, una fecha y su día de cobro
- [ ] Día de cobro en las opciones del inmueble
- [ ] Proceso diario (cron de Vercel), registro de la generación mensual y generación manual
- [ ] Marcado de desactualizados al cambiar ocupaciones o precios
- [ ] Marcar y desmarcar pagado
- [ ] Editar, mover, quitar y añadir cobros a mano
- [ ] Tests C1–C14
