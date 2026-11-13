import { describe, expect, it } from 'vitest';
import { ErrorValidacion, repartirSuministro, repartosDistintos, type Ocupacion } from '../src/index.ts';

// Casos de la spec 001. Periodo del 1 al 30 de septiembre salvo que se indique otra cosa.
const SEPT = { inicio: '2026-09-01', fin: '2026-09-30' };

const occ = (habitacionId: string, inquilinoId: string, entrada: string, salida?: string): Ocupacion =>
  salida ? { habitacionId, inquilinoId, entrada, salida } : { habitacionId, inquilinoId, entrada };

const importes = (r: ReturnType<typeof repartirSuministro>) =>
  Object.fromEntries(r.lineas.map((l) => [l.inquilinoId, l.importe]));

describe('Spec 001 · Reparto de suministros', () => {
  it('C1 · entrada a mitad', () => {
    const r = repartirSuministro({
      ...SEPT,
      importe: 9000,
      ocupaciones: [occ('H1', 'A', '2026-01-01'), occ('H2', 'B', '2026-01-01'), occ('H3', 'C', '2026-09-21')],
    });
    expect(importes(r)).toEqual({ A: 4000, B: 4000, C: 1000 });
    expect(r.sinOcupar).toEqual({ dias: 0, importe: 0 });
  });

  it('C2 · relevo en la misma habitación (R4)', () => {
    const r = repartirSuministro({
      ...SEPT,
      importe: 6000,
      ocupaciones: [
        occ('H1', 'A', '2026-01-01', '2026-09-15'),
        occ('H1', 'B', '2026-09-15'),
        occ('H2', 'C', '2026-01-01'),
      ],
    });
    expect(importes(r)).toEqual({ A: 1400, B: 1600, C: 3000 });
    expect(r.lineas.find((l) => l.inquilinoId === 'A')?.dias).toBe(14);
  });

  it('C3 · salida sin relevo', () => {
    const r = repartirSuministro({
      ...SEPT,
      importe: 6000,
      ocupaciones: [occ('H1', 'A', '2026-01-01', '2026-09-15'), occ('H2', 'C', '2026-01-01')],
    });
    expect(importes(r)).toEqual({ A: 1500, C: 4500 });
  });

  it('C4 · días sin nadie (R5)', () => {
    const r = repartirSuministro({ ...SEPT, importe: 6000, ocupaciones: [occ('H1', 'C', '2026-09-11')] });
    expect(importes(r)).toEqual({ C: 4000 });
    expect(r.sinOcupar).toEqual({ dias: 10, importe: 2000 });
  });

  it('C5 · redondeo por mayor resto (R6)', () => {
    const r = repartirSuministro({
      ...SEPT,
      importe: 10000,
      ocupaciones: [occ('H1', 'A', '2026-01-01'), occ('H2', 'B', '2026-01-02'), occ('H3', 'C', '2026-01-03')],
    });
    expect(importes(r)).toEqual({ A: 3334, B: 3333, C: 3333 });
  });

  it('C6 · entrada y salida el mismo día en habitaciones distintas', () => {
    const r = repartirSuministro({
      ...SEPT,
      importe: 6000,
      ocupaciones: [occ('H1', 'A', '2026-01-01', '2026-09-15'), occ('H2', 'B', '2026-09-15')],
    });
    expect(importes(r)).toEqual({ A: 2900, B: 3100 });
  });

  it('C7 · ocupación fuera del periodo (R7)', () => {
    const r = repartirSuministro({
      ...SEPT,
      importe: 6000,
      ocupaciones: [occ('H1', 'A', '2026-01-01', '2026-08-20'), occ('H2', 'B', '2026-01-01')],
    });
    expect(importes(r)).toEqual({ B: 6000 });
  });

  it('C8 · solape inválido (R8)', () => {
    expect(() =>
      repartirSuministro({
        ...SEPT,
        importe: 6000,
        ocupaciones: [occ('H1', 'A', '2026-09-01', '2026-09-20'), occ('H1', 'B', '2026-09-10')],
      }),
    ).toThrow(ErrorValidacion);
  });

  it('C9 · periodo que cruza meses', () => {
    const r = repartirSuministro({
      inicio: '2026-08-15',
      fin: '2026-10-14',
      importe: 6100,
      ocupaciones: [occ('H1', 'A', '2026-01-01')],
    });
    expect(r.lineas).toEqual([{ inquilinoId: 'A', dias: 61, importe: 6100 }]);
  });

  it('R9 · rechaza periodo invertido e importe negativo', () => {
    expect(() => repartirSuministro({ inicio: '2026-09-30', fin: '2026-09-01', importe: 100, ocupaciones: [] })).toThrow(
      ErrorValidacion,
    );
    expect(() => repartirSuministro({ ...SEPT, importe: -1, ocupaciones: [] })).toThrow(ErrorValidacion);
  });

  it('R6 · la suma siempre coincide con el total', () => {
    const r = repartirSuministro({
      inicio: '2026-01-07',
      fin: '2026-03-09',
      importe: 12345,
      ocupaciones: [
        occ('H1', 'A', '2025-12-01', '2026-02-03'),
        occ('H1', 'D', '2026-02-03'),
        occ('H2', 'B', '2026-01-20'),
        occ('H3', 'C', '2026-01-01', '2026-02-28'),
      ],
    });
    const suma = r.lineas.reduce((s, l) => s + l.importe, 0) + r.sinOcupar.importe;
    expect(suma).toBe(12345);
  });

  it('C12 · una entrada corregida cambia el reparto; el mismo cálculo no (R13)', () => {
    const base = { inicio: '2026-09-01', fin: '2026-09-30', importe: 9000 };
    const A = { habitacionId: 'H1', inquilinoId: 'A', entrada: '2026-01-01' };
    const B = { habitacionId: 'H2', inquilinoId: 'B', entrada: '2026-01-01' };
    const antes = repartirSuministro({ ...base, ocupaciones: [A, B, { habitacionId: 'H3', inquilinoId: 'C', entrada: '2026-09-21' }] });
    const despues = repartirSuministro({ ...base, ocupaciones: [A, B, { habitacionId: 'H3', inquilinoId: 'C', entrada: '2026-09-11' }] });
    expect(repartosDistintos(antes, despues)).toBe(true);
    expect(despues.lineas.map((l) => [l.inquilinoId, l.importe])).toEqual([
      ['A', 3500],
      ['B', 3500],
      ['C', 2000],
    ]);
    expect(repartosDistintos(antes, repartirSuministro({ ...base, ocupaciones: [B, A, { habitacionId: 'H3', inquilinoId: 'C', entrada: '2026-09-21' }] }))).toBe(false);
  });
});
