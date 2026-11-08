# 004 · Enlace y vista del inquilino

Estado: borrador · Paquetes: `packages/domain` (caducidad, pendiente, detalle del cálculo), `apps/api`, `apps/web`

## Objetivo

La propietaria comparte con cada inquilino un enlace sin cuenta donde ve todo lo de su estancia: lo que le falta por pagar, sus cobros de alquiler, los gastos repartidos con el detalle del cálculo, su fianza y las facturas en PDF. Es de solo lectura.

## Reglas

- **R1** — Habrá un enlace por estancia (inquilino). El token será aleatorio de al menos 128 bits y solo se guardará su hash.
- **R2** — La propietaria podrá copiar el enlace, enviarlo por WhatsApp, revocarlo y regenerarlo. Regenerar invalida el anterior.
- **R3** — El enlace funciona durante la estancia y hasta 3 meses después de la fecha de salida (inclusive). Si cambia la fecha de salida, la caducidad se recalcula.
- **R4** — Con un token revocado, caducado o inexistente, la página mostrará el mismo mensaje ("Este enlace ya no está disponible"), sin revelar cuál es el motivo ni ningún dato.
- **R5** — Arriba se mostrará el **total pendiente**: suma de cobros de alquiler y partes de gastos sin pagar.
- **R6** — Debajo, un timeline (lo más reciente primero) con:
  - cobros de alquiler: mes, renta, recargo por vacíos, importe y pagado (con fecha) o pendiente;
  - gastos repartidos: tipo, periodo, total de la factura, su parte, días y pagado (con fecha) o pendiente;
  - fianza: importe, fecha de recepción y, si procede, fecha e importe devuelto.
- **R7** — Cada gasto mostrará el detalle del cálculo por tramos de días con quién estaba presente. Por ejemplo: "Del 1 al 20: 2 personas → 30,00 €. Del 21 al 30: 3 personas → 10,00 €". Ver P1 sobre qué se muestra de los demás.
- **R8** — El PDF de cada factura se podrá descargar siempre, con una URL firmada que caduca a los 5 minutos.
- **R9** — La vista solo muestra datos de esa estancia. Nunca muestra documentos, DNI ni datos de contacto, ni los suyos ni los de otros.
- **R10** — Se muestran los cobros y repartos guardados (foto fija). Si la propietaria recalcula, la vista se actualiza.
- **R11** — Las páginas llevarán `noindex`, `Cache-Control: private, no-store` y `Referrer-Policy: no-referrer`.

## Casos de prueba

| # | Caso | Datos | Resultado esperado |
| --- | --- | --- | --- |
| C1 | Enlace válido | Token de A, estancia activa | Vista con los datos de A |
| C2 | Revocado (R4) | Token de A revocado | "Este enlace ya no está disponible" |
| C3 | Caducidad (R3) | A sale el 2026-09-30 | Válido el 2026-12-30; caducado el 2026-12-31 |
| C4 | Regenerar (R2) | Se regenera el enlace de A | El token antiguo da el mensaje de C2; el nuevo funciona |
| C5 | Total pendiente (R5) | Alquiler sept 500 € pendiente; luz 40 € pendiente; agua 10 € pagada | Pendiente 540 € |
| C6 | Detalle del cálculo (R7) | Caso C1 de la spec 001, vista de A | Tramos 1–20 (2 personas, 30 €) y 21–30 (3 personas, 10 €); total 40 € |
| C7 | Descarga (R8) | A descarga la factura de luz | URL firmada válida 5 minutos |
| C8 | Aislamiento (R9) | Con el token de A se pide una factura de otro inmueble | 404 |
| C9 | Token mal formado (R4) | `/i/abc` | Mismo mensaje que C2 |
| C10 | Cabeceras (R11) | Cualquier respuesta de la vista | Llevan las tres cabeceras |

## Fuera de alcance

- Que el inquilino marque pagos o suba justificantes.
- Ver sus documentos (contrato, DNI, nóminas).
- Notificaciones o avisos de nuevos cargos.

## Preguntas abiertas

- **P1** — ¿Qué ve el inquilino de los demás? Propuesta: el nombre de pila en el detalle del cálculo ("Del 21 al 30: tú, Alex y Jorge"), pero **no** lo que han pagado o deben los demás.

## Tareas

- [ ] Caducidad (R3), total pendiente (R5) y tramos del detalle (R7) en `packages/domain`
- [ ] Guardar el detalle por tramos junto al reparto (foto fija)
- [ ] Generar, revocar y regenerar enlaces en `apps/api`
- [ ] Vista pública en `apps/web`
- [ ] Tests C1–C10
