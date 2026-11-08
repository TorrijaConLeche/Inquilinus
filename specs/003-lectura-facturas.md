# 003 · Lectura de facturas con IA

Estado: aprobada · Paquetes: `packages/domain` (validaciones, duplicados), `apps/api` (subida y extracción)

## Objetivo

La usuaria sube el PDF de una factura de un inmueble. La IA propone el periodo y el importe; la usuaria elige el tipo de gasto, revisa y confirma. Al confirmar, la factura queda lista para el reparto de la spec 001. La IA nunca confirma nada por su cuenta.

**Entrada:** PDF y el inmueble al que pertenece.
**Salida:** factura confirmada con tipo de gasto, periodo (inicio y fin) e importe total en céntimos.

## Reglas

- **R1** — El sistema solo aceptará ficheros PDF de hasta 10 MB. Un PDF es una sola factura.
- **R2** — La IA extraerá únicamente: fecha de inicio del periodo, fecha de fin del periodo e importe total. No se extrae compañía ni consumo.
- **R3** — El tipo de gasto lo elige la usuaria de la lista de tipos del inmueble (texto libre que ella define: "Luz", "Agua", "Comunidad"…). Puede crear uno nuevo en ese momento.
- **R4** — Si la IA no encuentra un campo, lo dejará vacío y la usuaria deberá rellenarlo antes de confirmar. Nunca se inventa un valor.
- **R5** — La usuaria podrá editar cualquier campo antes de confirmar. Nada se reparte sin su confirmación.
- **R6** — Al confirmar, si ya existe otra factura del mismo tipo de gasto e inmueble cuyo periodo se solapa (al menos un día en común), el sistema avisará y mostrará esa factura. La usuaria decide si continúa o cancela.
- **R7** — Se guardarán tanto los valores propuestos por la IA como los confirmados, para medir el acierto de la IA.
- **R8** — Si la IA falla o tarda más de 60 s, la usuaria podrá rellenar los campos a mano. El PDF se conserva igualmente.
- **R9** — Validaciones al confirmar: fin igual o posterior a inicio; importe entero en céntimos mayor que cero.
- **R10** — A la IA solo se envía el PDF, sin datos del inmueble ni de los inquilinos. El PDF se guarda en el bucket privado (ver `docs/rgpd.md`).
- **R11** — Toda factura confirmada se reparte entre los inquilinos según la spec 001. No hay gastos que solo se registren.

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
- [ ] Tests C1–C11
- [ ] Evaluación con PDF reales
