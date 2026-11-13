import { describe, expect, it } from 'vitest';
import {
  calcularAlquilerMes,
  cobroManual,
  cobrosAGenerarHoy,
  cobrosQueFaltan,
  ErrorValidacion,
  habitacionesDelMes,
  inquilinosConCobroDesactualizado,
  recalcularPideConfirmacion,
  validarFechaPago,
  validarMesGenerable,
  type EntradaCobros,
  type Ocupacion,
} from '../src/index.ts';

// Spec 005 · Generación de cobros (parte de dominio).
// Por habitaciones con prorrateo. A en H1 (500 €) y B en H2 (400 €) desde antes de octubre.
const A: Ocupacion = { habitacionId: 'H1', inquilinoId: 'A', entrada: '2026-01-01' };
const B: Ocupacion = { habitacionId: 'H2', inquilinoId: 'B', entrada: '2026-01-01' };
const base = (extra: Partial<EntradaCobros> = {}): EntradaCobros => ({
  modalidad: 'habitaciones',
  mesesParciales: 'prorrateo',
  habitaciones: [
    { id: 'H1', precioMensual: 50000 },
    { id: 'H2', precioMensual: 40000 },
    { id: 'H3', precioMensual: 30000 },
  ],
  ocupaciones: [A, B],
  diaCobro: 1,
  existentes: [],
  ...extra,
});
const resumen = (cs: ReturnType<typeof cobrosQueFaltan>) => cs.map((c) => [c.inquilinoId, c.importe, c.fechaCobro]);

describe('Spec 005 · Generación de cobros', () => {
  it('C1 · generación del día 1 (R2)', () => {
    expect(resumen(cobrosAGenerarHoy('2026-10-01', base()))).toEqual([
      ['A', 50000, '2026-10-01'],
      ['B', 40000, '2026-10-01'],
    ]);
  });

  it('C2 · día de cobro configurable (R1)', () => {
    expect(cobrosAGenerarHoy('2026-10-04', base({ diaCobro: 5 }))).toEqual([]);
    expect(resumen(cobrosAGenerarHoy('2026-10-05', base({ diaCobro: 5 })))).toEqual([
      ['A', 50000, '2026-10-05'],
      ['B', 40000, '2026-10-05'],
    ]);
  });

  it('C3 · sin duplicados (R4)', () => {
    const existentes = [
      { inquilinoId: 'A', mes: '2026-10' },
      { inquilinoId: 'B', mes: '2026-10' },
    ];
    expect(cobrosAGenerarHoy('2026-10-01', base({ existentes }))).toEqual([]);
  });

  it('C4 · recuperación tras un fallo (R8)', () => {
    expect(cobrosAGenerarHoy('2026-10-02', base()).length).toBe(2);
  });

  it('C5 · inquilino que ya se fue', () => {
    const r = cobrosAGenerarHoy('2026-10-01', base({ ocupaciones: [{ ...A, salida: '2026-09-30' }, B] }));
    expect(r.map((c) => c.inquilinoId)).toEqual(['B']);
  });

  it('C6 · generación manual de un mes pasado (R5)', () => {
    const r = cobrosQueFaltan('2026-09', base({ existentes: [{ inquilinoId: 'A', mes: '2026-09' }] }));
    expect(resumen(r)).toEqual([['B', 40000, '2026-09-01']]);
  });

  it('C7 · cobro desactualizado y recalculado (R6)', () => {
    const entrada = { mes: '2026-10', modalidad: 'habitaciones' as const, mesesParciales: 'prorrateo' as const, habitaciones: base().habitaciones };
    const antes = calcularAlquilerMes({ ...entrada, ocupaciones: [A, B] });
    const despues = calcularAlquilerMes({ ...entrada, ocupaciones: [A, { ...B, salida: '2026-10-15' }] });
    expect(inquilinosConCobroDesactualizado(antes, despues)).toEqual(['B']);
    expect(despues.lineas.find((l) => l.inquilinoId === 'B')!.importe).toBe(19355);
  });

  it('C8 · día de cobro inválido (R1)', () => {
    expect(() => cobrosAGenerarHoy('2026-10-01', base({ diaCobro: 30 }))).toThrow(ErrorValidacion);
  });

  it('C10 · inquilino nuevo a mitad de mes (R3)', () => {
    const C: Ocupacion = { habitacionId: 'H3', inquilinoId: 'C', entrada: '2026-10-11' };
    const existentes = [
      { inquilinoId: 'A', mes: '2026-10' },
      { inquilinoId: 'B', mes: '2026-10' },
    ];
    expect(resumen(cobrosAGenerarHoy('2026-10-11', base({ ocupaciones: [A, B, C], existentes })))).toEqual([
      ['C', 20323, '2026-10-01'],
    ]);
  });

  it('C11 · un cobro quitado no se vuelve a crear (R11)', () => {
    const existentes = [{ inquilinoId: 'A', mes: '2026-08' }];
    expect(cobrosQueFaltan('2026-08', base({ existentes })).map((c) => c.inquilinoId)).toEqual(['B']);
  });

  it('C13 · recalcular un cobro editado o pagado pide confirmación (R6, R10)', () => {
    expect(recalcularPideConfirmacion({ editado: true })).toBe(true);
    expect(recalcularPideConfirmacion({ pagadoEn: '2026-10-03' })).toBe(true);
    expect(recalcularPideConfirmacion({})).toBe(false);
  });

  it('C14 · sin cambios, nada nuevo (R2, R4)', () => {
    const existentes = [
      { inquilinoId: 'A', mes: '2026-10' },
      { inquilinoId: 'B', mes: '2026-10' },
    ];
    expect(cobrosAGenerarHoy('2026-10-12', base({ existentes }))).toEqual([]);
  });

  it('C15 · una habitación archivada vacía no suma recargo en un piso entero (R5b)', () => {
    const habitaciones = [
      { id: 'H1', archivada: false, historialPrecios: [{ desdeMes: '2026-01', precioMensual: 50000 }] },
      { id: 'H2', archivada: false, historialPrecios: [{ desdeMes: '2026-01', precioMensual: 40000 }] },
      { id: 'H3', archivada: true, historialPrecios: [{ desdeMes: '2026-01', precioMensual: 30000 }] },
    ];
    const ocupaciones = [A, B, { habitacionId: 'H3', inquilinoId: 'C', entrada: '2026-01-01', salida: '2026-07-31' }];
    const octubre = habitacionesDelMes('2026-10', habitaciones, ocupaciones);
    expect(octubre.map((h) => h.id)).toEqual(['H1', 'H2']);
    const calculo = calcularAlquilerMes({
      mes: '2026-10',
      modalidad: 'entero',
      mesesParciales: 'prorrateo',
      habitaciones: octubre,
      ocupaciones: [A, B],
    });
    expect(calculo.lineas.map((l) => [l.inquilinoId, l.importe])).toEqual([
      ['A', 50000],
      ['B', 40000],
    ]);
    // En julio, cuando C vivía en H3, la archivada sí entra.
    expect(habitacionesDelMes('2026-07', habitaciones, ocupaciones).map((h) => h.id)).toEqual(['H1', 'H2', 'H3']);
  });

  it('una habitación creada después no entra en meses anteriores; ocupada sin precio es un error (R5b)', () => {
    const habitaciones = [
      { id: 'H1', archivada: false, historialPrecios: [{ desdeMes: '2026-01', precioMensual: 50000 }] },
      { id: 'H4', archivada: false, historialPrecios: [{ desdeMes: '2026-11', precioMensual: 35000 }] },
    ];
    expect(habitacionesDelMes('2026-10', habitaciones, [A]).map((h) => h.id)).toEqual(['H1']);
    expect(habitacionesDelMes('2026-11', habitaciones, [A]).map((h) => [h.id, h.precioMensual])).toEqual([
      ['H1', 50000],
      ['H4', 35000],
    ]);
    const enH4 = { habitacionId: 'H4', inquilinoId: 'D', entrada: '2026-10-20' };
    expect(() => habitacionesDelMes('2026-10', habitaciones, [A, enH4])).toThrow(expect.objectContaining({ codigo: 'SIN_PRECIO' }));
  });

  it('C16 · cobro a mano sin estancia: la renta es obligatoria (R10b)', () => {
    expect(() => cobroManual(null, {})).toThrow(expect.objectContaining({ codigo: 'RENTA_OBLIGATORIA' }));
    expect(cobroManual(null, { renta: 30000 })).toEqual({ renta: 30000, recargoVacios: 0, importe: 30000, editado: true });
  });

  it('cobro a mano con estancia: propone lo calculado y queda editado si se cambia (R10b)', () => {
    const calculado = { renta: 50000, recargoVacios: 1000 };
    expect(cobroManual(calculado, {})).toEqual({ renta: 50000, recargoVacios: 1000, importe: 51000, editado: false });
    expect(cobroManual(calculado, { renta: 45000 })).toMatchObject({ importe: 46000, editado: true });
    expect(() => cobroManual(calculado, { renta: -1 })).toThrow(expect.objectContaining({ codigo: 'IMPORTE_INVALIDO' }));
  });

  it('C17 · la fecha de pago no puede ser posterior a hoy (R7)', () => {
    expect(() => validarFechaPago('2026-10-04', '2026-10-03')).toThrow(expect.objectContaining({ codigo: 'PAGO_FUTURO' }));
    expect(validarFechaPago('2026-10-03', '2026-10-03')).toBe('2026-10-03');
  });

  it('C18 · no se generan meses futuros (R5)', () => {
    expect(() => validarMesGenerable('2026-11', '2026-10')).toThrow(expect.objectContaining({ codigo: 'MES_FUTURO' }));
    expect(validarMesGenerable('2026-09', '2026-10')).toBe('2026-09');
  });
});
