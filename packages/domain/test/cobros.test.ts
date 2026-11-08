import { describe, expect, it } from 'vitest';
import {
  calcularAlquilerMes,
  cobrosAGenerarHoy,
  cobrosQueFaltan,
  ErrorValidacion,
  inquilinosConCobroDesactualizado,
  recalcularPideConfirmacion,
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
});
