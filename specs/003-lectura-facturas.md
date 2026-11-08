# 003 · Lectura de facturas con IA

Estado: aprobada · Paquetes: `packages/domain` (validaciones, duplicados), `apps/api` (subida y extracción)

## Objetivo

La usuaria sube uno o varios PDF de facturas de un inmueble de una sola vez. La IA propone, para cada factura, el periodo, el importe y el tipo de gasto; la usuaria revisa y confirma, una a una o todas a la vez. Al confirmar, la factura queda lista para el reparto de la spec 001. La IA nunca confirma nada por su cuenta.

**Entrada:** de 1 a 20 PDF y el inmueble al que pertenecen.
**Salida:** por cada PDF, una factura confirmada con tipo de gasto, periodo (inicio y fin) e importe total en céntimos.

## Reglas

- **R1** — El sistema solo aceptará ficheros PDF de hasta 10 MB cada uno, y hasta **20 PDF por subida**. Un PDF es una sola factura. Un fichero no válido se rechaza sin afectar al resto del lote.
- **R2** — La IA extraerá únicamente: fecha de inicio del periodo, fecha de fin del periodo e importe total. No se extrae compañía ni consumo. Además **sugerirá el tipo de gasto** entre los tipos que existen en el inmueble (por ejemplo, "Luz" si la factura es de electricidad).
- **R3** — El tipo de gasto sale de la lista de tipos del inmueble (texto libre que define la usuaria: "Luz", "Agua", "Comunidad"…). La sugerencia de la IA es solo una propuesta: la usuaria la confirma o la cambia, y puede crear un tipo nuevo en ese momento. Si ningún tipo encaja, la IA deja el campo vacío.
- **R4** — Si la IA no encuentra un campo, lo dejará vacío y la usuaria deberá rellenarlo antes de confirmar. Nunca se inventa un valor.
- **R5** — La usuaria podrá editar cualquier campo antes de confirmar. Nada se reparte sin su confirmación.
- **R6** — Al confirmar, si ya existe otra factura del mismo tipo de gasto e inmueble cuyo periodo se solapa (al menos un día en común), el sistema avisará y mostrará esa factura. La usuaria decide si continúa o cancela.
- **R7** — Se guardarán tanto los valores propuestos por la IA como los confirmados, para medir el acierto de la IA.
- **R8** — Si la IA falla o tarda más de 60 s, la usuaria podrá rellenar los campos a mano. El PDF se conserva igualmente.
- **R9** — Validaciones al confirmar: fin igual o posterior a inicio; importe entero en céntimos mayor que cero.
- **R10** — A la IA solo se envía el PDF y la lista de nombres de tipos de gasto del inmueble, sin ningún otro dato del inmueble ni de los inquilinos. El PDF se guarda en el bucket privado (ver `docs/rgpd.md`).
- **R11** — Toda factura confirmada se reparte entre los inquilinos según la spec 001. No hay gastos que solo se registren.

**Subida múltiple**

- **R12** — Las facturas de un lote se leen en paralelo y de forma independiente: si una falla, las demás siguen (R8).
- **R13** — Tras la subida, las facturas aparecen en una lista **por revisar**. Se pueden confirmar una a una o con **"Confirmar todas"**, que confirma las que están completas y deja en la lista las que tienen algún campo vacío. Al terminar, la app propone agrupar las confirmadas en una liquidación (spec 011).
- **R14** — El aviso de solapes (R6) también compara las facturas del mismo lote entre sí.
- **R15** — Si en un lote hay más facturas que lecturas de IA disponibles en el plan (spec 010, R2), se leen con IA las primeras en orden de subida y las demás quedan para rellenar a mano.

Estados de la factura: `subida` → `propuesta` (o `error_extraccion`) → `confirmada` → `repartida`.

## Casos de prueba

Con un extractor de IA simulado (interfaz `InvoiceExtractor`), salvo C10.

| # | Caso | Datos | Resultado esperado |
| --- | --- | --- | --- |
| C1 | Extracción completa | La IA devuelve 01/09–30/09 y 87,45 € | Propuesta con inicio 2026-09-01, fin 2026-09-30, importe 8745 |
| C2 | Campo no encontrado (R4) | La IA no devuelve periodo | Periodo vacío; confirmar sin rellenarlo da error |
| C3 | Fichero no PDF (R1) | Se sube un JPG | Rechazado antes de llamar a la IA |
| C4 | Fichero grande (R1) | PDF de 12 MB | Rechazado antes de llamar a la IA |
| C5 | Duplicado exacto (R6) | Ya existe "Luz" 01/09–30/09; se confirma otra "Luz" 01/09–30/09 | Aviso con la factura existente; si la usuaria continúa, se guarda |
| C6 | Solape parcial (R6) | Existe "Luz" 01/08–15/09; nueva "Luz" 10/09–10/10 | Aviso |
| C7 | Periodos contiguos | Existe "Luz" 01/08–31/08; nueva "Luz" 01/09–30/09 | Sin aviso |
| C8 | Mismo periodo, otro tipo | Existe "Luz" 01/09–30/09; nueva "Agua" 01/09–30/09 | Sin aviso |
| C9 | Edición de la usuaria (R5, R7) | La IA propone 87,45 €; la usuaria confirma 78,45 € | Confirmada 7845; propuesta original 8745 guardada |
| C10 | Fallo de la IA (R8) | El extractor lanza un error | Estado `error_extraccion`; la usuaria rellena a mano y confirma |
| C11 | Validación (R9) | Fin 2026-08-31, inicio 2026-09-01 | Error al confirmar |
| C12 | Subida múltiple (R1, R12) | Lote con luz de octubre, luz de noviembre y gas de septiembre a noviembre | Tres facturas en "por revisar", cada una con su propuesta |
| C13 | Tipo sugerido (R2, R3) | Tipos del inmueble: "Luz" y "Gas"; factura de electricidad | Tipo sugerido "Luz"; la usuaria puede cambiarlo |
| C14 | Sin tipo que encaje (R3) | Tipos "Luz" y "Gas"; factura de agua | Tipo vacío; no se puede confirmar sin elegirlo o crearlo |
| C15 | Fichero no válido en un lote (R1) | Lote de 3 PDF y 1 JPG | Se rechaza el JPG; los 3 PDF se procesan |
| C16 | Más de 20 PDF (R1) | Lote de 21 PDF | Se rechaza la subida antes de llamar a la IA |
| C17 | Confirmar todas (R13) | Lote de 3; una sin importe | Se confirman 2; la tercera sigue por revisar |
| C18 | Duplicado dentro del lote (R14) | La luz de octubre dos veces en el mismo lote | Aviso de solape entre ambas |
| C19 | Límite de IA en un lote (R15) | Plan Gratis sin lecturas usadas; lote de 5 | Se leen con IA las 2 primeras; las otras 3 quedan para rellenar a mano |

**Evaluación de la IA** (aparte de los tests): con 15-20 PDF reales de distintos tipos y compañías, la IA debe acertar periodo e importe en al menos el 90 % de los casos.

## Fuera de alcance

- Fotos o imágenes de facturas (más adelante).
- Varias facturas en un mismo PDF.
- Compañía, consumo y número de factura.
- El reparto entre inquilinos (spec 001).
- Abonos o facturas con importe negativo.
- El alquiler no es un tipo de gasto: lo calcula la spec 002 y se genera cada mes (spec 005).

## Tareas

- [x] Validación de fichero (R1) y de confirmación (R9) en `packages/domain`
- [x] Detección de solapes de periodo (R6) en `packages/domain`
- [ ] Interfaz `InvoiceExtractor` y su implementación con Bedrock (prompt y salida estructurada)
- [ ] Endpoints de subida, propuesta y confirmación en `apps/api`
- [ ] Subida múltiple, lista por revisar y "Confirmar todas"
- [ ] Solapes dentro del lote y reparto de lecturas de IA en `packages/domain`
- [ ] Tests C1–C19
- [ ] Evaluación con PDF reales
