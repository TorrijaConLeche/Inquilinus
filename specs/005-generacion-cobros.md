# 005 · Generación de cobros de alquiler

Estado: borrador · Paquetes: `packages/domain` (qué cobros tocan), `apps/api` (proceso diario y endpoints)

## Objetivo

Crear cada mes, sin que la propietaria tenga que acordarse, el cobro de alquiler de cada inquilino con el cálculo de la spec 002. También se pueden generar a mano. Cada cobro está pagado o pendiente.

## Reglas

- **R1** — Cada inmueble tiene un **día de cobro** (del 1 al 28), configurable en sus opciones. Por defecto, el 1.
- **R2** — Un proceso diario genera, en cada inmueble cuyo día de cobro de este mes ya ha llegado, los cobros del **mes en curso** de cada inquilino presente al menos un día ese mes. Usa el cálculo de la spec 002 con las ocupaciones y precios de ese momento.
- **R3** — Al registrar un inquilino nuevo no se genera su cobro en ese momento. Lo crea el siguiente proceso diario según R2. ⚠️ *Pendiente de confirmar: ver P1.*
- **R4** — Nunca se duplica un cobro: si ya existe el de ese inquilino y mes, no se toca.
- **R5** — La propietaria puede generar a mano los cobros de un mes concreto de un inmueble, también de meses pasados. Usa el mismo cálculo y respeta R4.
- **R6** — Si cambian las ocupaciones o los precios de un mes que ya tiene cobros, esos cobros se marcan como **desactualizados**. La propietaria decide si recalcularlos. Si un cobro desactualizado ya estaba pagado, al recalcularlo se pide confirmación y sigue como pagado.
- **R7** — Estados: pendiente o pagado (con fecha). Se puede marcar y desmarcar.
- **R8** — El proceso corre una vez al día y el día se evalúa en hora de Madrid. Si un día falla, el siguiente genera lo que faltó del mes en curso (consecuencia de R2 y R4).
- **R9** — No hay recordatorios de impago en el MVP: los pendientes solo se ven en la app y en el enlace del inquilino.

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
| C10 | Inquilino nuevo a mitad de mes (R3) | Día de cobro 1; C se registra el 2026-10-11 con entrada ese día | Pendiente de P1 |

## Fuera de alcance

- Recordatorios y avisos de impago.
- Pagos parciales.
- Actualización anual de la renta (IPC).
- Conciliación con el banco.

## Preguntas abiertas

- **P1** — Si un inquilino entra el 11 de octubre y el día de cobro es el 1, ¿cómo se genera su cobro de octubre? Propuesta: lo crea el proceso diario de esa misma noche, sin que tengas que hacer nada. Alternativa: no se genera solo y lo creas tú a mano cuando quieras.

## Tareas

- [ ] Función de dominio: qué cobros faltan para un inmueble, una fecha y su día de cobro
- [ ] Día de cobro en las opciones del inmueble
- [ ] Proceso diario (cron de Vercel) y generación manual
- [ ] Marcado de desactualizados al cambiar ocupaciones o precios
- [ ] Marcar y desmarcar pagado
- [ ] Tests C1–C10
