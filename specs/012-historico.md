# 012 · Histórico del inmueble

Estado: borrador · Paquetes: `packages/domain` (filtros y agrupación), `apps/api` (registro de actividad), `apps/web`

## Objetivo

Cada inmueble tiene un **histórico** con todo lo que ha pasado: cobros, pagos, facturas, liquidaciones, entradas y salidas de inquilinos y cambios. Se abre desde el inmueble y se puede filtrar por inquilino, por tipo de gasto, por tipo de actividad y por fechas, para que cualquier duda se aclare consultándolo.

## Reglas

**Qué se registra**

- **R1** — Cada inmueble tiene su histórico. Se abre desde el detalle del inmueble (pantalla 2) y sustituye a la lista de movimientos bajo el timeline (spec 006, R13).
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
- **R4** — Cada actividad que cambia un importe muestra el valor anterior y el nuevo (por ejemplo, "Renta de octubre de Alex: 500 € → 450 €").

**Consultar**

- **R5** — Orden cronológico, lo más reciente primero, agrupado por mes.
- **R6** — **Filtros**, combinables: inquilino (uno o varios), tipo de gasto (uno o varios, y "Alquiler"), grupo de actividad (R2), estado de pago (pagado o pendiente) y rango de fechas. Los filtros activos se ven siempre y se quitan con un toque.
- **R7** — Con filtros, arriba aparece un resumen de lo filtrado: total cobrado y total pendiente. Por ejemplo, filtrando por Alex y "Luz" se ve lo que ha pagado y lo que debe de luz.
- **R8** — Al pulsar una actividad se abre su detalle: la ventana del cobro, de la factura o de la liquidación (specs 006 y 011), con el cálculo y el PDF cuando corresponda.
- **R9** — Se puede **exportar** lo filtrado a CSV para el gestor o para resolver una duda.

**Inquilinos y RGPD**

- **R10** — En su enlace (spec 004), el inquilino ve **su** histórico de dinero: cobros, gastos, liquidaciones, pagos y fianza que le afectan, con filtros por tipo de gasto y fechas. No ve las actividades de los demás ni los cambios internos (ediciones, enlaces, opciones del inmueble).
- **R11** — El histórico no guarda más datos personales que el nombre del inquilino. Si se borra un inquilino, en su histórico aparece como "Inquilino N" (spec 007, R12).
- **R12** — Un inmueble bloqueado por el plan (spec 010, R10b) tampoco permite ver su histórico, pero se incluye en la exportación de datos de la cuenta (spec 010, R10f).

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
| C7 | Exportar (R9) | El CSV contiene exactamente las actividades filtradas |
| C8 | Vista del inquilino (R10) | Jorge ve sus cobros, su parte de la luz y sus pagos; no ve los de Alex ni la edición interna |
| C9 | Inquilino borrado (R11) | Sus actividades aparecen como "Inquilino 1" con los mismos importes |

## Fuera de alcance

- Histórico de toda la cuenta mezclando inmuebles.
- Deshacer acciones desde el histórico.
- Exportar a PDF.

## Preguntas abiertas

- **P1** — ¿Te sirve que el inquilino vea solo su histórico de dinero (R10), sin los cambios internos?
- **P2** — ¿Hace falta exportar a CSV en el MVP (R9), o lo dejamos para más adelante?

## Tareas

- [ ] Registro de actividad en la API (cada acción de las specs 003-011 escribe su actividad)
- [ ] Dominio: filtros combinados y resumen de lo filtrado
- [ ] Pantalla de histórico con filtros y detalle
- [ ] Exportación a CSV
- [ ] Histórico del inquilino en su enlace
- [ ] Tests C1–C9
