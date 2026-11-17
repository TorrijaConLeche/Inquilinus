import { describe, expect, it } from 'vitest';
import { ErrorValidacion, estadoEnLiquidacion, nombreLiquidacion } from '../src/index.ts';

// Spec 011 · Liquidaciones (parte de dominio).
// Luz de octubre (A 20, B 20), luz de noviembre (A 15, B 15) y gas de septiembre a noviembre (A 45, B 45).
const periodos = [
  { inicio: '2026-10-01', fin: '2026-10-31' },
  { inicio: '2026-11-01', fin: '2026-11-30' },
  { inicio: '2026-09-01', fin: '2026-11-30' },
];

describe('Spec 011 · Liquidaciones', () => {
  it('C1 · nombre automático con los meses que cubren sus facturas (R2)', () => {
    expect(nombreLiquidacion(1, periodos)).toBe('Liquidación 1 · septiembre a noviembre de 2026');
    expect(nombreLiquidacion(2, [{ inicio: '2026-10-01', fin: '2026-10-31' }])).toBe('Liquidación 2 · octubre de 2026');
    expect(nombreLiquidacion(3, [{ inicio: '2026-12-01', fin: '2027-01-31' }])).toBe(
      'Liquidación 3 · diciembre de 2026 a enero de 2027',
    );
  });

  it('el nombre sale en el idioma de la app (R2b)', () => {
    expect(nombreLiquidacion(1, periodos, 'en')).toBe('Settlement 1 · September to November 2026');
    expect(nombreLiquidacion(4, [{ inicio: '2026-12-01', fin: '2027-01-31' }], 'en')).toBe('Settlement 4 · December 2026 to January 2027');
  });

  it('sin facturas no hay nombre (R6b)', () => {
    expect(() => nombreLiquidacion(1, [])).toThrow(ErrorValidacion);
  });

  it('C3 · totales de A: 80 €, pendiente (R8, R9)', () => {
    expect(estadoEnLiquidacion([{ importe: 2000 }, { importe: 1500 }, { importe: 4500 }])).toEqual({
      total: 8000,
      pagado: 0,
      pendiente: 8000,
      estado: 'pendiente',
    });
  });

  it('C6 · B paga la luz de octubre: parcial, le faltan 60 € (R9)', () => {
    expect(
      estadoEnLiquidacion([{ importe: 2000, pagadoEn: '2026-12-02' }, { importe: 1500 }, { importe: 4500 }]),
    ).toEqual({ total: 8000, pagado: 2000, pendiente: 6000, estado: 'parcial' });
  });

  it('C5 · todo pagado: pagada (R9)', () => {
    expect(estadoEnLiquidacion([{ importe: 2000, pagadoEn: '2026-12-02' }, { importe: 1500, pagadoEn: '2026-12-02' }]).estado).toBe('pagada');
  });
});
