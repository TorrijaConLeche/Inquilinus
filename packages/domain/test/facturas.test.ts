import { describe, expect, it } from 'vitest';
import {
  ErrorValidacion,
  facturasSolapadas,
  importeDesdeTexto,
  validarConfirmacion,
  validarFicheroFactura,
} from '../src/index.ts';

// Spec 003 · Lectura de facturas con IA (parte de dominio).
describe('Spec 003 · Lectura de facturas', () => {
  it('C1 · importe propuesto por la IA en formato español', () => {
    expect(importeDesdeTexto('87,45 €')).toBe(8745);
    expect(validarConfirmacion({ tipoGastoId: 'luz', inicio: '2026-09-01', fin: '2026-09-30', importe: 8745 })).toEqual({
      tipoGastoId: 'luz',
      inicio: '2026-09-01',
      fin: '2026-09-30',
      importe: 8745,
    });
  });

  it('C1 · formatos de importe y ambigüedades (R4: nunca se inventa)', () => {
    expect(importeDesdeTexto('1.234,56')).toBe(123456);
    expect(importeDesdeTexto('1,234.56')).toBe(123456);
    expect(importeDesdeTexto('87.45')).toBe(8745);
    expect(importeDesdeTexto('1.234')).toBe(123400);
    expect(importeDesdeTexto('12 EUR')).toBe(1200);
    expect(importeDesdeTexto('12,345')).toBe(null);
    expect(importeDesdeTexto('-5,00')).toBe(null);
    expect(importeDesdeTexto('sin importe')).toBe(null);
  });

  it('C2 · campo no encontrado: no se puede confirmar sin periodo (R4)', () => {
    expect(() => validarConfirmacion({ tipoGastoId: 'luz', inicio: null, fin: null, importe: 8745 })).toThrow(
      ErrorValidacion,
    );
  });

  it('C3 · fichero no PDF (R1)', () => {
    expect(() => validarFicheroFactura({ tipoMime: 'image/jpeg', tamano: 200_000 })).toThrow(ErrorValidacion);
  });

  it('C4 · fichero de más de 10 MB (R1)', () => {
    expect(() => validarFicheroFactura({ tipoMime: 'application/pdf', tamano: 12 * 1024 * 1024 })).toThrow(
      ErrorValidacion,
    );
    expect(() => validarFicheroFactura({ tipoMime: 'application/pdf', tamano: 2 * 1024 * 1024 })).not.toThrow();
  });

  const luzSept = { id: 'f1', tipoGastoId: 'luz', inicio: '2026-09-01', fin: '2026-09-30' };

  it('C5 · duplicado exacto (R6)', () => {
    expect(facturasSolapadas({ tipoGastoId: 'luz', inicio: '2026-09-01', fin: '2026-09-30' }, [luzSept])).toEqual(['f1']);
  });

  it('C6 · solape parcial (R6)', () => {
    const existente = { id: 'f2', tipoGastoId: 'luz', inicio: '2026-08-01', fin: '2026-09-15' };
    expect(facturasSolapadas({ tipoGastoId: 'luz', inicio: '2026-09-10', fin: '2026-10-10' }, [existente])).toEqual([
      'f2',
    ]);
  });

  it('C7 · periodos contiguos: sin aviso', () => {
    const agosto = { id: 'f3', tipoGastoId: 'luz', inicio: '2026-08-01', fin: '2026-08-31' };
    expect(facturasSolapadas({ tipoGastoId: 'luz', inicio: '2026-09-01', fin: '2026-09-30' }, [agosto])).toEqual([]);
  });

  it('C8 · mismo periodo, otro tipo: sin aviso', () => {
    expect(facturasSolapadas({ tipoGastoId: 'agua', inicio: '2026-09-01', fin: '2026-09-30' }, [luzSept])).toEqual([]);
  });

  it('C11 · validación del periodo (R9)', () => {
    expect(() =>
      validarConfirmacion({ tipoGastoId: 'luz', inicio: '2026-09-01', fin: '2026-08-31', importe: 100 }),
    ).toThrow(ErrorValidacion);
    expect(() => validarConfirmacion({ tipoGastoId: 'luz', inicio: '2026-09-01', fin: '2026-09-30', importe: 0 })).toThrow(
      ErrorValidacion,
    );
  });
});
