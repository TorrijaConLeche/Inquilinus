# 001 · Reparto de suministros

Estado: implementada · Paquetes: `packages/domain` (cálculo), `apps/api` y `apps/web` (reparto guardado)

## Objetivo

Dada una factura de suministro confirmada y las ocupaciones del inmueble, calcular cuánto paga cada inquilino y qué parte queda sin ocupar. Es una función pura, sin base de datos ni IA.

**Entrada:** periodo de la factura (inicio y fin, ambos inclusive), importe total en céntimos y ocupaciones (habitación, inquilino, entrada y salida opcional).
**Salida:** importe por inquilino, importe sin ocupar y detalle de días por inquilino.

## Reglas

- **R1** — El sistema deberá calcular el importe diario como total ÷ días del periodo (ambos extremos incluidos).
- **R2** — Para cada día, el sistema deberá repartir el importe diario a partes iguales entre los inquilinos presentes ese día.
- **R3** — Un inquilino está presente desde su fecha de entrada hasta su fecha de salida, ambas inclusive. Sin fecha de salida, sigue presente.
- **R4** — Si en la misma habitación un inquilino sale y otro entra el mismo día, ese día solo estará presente quien entra.
- **R5** — Si un día no hay ningún inquilino presente, el importe de ese día se asignará a "sin ocupar".
- **R6** — La suma de todos los importes (inquilinos + sin ocupar) deberá ser exactamente el total de la factura. El redondeo se resuelve por el método del mayor resto; los empates se deshacen por fecha de entrada y después por id del inquilino.
- **R7** — Las ocupaciones que no se solapan con el periodo se ignoran.
- **R8** — Si dos ocupaciones de la misma habitación se solapan más allá del día frontera de R4, el sistema deberá rechazar el cálculo con un error de validación.
- **R9** — Si la fecha de fin es anterior a la de inicio o el importe es negativo, el sistema deberá rechazar el cálculo.

**Reparto guardado** (tarea 5.4 del plan)

- **R10** — Al confirmar una factura (spec 003) se reparte en ese momento con las estancias del inmueble y queda guardada como **foto fija**, con su detalle por tramos; la factura pasa a `repartida`. Lo "sin ocupar" lo asume la propietaria.
- **R11** — Cada parte (una por inquilino) está pendiente o pagada, con fecha no posterior a hoy; se marca y se desmarca (spec 009, R9 y R10).
- **R12** — Una parte pertenece al mes, en hora de Madrid, en que se repartió la factura por primera vez (spec 009, R8). Recalcular no cambia su mes. Las liquidaciones (spec 011) llegan con la tarea 5.5.
- **R13** — Si cambian las estancias del inmueble y el reparto calculado de una factura sale distinto, su reparto queda **desactualizado**. Recalcular es una acción explícita de la usuaria: pone las partes del cálculo actual y cada inquilino conserva su estado de pago; si alguna parte está pagada, se pide confirmación.
- **R14** — Una factura repartida se puede **deshacer**: vuelve a "por revisar" con sus datos y se borra su reparto. Si alguna parte está pagada, se avisa de que esos pagos se pierden y se pide confirmación.
- **R15** — Las partes de un inquilino anonimizado se conservan con los mismos importes (spec 007, R12).

## Casos de prueba

Periodo del 1 al 30 de septiembre (30 días) salvo que se indique otra cosa.

| # | Caso | Datos | Resultado esperado |
| --- | --- | --- | --- |
| C1 | Entrada a mitad | 90 €. A y B todo el mes; C entra el 21 | A 40 €, B 40 €, C 10 € |
| C2 | Relevo en la misma habitación (R4) | 60 €. Hab. 1: A sale el 15, B entra el 15. Hab. 2: C todo el mes | A 14 €, B 16 €, C 30 € |
| C3 | Salida sin relevo | 60 €. A sale el 15; C todo el mes | A 15 €, C 45 € |
| C4 | Días sin nadie (R5) | 60 €. Solo C, que entra el 11 | C 40 €, sin ocupar 20 € |
| C5 | Redondeo (R6) | 100 €. A, B y C todo el mes, con entradas en ese orden | A 33,34 €, B 33,33 €, C 33,33 € |
| C6 | Entrada y salida el mismo día en habitaciones distintas | 60 €. Hab. 1: A sale el 15. Hab. 2: B entra el 15 | A 29 €, B 31 € (el día 15 cuenta para ambos) |
| C7 | Ocupación fuera del periodo (R7) | 60 €. A salió en agosto; B todo el mes | B 60 € |
| C8 | Solape inválido (R8) | Hab. 1: A del 1 al 20, B desde el 10 | Error de validación |
| C9 | Periodo que cruza meses | Del 15 de agosto al 14 de octubre (61 días), 61 €. A todo el periodo | A 61 € |
| C10 | Confirmar reparte (R10) | Luz de septiembre, 90 €. A y B todo el mes; C entra el 21 | Factura `repartida`; partes A 40 €, B 40 €, C 10 €, pendientes |
| C11 | Pagar una parte (R11) | Se marca la parte de C el 2026-10-05 y se desmarca | Pagada el 2026-10-05; después, pendiente |
| C12 | Reparto desactualizado (R13) | Tras C10, la entrada de C se corrige al 2026-09-11 | Desactualizado; al recalcular, A 35 €, B 35 €, C 20 € |
| C13 | Recalcular con pagos (R13) | Como C12, con la parte de A pagada | Sin confirmar, error; confirmando, A sigue pagada con 35 € |
| C14 | Deshacer (R14) | Factura de C10 con la parte de A pagada | Sin confirmar, error; confirmando, vuelve a "por revisar" sin reparto |
| C15 | Mes de la parte (R12) | Factura de septiembre repartida el 2026-10-03 | Sus partes son de octubre |

## Fuera de alcance

- Lectura de la factura con IA (spec propia).
- Reparto del alquiler (spec 002).
- Repartos por consumo o con pesos distintos por habitación.
- Abonos o facturas con importe negativo.

## Tareas

- [x] Tipos de entrada y salida en `packages/domain`
- [x] Validaciones R8 y R9
- [x] Cálculo por días (R1–R5, R7)
- [x] Redondeo por mayor resto (R6)
- [x] Tests C1–C9 en Vitest
- [x] Reparto guardado al confirmar, pagos de cada parte, desactualizado, recalcular y deshacer (tarea 5.4)
- [x] Tests C10–C15
