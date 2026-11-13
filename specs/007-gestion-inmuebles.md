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

**Documentos y fianza**

- **R6b** — Cada inquilino tiene como mucho **un contrato y un justificante de la fianza**. Solo PDF (se comprueba el contenido, no la extensión) y hasta 10 MB. Subir otro del mismo tipo reemplaza al anterior, que se borra del almacenamiento. Se pueden borrar. Nunca se envían a la IA ni aparecen en el enlace del inquilino (spec 004, R9).
- **R6c** — El fichero se sube directamente al bucket privado con un permiso firmado que caduca a los 5 minutos y solo vale para esa subida. Lo subido y no confirmado se borra solo al día siguiente. Se descarga con una URL firmada que caduca a los 5 minutos, después de comprobar que el inquilino es de la propietaria.
- **R6d** — Cada inquilino tiene como mucho **una fianza**: importe (obligatorio, mayor que 0) y fecha en que se recibió (opcional). Al devolverla se indican **juntos** la fecha y el importe devuelto; el importe devuelto puede ser menor que la fianza (descuentos), nunca mayor, y la fecha no puede ser anterior a la de recepción. Notas opcionales de hasta 300 caracteres para explicar los descuentos; la pantalla pide no escribir datos personales en ellas.
- **R6e** — La fianza es solo un registro: no entra en los cobros ni en los repartos.

**Tipos de gasto**

- **R10** — Un tipo de gasto tiene nombre y color (spec 006). Se puede renombrar y cambiar de color.

**Archivar y borrar (RGPD)**

- **R11** — Lo que tiene historial se **archiva**: deja de aparecer en las listas, pero su historial sigue visible y se puede **restaurar**. Lo que no tiene historial se puede borrar. Una **habitación** tiene historial si ha tenido alguna estancia; un **tipo de gasto**, si tiene alguna factura.
- **R11b** — No se puede archivar una habitación ni un inmueble **con alguien viviendo**: una estancia sin salida, con salida de hoy en adelante o que aún no ha empezado. Tampoco se puede archivar ni borrar la **última habitación activa** de un inmueble.
- **R11c** — Un **inmueble** siempre se puede archivar (salvo R11b) y restaurar, y siempre se puede borrar (R13), tenga o no historial. Archivado, solo aparece en "Archivados" y se puede ver; no genera cobros ni cuenta en el panel (se aplica con las tareas 4.2 y 4.5).
- **R11d** — Los inquilinos con estancias que terminaron todas antes de hoy aparecen solos en una sección plegada **"Antiguos inquilinos"**. No hay botón de archivar inquilinos.
- **R12** — **Borrar un inquilino** (derecho de supresión), solo si no vive allí ni va a vivir (como R11b). Si tiene historial (cobros o repartos), se **anonimiza**: su nombre pasa a ser "Inquilino N" (el siguiente número libre en ese inmueble), se eliminan sus documentos, su fianza, sus ficheros y su enlace, y se conservan sus estancias, cobros y repartos con los mismos importes. Un inquilino anonimizado ya no se puede editar. Sin historial, se borra del todo con sus estancias. Pide confirmación.
- **R13** — **Borrar un inmueble** elimina todo lo que contiene, incluidas facturas y ficheros del bucket. Pide confirmación escribiendo el nombre del inmueble.
- **R14** — Los plazos de conservación de `docs/rgpd.md` se aplican igual a lo archivado: cuando vence un plazo, la app avisa a la propietaria. Se implementa cuando el asesor fije los plazos (tarea 6.6b del plan).

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
| C8 | Archivar o borrar (R11) | H3 con una estancia pasada; H4 sin estancias | H3 solo se puede archivar (y restaurar); H4 se puede borrar |
| C9 | Borrar inquilino (R12) | Se borra a A, con cobros y repartos | Aparece como "Inquilino 1"; los importes no cambian; su enlace ya no funciona; sus ficheros no existen |
| C10 | Borrar inmueble (R13) | Confirmación con un nombre distinto | No se borra |
| C11 | Documento que no es PDF (R6b) | Un fichero de texto con extensión `.pdf` | Error; no queda nada guardado ni en la base de datos ni en el bucket |
| C12 | Reemplazar el contrato (R6b) | A tiene contrato y se sube otro | A tiene un solo contrato; el fichero anterior ya no existe |
| C13 | Descarga ajena (R6c) | Otra propietaria pide el contrato de A | 404 |
| C14 | Devolución mayor que la fianza (R6d) | Fianza de 800 €; se devuelven 900 € | Error de validación |
| C15 | Devolución sin fecha (R6d) | Importe devuelto sin fecha de devolución | Error de validación |
| C16 | Archivar con alguien viviendo (R11b) | H1 con A desde el 2026-09-01 sin salida | Error; H1 sigue activa |
| C17 | Última habitación (R11b) | Inmueble con H1 activa y H2 archivada; se archiva H1 | Error |
| C18 | Antiguos inquilinos (R11d) | Hoy 2026-11-15; A salió el 2026-10-31; B sale el 2026-11-30 | A está en "Antiguos"; B no |
| C19 | Borrar inquilino sin historial (R12) | B sin cobros ni repartos, ya salió | B y sus estancias ya no existen |
| C20 | Borrar inquilino que vive allí (R12) | A sin salida | Error; A sigue igual |
| C21 | Tipo de gasto con facturas (R11) | "Luz" con una factura; "Agua" sin facturas | "Luz" solo se puede archivar; "Agua" se puede borrar |

## Fuera de alcance

- Cambiar la modalidad de un inmueble.
- Cambios de precio a mitad de mes.
- Importar inquilinos o inmuebles desde Excel.

## Tareas

- [x] Validaciones y precio vigente por mes en `packages/domain`
- [x] Historial de precios por habitación (API)
- [x] Asistente de alta del inmueble
- [x] Formularios de habitaciones, tipos de gasto, inquilinos y ocupaciones
- [x] Documentos (contrato y justificante de la fianza) y fianza
- [x] Archivar, borrar y anonimizar
- [x] Tests C1–C21
- [ ] Avisos de plazos de conservación (R14), con la tarea 6.6b
