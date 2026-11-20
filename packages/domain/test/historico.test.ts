import { describe, expect, it } from 'vitest';
import { agruparPorMes, filtrarHistorico, grupoDe, hayFiltros, resumenHistorico, type ActividadFiltrable } from '../src/index.ts';

// Spec 012. Piso Centro con Alex y Jorge. En octubre: cobros de los dos; luz
// de septiembre repartida (Alex 20 €, Jorge 20 €); Alex paga su alquiler y su
// luz; se edita la renta de Jorge de 400 € a 380 €. Lo más reciente primero.
type Act = ActividadFiltrable & { id: string };
const cobroAlex = { clave: 'cobro:a', inquilinoId: 'alex', importe: 50_000, pagado: true };
const cobroJorge = { clave: 'cobro:j', inquilinoId: 'jorge', importe: 38_000, pagado: false };
const luzAlex = { clave: 'parte:a', inquilinoId: 'alex', importe: 2_000, pagado: true };
const luzJorge = { clave: 'parte:j', inquilinoId: 'jorge', importe: 2_000, pagado: false };
const ACTIVIDADES: Act[] = [
  { id: 'editada-jorge', fecha: '2026-10-20', grupo: 'alquiler', inquilinoId: 'jorge', gasto: 'alquiler', conceptos: [cobroJorge] },
  { id: 'pago-luz-alex', fecha: '2026-10-15', grupo: 'pagos', inquilinoId: 'alex', gasto: 'luz', conceptos: [luzAlex] },
  { id: 'pago-alex', fecha: '2026-10-05', grupo: 'pagos', inquilinoId: 'alex', gasto: 'alquiler', conceptos: [cobroAlex] },
  { id: 'luz-repartida', fecha: '2026-10-03', grupo: 'gastos', inquilinoId: null, gasto: 'luz', conceptos: [luzAlex, luzJorge] },
  { id: 'cobro-jorge', fecha: '2026-10-01', grupo: 'alquiler', inquilinoId: 'jorge', gasto: 'alquiler', conceptos: [cobroJorge] },
  { id: 'cobro-alex', fecha: '2026-10-01', grupo: 'alquiler', inquilinoId: 'alex', gasto: 'alquiler', conceptos: [cobroAlex] },
  { id: 'precio', fecha: '2026-09-28', grupo: 'inmueble', inquilinoId: null, gasto: null, conceptos: [] },
];
const ids = (xs: Act[]) => xs.map((a) => a.id);

describe('Spec 012 · filtros y resumen del histórico', () => {
  it('C1 · sin filtros, todo en el orden en que llega, agrupado por mes', () => {
    expect(hayFiltros({})).toBe(false);
    expect(filtrarHistorico(ACTIVIDADES, {})).toHaveLength(7);
    expect(agruparPorMes(ACTIVIDADES).map((g) => [g.mes, g.actividades.length])).toEqual([
      ['2026-10', 6],
      ['2026-09', 1],
    ]);
  });

  it('C2 · por inquilino: lo suyo y lo que le afecta (el reparto de la luz)', () => {
    expect(ids(filtrarHistorico(ACTIVIDADES, { inquilinos: ['alex'] }))).toEqual(['pago-luz-alex', 'pago-alex', 'luz-repartida', 'cobro-alex']);
  });

  it('C3 · por tipo de gasto: con Luz, la factura y sus pagos; con Alquiler, los cobros', () => {
    expect(ids(filtrarHistorico(ACTIVIDADES, { gastos: ['luz'] }))).toEqual(['pago-luz-alex', 'luz-repartida']);
    expect(ids(filtrarHistorico(ACTIVIDADES, { gastos: ['alquiler'] }))).toEqual(['editada-jorge', 'pago-alex', 'cobro-jorge', 'cobro-alex']);
  });

  it('C4 · Alex + Luz: pagado 20 €, pendiente 0 €', () => {
    const f = { inquilinos: ['alex'], gastos: ['luz'] };
    const filtradas = filtrarHistorico(ACTIVIDADES, f);
    expect(hayFiltros(f)).toBe(true);
    expect(resumenHistorico(filtradas, f)).toEqual({ pagado: 2_000, pendiente: 0 });
    // Sin elegir inquilino, la luz de los dos: cada parte cuenta una vez.
    expect(resumenHistorico(filtrarHistorico(ACTIVIDADES, { gastos: ['luz'] }), { gastos: ['luz'] })).toEqual({ pagado: 2_000, pendiente: 2_000 });
  });

  it('estado de pago (R7b): pendiente, lo que tiene algo sin pagar hoy; pagado, lo que está todo pagado', () => {
    expect(ids(filtrarHistorico(ACTIVIDADES, { estado: 'pendiente' }))).toEqual(['editada-jorge', 'luz-repartida', 'cobro-jorge']);
    expect(ids(filtrarHistorico(ACTIVIDADES, { estado: 'pagado', inquilinos: ['alex'] }))).toEqual([
      'pago-luz-alex',
      'pago-alex',
      'luz-repartida',
      'cobro-alex',
    ]);
  });

  it('por grupo y por fechas', () => {
    expect(ids(filtrarHistorico(ACTIVIDADES, { grupos: ['pagos', 'inmueble'] }))).toEqual(['pago-luz-alex', 'pago-alex', 'precio']);
    expect(ids(filtrarHistorico(ACTIVIDADES, { desde: '2026-10-03', hasta: '2026-10-15' }))).toEqual(['pago-luz-alex', 'pago-alex', 'luz-repartida']);
  });

  it('cada tipo de actividad tiene su grupo (R2)', () => {
    expect(grupoDe('cobro_editado')).toBe('alquiler');
    expect(grupoDe('todo_pagado')).toBe('pagos');
    expect(grupoDe('fianza_devuelta')).toBe('fianza');
  });
});
