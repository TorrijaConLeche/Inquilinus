# 009 · Panel principal y cobros del inmueble

Estado: aprobada · Paquetes: `packages/domain` (pendientes y totales), `apps/api`, `apps/web`

## Objetivo

Saber de un vistazo qué hay pendiente de cobro, en qué casa y de quién, y marcar pagos en un toque.

## Reglas

**Panel principal**

- **R1** — Arriba, un resumen con el **total pendiente de cobro** (alquiler y gastos de todos los inmuebles) y lo **cobrado este mes**.
- **R2** — Debajo, los **pendientes agrupados por inmueble y por inquilino**: cada inquilino con sus conceptos pendientes ("Alquiler octubre 500 €", "Luz septiembre 30 €") y su total. Los inmuebles sin pendientes no aparecen en este bloque. No se muestra la ocupación. Los gastos de una liquidación aparecen como una sola línea desplegable (spec 011, R12).
- **R3** — Los pendientes de meses anteriores al actual aparecen destacados y primero.
- **R4** — Avisos, si los hay: facturas propuestas por la IA pendientes de revisar, cobros desactualizados y plazos de conservación vencidos (spec 007, R14).
- **R5** — Una tarjeta por inmueble con su nombre y su pendiente. Al tocarla se abre el inmueble; al tocar un inquilino del bloque de pendientes se abre la pantalla de cobros de su inmueble.

**Cobros del inmueble** (pantalla dentro de cada inmueble)

- **R6** — Selector de mes; por defecto, el mes en curso.
- **R7** — Arriba, destacados, los pendientes de meses anteriores de ese inmueble, cada uno con su mes.
- **R8** — Para el mes elegido, por cada inquilino: su cobro de alquiler y sus partes de gastos, cada uno pagado (con fecha) o pendiente. Una parte de gasto pertenece al mes en que se reparte la factura (no al de su periodo); si está en una liquidación, al mes en que se crea la liquidación (spec 011, R11).
- **R9** — **Un toque** marca un concepto como pagado con la fecha de hoy. La fecha se puede cambiar y el marcado se puede deshacer.
- **R10** — Botón **"Todo pagado"** por inquilino y mes: marca como pagados, con la fecha de hoy, su alquiler y todas sus partes de gastos pendientes de ese mes. Se puede deshacer.
- **R11** — Al pie, los totales del mes del inmueble (cobrado y pendiente) y, aparte, lo que asume la propietaria por habitaciones vacías o días sin ocupar.
- **R12** — Los cobros quitados (spec 005, R11) no aparecen ni cuentan en ningún total.

## Casos de prueba

Hoy es el 2026-10-20. Piso Centro: A con alquiler de octubre de 500 € pendiente y alquiler de septiembre de 500 € pendiente; B con luz de 30 € (repartida el 2026-10-03) pendiente. Ático: todo pagado; en octubre se han cobrado 700 €.

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Resumen (R1) | Pendiente 1.030 €; cobrado este mes 700 € |
| C2 | Agrupación (R2) | Piso Centro → A 1.000 €, B 30 €; Ático no aparece en pendientes |
| C3 | Meses anteriores (R3, R7) | "Alquiler septiembre 500 €" de A destacado y primero |
| C4 | Un toque (R9) | Luz de B pagada con fecha 2026-10-20; al deshacer, vuelve a pendiente |
| C5 | Todo pagado (R10) | En octubre, A: alquiler de octubre pagado; el de septiembre sigue pendiente |
| C6 | Mes del gasto (R8) | La luz de B (periodo de septiembre, repartida el 3 de octubre) aparece en octubre |
| C7 | Cobro quitado (R12) | Si se quita el cobro de septiembre de A, el pendiente total baja a 530 € |
| C8 | Aviso de revisión (R4) | Con una factura propuesta sin confirmar, aparece el aviso en el panel |

## Fuera de alcance

- Gráficas de ingresos y gastos.
- Recordatorios de impago (spec 005, R9).

## Tareas

- [x] Funciones de dominio: pendientes por inmueble e inquilino, totales del mes
- [ ] Panel principal
- [ ] Pantalla de cobros del inmueble con selector de mes
- [ ] Marcar pagado, "Todo pagado" y deshacer
- [ ] Tests C1–C8
