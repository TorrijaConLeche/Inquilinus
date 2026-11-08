import { describe, expect, it } from 'vitest';
import { caducidadEnlace, enlaceDisponible, repartirSuministro, totalPendiente, type Concepto } from '../src/index.ts';

// Spec 004 · Enlace y vista del inquilino (parte de dominio).
describe('Spec 004 · Enlace del inquilino', () => {
  it('C1 · enlace válido durante la estancia', () => {
    expect(enlaceDisponible('2026-11-08', { salida: null, revocadoEn: null })).toBe(true);
  });

  it('C2 · enlace revocado (R4)', () => {
    expect(enlaceDisponible('2026-11-08', { salida: null, revocadoEn: '2026-11-01T10:00:00Z' })).toBe(false);
  });

  it('C3 · caducidad 3 meses tras la salida (R3)', () => {
    expect(caducidadEnlace('2026-09-30')).toBe('2026-12-30');
    expect(enlaceDisponible('2026-12-30', { salida: '2026-09-30' })).toBe(true);
    expect(enlaceDisponible('2026-12-31', { salida: '2026-09-30' })).toBe(false);
    expect(caducidadEnlace('2026-11-30')).toBe('2027-02-28');
  });

  it('C5 · total pendiente (R5)', () => {
    const base = { inmuebleId: 'P', inquilinoId: 'A' };
    const conceptos: Concepto[] = [
      { ...base, id: '1', tipo: 'alquiler', mes: '2026-09', importe: 50000 },
      { ...base, id: '2', tipo: 'gasto', mes: '2026-09', importe: 4000 },
      { ...base, id: '3', tipo: 'gasto', mes: '2026-09', importe: 1000, pagadoEn: '2026-09-20' },
    ];
    expect(totalPendiente(conceptos)).toBe(54000);
  });

  it('C6 · detalle del cálculo por tramos (R7)', () => {
    const r = repartirSuministro({
      inicio: '2026-09-01',
      fin: '2026-09-30',
      importe: 9000,
      ocupaciones: [
        { habitacionId: 'H1', inquilinoId: 'A', entrada: '2026-01-01' },
        { habitacionId: 'H2', inquilinoId: 'B', entrada: '2026-01-01' },
        { habitacionId: 'H3', inquilinoId: 'C', entrada: '2026-09-21' },
      ],
    });
    expect(r.tramos).toEqual([
      {
        desde: '2026-09-01',
        hasta: '2026-09-20',
        dias: 20,
        presentes: ['A', 'B'],
        partes: [
          { inquilinoId: 'A', importe: 3000 },
          { inquilinoId: 'B', importe: 3000 },
        ],
      },
      {
        desde: '2026-09-21',
        hasta: '2026-09-30',
        dias: 10,
        presentes: ['A', 'B', 'C'],
        partes: [
          { inquilinoId: 'A', importe: 1000 },
          { inquilinoId: 'B', importe: 1000 },
          { inquilinoId: 'C', importe: 1000 },
        ],
      },
    ]);
  });

  it('R7 · el detalle de cada inquilino suma exactamente su parte', () => {
    const r = repartirSuministro({
      inicio: '2026-01-07',
      fin: '2026-03-09',
      importe: 12345,
      ocupaciones: [
        { habitacionId: 'H1', inquilinoId: 'A', entrada: '2025-12-01', salida: '2026-02-03' },
        { habitacionId: 'H1', inquilinoId: 'D', entrada: '2026-02-03' },
        { habitacionId: 'H2', inquilinoId: 'B', entrada: '2026-01-20' },
        { habitacionId: 'H3', inquilinoId: 'C', entrada: '2026-01-01', salida: '2026-02-28' },
      ],
    });
    for (const linea of r.lineas) {
      const suma = r.tramos.flatMap((t) => t.partes).filter((p) => p.inquilinoId === linea.inquilinoId);
      expect(suma.reduce((s, p) => s + p.importe, 0)).toBe(linea.importe);
    }
  });
});
