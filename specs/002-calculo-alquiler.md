# 002 · Cálculo del alquiler mensual

Estado: implementada · Paquete: `packages/domain`

## Objetivo

Dado un mes natural, el inmueble (modalidad y forma de cobro de meses parciales), sus habitaciones con precio y las ocupaciones, calcular cuánto alquiler paga cada inquilino ese mes. Función pura, sin base de datos.

**Entrada:** mes (`YYYY-MM`), modalidad (`entero` | `habitaciones`), meses parciales (`prorrateo` | `mes_completo`), habitaciones (id, precio mensual en céntimos) y ocupaciones (habitación, inquilino, entrada, salida opcional).
**Salida:** por inquilino: renta de su habitación, recargo por habitaciones vacías e importe total; y el importe que asume la propietaria por vacíos.

## Reglas

- **R1** — La presencia por días sigue las reglas R3 y R4 de la spec 001 (entrada y salida inclusive; en un relevo en la misma habitación, el día frontera es de quien entra).
- **R2** — Con `prorrateo`, el inquilino pagará precio × días presentes en el mes ÷ días del mes.
- **R3** — Con `mes_completo`, el inquilino pagará el precio completo en cualquier mes en el que esté presente al menos un día.
- **R3b** — Excepción: si en un mes hay más de un inquilino en la misma habitación (un relevo), ese mes y en esa habitación se aplicará `prorrateo` (R2) a todos ellos, aunque el inmueble use `mes_completo`.
- **R4** — Un día vacío de una habitación es un día del mes en que no está presente ningún inquilino en ella. Su coste es precio ÷ días del mes.
- **R5** — En modo `entero`, el coste de cada día vacío se repartirá a partes iguales entre los inquilinos presentes en el inmueble ese día. Si no hay ninguno, lo asume la propietaria.
- **R6** — En modo `habitaciones`, el coste de los días vacíos lo asume la propietaria.
- **R7** — Los días vacíos se calculan siempre por días, sea cual sea la opción de meses parciales. Excepción: en `mes_completo`, una habitación cuyo único inquilino del mes paga el mes completo no tiene días vacíos ese mes (si no, se cobraría dos veces la misma habitación; ver C2).
- **R8** — Los importes se redondean a céntimos por el método del mayor resto, con los mismos criterios de desempate que la spec 001.
- **R9** — Un inmueble con una sola habitación representa la vivienda completa. No hay ninguna regla especial para este caso.
- **R10** — La renta total del inmueble no es una entrada: se calcula como la suma de los precios de sus habitaciones y es solo informativa.

## Casos de prueba

Septiembre (30 días). Habitaciones: H1 500 €, H2 400 €, H3 300 €.

| # | Caso | Datos | Resultado esperado |
| --- | --- | --- | --- |
| C1 | Prorrateo, entrada a mitad | Habitaciones, prorrateo. A en H1 desde el 11 | A 333,33 €; propietaria 166,67 € (H1) + 700 € (H2 y H3) |
| C2 | Mes completo, entrada a mitad | Habitaciones, mes completo. A en H1 desde el 11 | A 500 €; propietaria 700 € (H2 y H3) |
| C3 | Entero, habitación vacía todo el mes | Entero. A en H1 y B en H2 todo el mes; H3 vacía | A 650 €, B 550 € |
| C4 | Entero, vacía 10 días | Entero. A en H1 y B en H2 todo el mes; C en H3 desde el 11 (prorrateo) | A 550 €, B 450 €, C 200 € |
| C5 | Por habitaciones con vacío | Habitaciones. A en H1 y B en H2 todo el mes; H3 vacía | A 500 €, B 400 €; propietaria 300 € |
| C6 | Entero sin nadie algunos días | Entero, prorrateo. Solo A en H1 desde el 16 | A 600 € (H1 250 € + recargo H2 200 € + recargo H3 150 €, días 16-30); propietaria 600 € (días 1-15 de las tres) |
| C7 | Vivienda completa | Una única habitación de 900 €. A todo el mes | A 900 € |
| C8 | Mes completo con relevo (R3b) | Habitaciones, mes completo. H1: A sale el 15, B entra el 15 | A 233,33 €, B 266,67 €; propietaria 700 € (H2 y H3) |
| C9 | Renta total (R10) | Entero, con H1, H2 y H3 | Renta total informativa: 1.200 € |

## Fuera de alcance

- Registro de cobros y su estado (spec propia).
- Actualizaciones de renta (IPC) y cambios de precio a mitad de mes.
- Que la propietaria elija cómo se cobra el mes de un relevo con `mes_completo` (posible ampliación futura).

## Tareas

- [x] Reutilizar el cálculo de presencia de la spec 001
- [x] Renta por habitación (R2, R3, R3b)
- [x] Días vacíos y su reparto (R4–R7)
- [x] Redondeo (R8)
- [x] Tests C1–C9 en Vitest
