# 011 · Liquidaciones

Estado: aprobada · Paquetes: `packages/domain` (totales, estado, nombre), `apps/api`, `apps/web`

## Objetivo

Agrupar varias facturas ya repartidas en una **liquidación** con número y nombre, para que propietaria e inquilinos hablen de lo mismo: "la liquidación 3: tu total es 80 €". Cada inquilino ve su total y, cuando quiera, el detalle de cada factura.

## Reglas

**Qué es**

- **R1** — Una liquidación pertenece a un inmueble y tiene un **número correlativo** por inmueble (1, 2, 3…). Un número nunca se reutiliza, aunque se borre la liquidación.
- **R2** — Al crearla recibe un **nombre automático**: "Liquidación N · " seguido de los meses que cubren sus facturas (por ejemplo, "Liquidación 1 · septiembre a noviembre de 2026"). La propietaria puede cambiarlo cuando quiera.
- **R3** — Contiene facturas confirmadas y repartidas del inmueble, sin importar cuándo ni cómo se subieron. Una factura está como mucho en una liquidación. Una factura puede quedar **suelta**, fuera de toda liquidación, y se cobra por separado como hasta ahora.

**Crear y cambiar**

- **R4** — Al confirmar un lote (spec 003, R13), la app **propone** crear una liquidación con las facturas confirmadas de ese lote. La propietaria acepta, quita o añade facturas, o la descarta.
- **R5** — También se puede crear una liquidación a mano, eligiendo facturas sueltas del inmueble.
- **R6** — Se pueden añadir o quitar facturas en cualquier momento. Si algún inquilino ya ha pagado partes de la liquidación, se pide confirmación; las partes pagadas siguen pagadas.
- **R7** — Borrar una liquidación deja sus facturas sueltas. No se pierde ningún pago.

**Totales y pagos**

- **R8** — El **total de cada inquilino** es la suma de sus partes en las facturas de la liquidación. El total de la liquidación es la suma de sus facturas; lo que asume la propietaria (días sin ocupar) se muestra aparte.
- **R9** — Estado de cada inquilino en la liquidación: **pagada** (todas sus partes pagadas), **parcial** (alguna) o **pendiente** (ninguna). Se muestra lo que le falta por pagar.
- **R10** — **"Marcar pagada"** para un inquilino marca como pagadas, con la fecha de hoy, todas sus partes pendientes de la liquidación. Se puede deshacer. Pagar factura a factura sigue siendo posible.
- **R11** — Para los cobros del inmueble (spec 009, R8), una liquidación pertenece al mes en que se crea. Una factura suelta sigue perteneciendo al mes en que se reparte.

**Dónde se ve**

- **R12** — **Panel principal** (spec 009): las partes pendientes de una liquidación aparecen como **una sola línea** por inquilino ("Liquidación 3 · 47,30 €"). Al desplegarla se ve cada factura con su tipo, periodo, importe total, la parte del inquilino, sus días y su estado, con acceso al detalle del cálculo y al PDF.
- **R13** — **Cobros del inmueble** (spec 009): igual que en el panel, una línea por liquidación y por inquilino, desplegable, con su botón "Marcar pagada".
- **R14** — **Timeline** (spec 006): las barras de las facturas no cambian. En la ventana de una factura se indica a qué liquidación pertenece, y la lista de movimientos muestra cada liquidación como un elemento que, al pulsarlo, abre su detalle.
- **R15** — **Enlace del inquilino** (spec 004): ve sus liquidaciones con su total, su estado y el desglose por factura, y puede descargar los PDF si la descarga está habilitada. Nunca ve lo que han pagado los demás (spec 004, R7b).

## Casos de prueba

Piso Centro con A y B todo el periodo. Facturas repartidas: luz de octubre 40 € (A 20, B 20), luz de noviembre 30 € (A 15, B 15) y gas del 1 de septiembre al 30 de noviembre 90 € (A 45, B 45).

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Propuesta al confirmar un lote (R4, R2) | Se propone la "Liquidación 1 · septiembre a noviembre de 2026" con las 3 facturas |
| C2 | Numeración (R1) | La siguiente es la 2; si se borra la 2, la siguiente es la 3 |
| C3 | Totales (R8) | A 80 €, B 80 €; total de la liquidación 160 € |
| C4 | Factura en dos liquidaciones (R3) | Error de validación |
| C5 | Marcar pagada (R10) | A: sus 3 partes pagadas hoy, estado pagada; B sigue pendiente |
| C6 | Pago parcial (R9) | B paga la luz de octubre: estado parcial, le faltan 60 € |
| C7 | Panel agrupado (R12) | Una línea "Liquidación 1 · 80 €" para B; al desplegarla, las 3 facturas con su parte |
| C8 | Factura suelta (R3) | La luz de diciembre, fuera de toda liquidación, aparece suelta |
| C9 | Vista del inquilino (R15) | A ve su total de 80 € y el desglose; no ve el estado de B |
| C10 | Añadir una factura con pagos (R6) | Se pide confirmación; el total de A sube; sus partes pagadas siguen pagadas y pasa a parcial |
| C11 | Borrar la liquidación (R7) | Las 3 facturas quedan sueltas y los pagos se conservan |
| C12 | Renombrar (R2) | El nuevo nombre aparece en el panel y en el enlace del inquilino |

## Fuera de alcance

- Incluir cobros de alquiler en una liquidación (solo facturas de gastos).
- Liquidaciones que mezclen varios inmuebles.
- Generar un PDF de la liquidación.

## Tareas

- [ ] Dominio: totales, estado por inquilino, nombre automático y numeración
- [ ] API: crear (desde lote o a mano), cambiar, renombrar, borrar y marcar pagada
- [ ] Propuesta al confirmar un lote
- [ ] Panel y cobros del inmueble agrupados y desplegables
- [ ] Liquidaciones en el timeline y en el enlace del inquilino
- [ ] Tests C1–C12
