# 007 · Gestión de inmuebles, habitaciones, inquilinos y ocupaciones

Estado: aprobada · Paquetes: `packages/domain` (validaciones, precio vigente), `apps/api`, `apps/web`

## Objetivo

Dar de alta y mantener inmuebles, habitaciones, tipos de gasto, inquilinos y sus estancias, con los datos mínimos y cumpliendo el RGPD al archivar o borrar.

## Reglas

**Alta del inmueble**

- **R1** — Asistente por pasos: (1) nombre y dirección; (2) modalidad, meses parciales y día de cobro; (3) habitaciones con su precio; (4) tipos de gasto; (5) inquilinos. Obligatorio: nombre, modalidad y al menos una habitación con precio. La dirección y los pasos 4 y 5 son opcionales. Valores por defecto: mes completo y día de cobro 1.
- **R2** — La modalidad no se puede cambiar después de crear el inmueble (spec 002). El resto de opciones sí.
- **R2b** — Los límites de inmuebles de cada plan (spec 010, R1) se aplican cuando haya planes de pago (tarea 8.6 del plan); hasta entonces no hay límite.

**Habitaciones y precios**

- **R3** — Una habitación tiene nombre y precio mensual. Un piso alquilado entero es una sola habitación. El precio inicial aplica **desde el mes del alta**; se puede indicar un mes anterior (por ejemplo, si el inquilino ya vivía allí). Queda en el historial como cualquier otro cambio.
- **R4** — Un cambio de precio se indica con el **mes desde el que aplica** ("550 € desde enero de 2027"). Aplica a ese mes y a los siguientes; los anteriores conservan su precio. Se guarda el historial de precios.
- **R5** — Si un cambio de precio afecta a meses con cobros ya generados, esos cobros quedan desactualizados (spec 005, R6). Se implementa con los cobros (tarea 4.3 del plan).

**Inquilinos y estancias**

- **R6** — De un inquilino solo se guarda su **nombre**, obligatorio. No se guardan DNI, email, teléfono ni notas. Como documentos solo se pueden subir, opcionalmente, el contrato firmado y el justificante de la fianza (en PDF).
- **R7** — Una ocupación tiene habitación, fecha de entrada (obligatoria) y fecha de salida (opcional). No puede solaparse con otra de la misma habitación (spec 001, R8).
- **R8** — Cambiar de habitación es cerrar la ocupación actual y abrir otra nueva para el mismo inquilino.
- **R9** — Cuando un inquilino se va, se le pone fecha de salida. Su enlace caduca 3 meses después (spec 004).

**Tipos de gasto**

- **R10** — Un tipo de gasto tiene nombre y color (spec 006). Se puede renombrar y cambiar de color.

**Archivar y borrar (RGPD)**

- **R11** — Lo que tiene historial (cobros, facturas o repartos) se **archiva**: deja de aparecer en las listas, pero su historial sigue visible. Lo que no tiene historial se puede borrar.
- **R12** — **Borrar un inquilino** (derecho de supresión): se eliminan sus documentos, su fianza, sus ficheros y su enlace; en los cobros y repartos antiguos su nombre pasa a ser "Inquilino 1", "Inquilino 2"… y los importes no cambian. Pide confirmación.
- **R13** — **Borrar un inmueble** elimina todo lo que contiene, incluidas facturas y ficheros. Pide confirmación escribiendo el nombre del inmueble.
- **R14** — Los plazos de conservación de `docs/rgpd.md` se aplican igual a lo archivado: cuando vence un plazo, la app avisa a la propietaria.

## Casos de prueba

| # | Caso | Datos | Resultado esperado |
| --- | --- | --- | --- |
| C1 | Alta mínima (R1) | Nombre "Piso Centro", modalidad por habitaciones, H1 500 € | Inmueble creado con mes completo y día de cobro 1; sin dirección |
| C2 | Sin habitaciones (R1) | Alta sin ninguna habitación | Error de validación |
| C3 | Cambio de precio (R4) | H1 500 €; cambio a 550 € desde 2027-01 | Diciembre de 2026: 500 €; enero de 2027: 550 € |
| C4 | Cambio a un mes con cobros (R5) | Cobro de noviembre de 2026 generado; cambio de precio desde 2026-11 | Cobro de noviembre desactualizado |
| C5 | Inquilino sin nombre (R6) | Nombre vacío | Error de validación |
| C6 | Solape (R7) | H1: A desde el 2026-09-01 sin salida; B entra el 2026-10-01 | Error de validación |
| C7 | Cambio de habitación (R8) | A en H1 hasta el 2026-10-14; en H2 desde el 2026-10-15 | Dos ocupaciones del mismo inquilino |
| C8 | Archivar o borrar (R11) | H3 con cobros; H4 sin historial | H3 solo se puede archivar; H4 se puede borrar |
| C9 | Borrar inquilino (R12) | Se borra a A, con cobros y repartos | Aparece como "Inquilino 1"; los importes no cambian; su enlace ya no funciona; sus ficheros no existen |
| C10 | Borrar inmueble (R13) | Confirmación con un nombre distinto | No se borra |

## Fuera de alcance

- Cambiar la modalidad de un inmueble.
- Cambios de precio a mitad de mes.
- Importar inquilinos o inmuebles desde Excel.

## Tareas

- [x] Validaciones y precio vigente por mes en `packages/domain`
- [x] Historial de precios por habitación (API)
- [ ] Asistente de alta del inmueble
- [ ] Formularios de habitaciones, tipos de gasto, inquilinos y ocupaciones
- [ ] Archivar, borrar y anonimizar
- [ ] Tests C1–C10 (hechos: C1, C2, C3, C5, C6, C7; C4 con la tarea 4.3; C8–C10 con la tarea 3.7)
