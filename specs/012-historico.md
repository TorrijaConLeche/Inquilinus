# 012 · Histórico del inmueble

Estado: aprobada · Paquetes: `packages/domain` (filtros y agrupación), `apps/api` (registro de actividad), `apps/web`

## Objetivo

Cada inmueble tiene un **histórico** con todo lo que ha pasado: cobros, pagos, facturas, liquidaciones, entradas y salidas de inquilinos y cambios. Se abre desde el inmueble y se puede filtrar por inquilino, por tipo de gasto, por tipo de actividad y por fechas, para que cualquier duda se aclare consultándolo.

## Reglas

**Qué se registra**

- **R1** — Cada inmueble tiene su histórico. Se abre desde el detalle del inmueble (pantalla 2) y sustituye a la lista de movimientos bajo el timeline (spec 006, R13).
- **R1b** — Bajo el timeline se ven las últimas actividades y un enlace «Ver todo el histórico» a su pantalla, con los filtros, el resumen y la agrupación por mes.
- **R2** — El histórico incluye estos tipos de actividad, cada uno con su fecha y su detalle:

| Grupo | Actividades |
| --- | --- |
| Alquiler | Cobro generado (automático o a mano), editado, movido, quitado y restaurado |
| Gastos | Factura subida, confirmada y repartida; reparto recalculado |
| Liquidaciones | Creada, renombrada, factura añadida o quitada, borrada |
| Pagos | Concepto marcado como pagado o desmarcado; "Todo pagado"; liquidación marcada como pagada |
| Inquilinos | Entrada, salida, cambio de habitación, alta y borrado (anonimizado) |
| Inmueble | Cambio de precio de una habitación, de día de cobro o de opciones; habitación o tipo de gasto creado o archivado |
| Fianza | Recibida y devuelta (total o parcialmente) |
| Enlaces | Enlace generado, revocado o regenerado; descarga habilitada o deshabilitada |

- **R3** — El registro es **solo de lectura**: nada del histórico se puede editar ni borrar. Si algo se corrige, la corrección aparece como una actividad nueva.
- **R3b** — Lo ocurrido antes de que existiera el histórico se reconstruye una vez a partir de los datos guardados: cobros generados, pagados y quitados; facturas subidas y repartidas y partes pagadas; liquidaciones creadas; entradas y salidas ya ocurridas; fianzas recibidas y devueltas; habitaciones y tipos de gasto creados. Cada una con su fecha. Las ediciones anteriores (importe antes y después) no se conocen y no aparecen.
- **R3c** — Las actividades de los enlaces llegan con ellos (spec 004, tarea 6.4): generado, regenerado, revocado y descarga habilitada o deshabilitada.
- **R4** — Cada actividad que cambia un importe muestra el valor anterior y el nuevo (por ejemplo, "Renta de octubre de Alex: 500 € → 450 €").

**Consultar**

- **R5** — Orden cronológico, lo más reciente primero, agrupado por mes.
- **R6** — **Filtros**, combinables: inquilino (uno o varios), tipo de gasto (uno o varios, y "Alquiler"), grupo de actividad (R2), estado de pago (pagado o pendiente) y rango de fechas. Los filtros activos se ven siempre y se quitan con un toque.
- **R7** — Con filtros, arriba aparece un resumen de lo filtrado: total cobrado y total pendiente. Por ejemplo, filtrando por Alex y "Luz" se ve lo que ha pagado y lo que debe de luz.
- **R7b** — El estado de pago (filtro y resumen) es el de **hoy** de los conceptos a los que se refiere cada actividad: cobros de alquiler y partes de facturas, de los inquilinos filtrados. Cada concepto cuenta una sola vez en el resumen aunque aparezca en varias actividades.
- **R8** — Al pulsar una actividad se abre su detalle: la ventana del cobro, de la factura o de la liquidación (specs 006 y 011), con el cálculo y el PDF cuando corresponda.

**Inquilinos y RGPD**

- **R9** — En su enlace (spec 004), el inquilino ve **su** histórico de dinero: cobros, gastos, liquidaciones, pagos y fianza que le afectan, con filtros por tipo de gasto y fechas. No ve las actividades de los demás ni los cambios internos (ediciones, enlaces, opciones del inmueble).
- **R10** — El histórico no guarda más datos personales que el nombre del inquilino. Si se borra un inquilino, en su histórico aparece como "Inquilino N" (spec 007, R12).
- **R11** — Un inmueble bloqueado por el plan (spec 010, R10b) tampoco permite ver su histórico, pero se incluye en la exportación de datos de la cuenta (spec 010, R10f).

## Casos de prueba

Piso Centro con Alex y Jorge. En octubre: cobros de alquiler de los dos; luz de septiembre repartida (Alex 20 €, Jorge 20 €); Alex paga su alquiler y su luz; se edita la renta de Jorge de 400 € a 380 €.

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Sin filtros (R2, R5) | Todas las actividades de octubre, de la más reciente a la más antigua |
| C2 | Filtro por inquilino (R6) | Solo las actividades de Alex |
| C3 | Filtro por tipo de gasto (R6) | Con "Luz": la factura, su reparto y los pagos de luz |
| C4 | Filtros combinados y resumen (R6, R7) | Alex + "Luz": pagado 20 €, pendiente 0 € |
| C5 | Cambio de importe (R4) | "Renta de octubre de Jorge: 400 € → 380 €" |
| C6 | Solo lectura (R3) | No hay forma de editar ni borrar una actividad |
| C8 | Vista del inquilino (R9) | Jorge ve sus cobros, su parte de la luz y sus pagos; no ve los de Alex ni la edición interna |
| C9 | Inquilino borrado (R10) | Sus actividades aparecen como "Inquilino 1" con los mismos importes |

## Fuera de alcance

- Histórico de toda la cuenta mezclando inmuebles.
- Deshacer acciones desde el histórico.
- Exportar el histórico (CSV o PDF); se valorará si hace falta.

## Tareas

- [x] Registro de actividad en la API (cada acción de las specs 003-011 escribe su actividad; las de los enlaces, con la tarea 6.4) y reconstrucción de lo anterior
- [x] Dominio: filtros combinados y resumen de lo filtrado
- [x] Pantalla de histórico con filtros y detalle
- [x] Histórico del inquilino en su enlace (tarea 6.5): la lista de su vista con filtros (spec 004, R6b)
- [x] Tests C1–C6 y C9 (C8 con el enlace del inquilino, tarea 6.5)
