import { describe, expect, it } from 'vitest';
import { calcularAlquilerMes, type EntradaAlquilerMes, type Ocupacion } from '../src/index.ts';

// Casos de la spec 002. Septiembre (30 días). H1 500 €, H2 400 €, H3 300 €.
const HABITACIONES = [
  { id: 'H1', precioMensual: 50000 },
  { id: 'H2', precioMensual: 40000 },
  { id: 'H3', precioMensual: 30000 },
];

const occ = (habitacionId: string, inquilinoId: string, entrada: string, salida?: string): Ocupacion =>
  salida ? { habitacionId, inquilinoId, entrada, salida } : { habitacionId, inquilinoId, entrada };

const calcular = (e: Partial<EntradaAlquilerMes> & Pick<EntradaAlquilerMes, 'ocupaciones'>) =>
  calcularAlquilerMes({
    mes: '2026-09',
    modalidad: 'habitaciones',
    mesesParciales: 'prorrateo',
    habitaciones: HABITACIONES,
    ...e,
  });

const importes = (r: ReturnType<typeof calcularAlquilerMes>) =>
  Object.fromEntries(r.lineas.map((l) => [l.inquilinoId, l.importe]));

describe('Spec 002 · Cálculo del alquiler mensual', () => {
  it('C1 · prorrateo, entrada a mitad', () => {
    const r = calcular({ ocupaciones: [occ('H1', 'A', '2026-09-11')] });
    expect(importes(r)).toEqual({ A: 33333 });
    expect(r.propietario).toBe(86667);
  });

  it('C2 · mes completo, entrada a mitad', () => {
    const r = calcular({ mesesParciales: 'mes_completo', ocupaciones: [occ('H1', 'A', '2026-09-11')] });
    expect(importes(r)).toEqual({ A: 50000 });
    expect(r.propietario).toBe(70000);
  });

  it('C3 · entero, habitación vacía todo el mes', () => {
    const r = calcular({
      modalidad: 'entero',
      ocupaciones: [occ('H1', 'A', '2026-01-01'), occ('H2', 'B', '2026-01-01')],
    });
    expect(importes(r)).toEqual({ A: 65000, B: 55000 });
    expect(r.lineas[0]).toEqual({ inquilinoId: 'A', renta: 50000, recargoVacios: 15000, importe: 65000 });
    expect(r.propietario).toBe(0);
  });

  it('C4 · entero, habitación vacía 10 días', () => {
    const r = calcular({
      modalidad: 'entero',
      ocupaciones: [occ('H1', 'A', '2026-01-01'), occ('H2', 'B', '2026-01-01'), occ('H3', 'C', '2026-09-11')],
    });
    expect(importes(r)).toEqual({ A: 55000, B: 45000, C: 20000 });
  });

  it('C5 · por habitaciones con vacío', () => {
    const r = calcular({ ocupaciones: [occ('H1', 'A', '2026-01-01'), occ('H2', 'B', '2026-01-01')] });
    expect(importes(r)).toEqual({ A: 50000, B: 40000 });
    expect(r.propietario).toBe(30000);
  });

  it('C6 · entero sin nadie algunos días', () => {
    const r = calcular({ modalidad: 'entero', ocupaciones: [occ('H1', 'A', '2026-09-16')] });
    expect(r.lineas).toEqual([{ inquilinoId: 'A', renta: 25000, recargoVacios: 35000, importe: 60000 }]);
    expect(r.propietario).toBe(60000);
  });

  it('C7 · vivienda completa', () => {
    const r = calcular({
      habitaciones: [{ id: 'PISO', precioMensual: 90000 }],
      ocupaciones: [occ('PISO', 'A', '2026-01-01')],
    });
    expect(importes(r)).toEqual({ A: 90000 });
  });

  it('C8 · mes completo con relevo (R3b)', () => {
    const r = calcular({
      mesesParciales: 'mes_completo',
      ocupaciones: [occ('H1', 'A', '2026-01-01', '2026-09-15'), occ('H1', 'B', '2026-09-15')],
    });
    expect(importes(r)).toEqual({ A: 23333, B: 26667 });
    expect(r.propietario).toBe(70000);
  });

  it('C9 · renta total informativa (R10)', () => {
    const r = calcular({ modalidad: 'entero', ocupaciones: [] });
    expect(r.rentaTotal).toBe(120000);
  });

  it('R8 · la suma siempre coincide con la renta total', () => {
    const r = calcular({
      mes: '2026-02',
      modalidad: 'entero',
      ocupaciones: [occ('H1', 'A', '2026-02-03', '2026-02-17'), occ('H1', 'D', '2026-02-17'), occ('H2', 'B', '2026-02-09')],
    });
    const suma = r.lineas.reduce((s, l) => s + l.importe, 0) + r.propietario;
    expect(suma).toBe(r.rentaTotal);
  });
});
