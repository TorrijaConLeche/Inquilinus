import { describe, expect, it } from 'vitest';
import {
  accionAlEliminar,
  confirmaBorradoInmueble,
  ErrorValidacion,
  mesesAfectadosPorCambioDePrecio,
  nombreAnonimo,
  normalizarAltaInmueble,
  precioVigente,
  validarInquilino,
  validarOcupaciones,
} from '../src/index.ts';

// Spec 007 · Gestión de inmuebles, habitaciones, inquilinos y ocupaciones (parte de dominio).
describe('Spec 007 · Gestión', () => {
  it('C1 · alta mínima con valores por defecto (R1)', () => {
    expect(
      normalizarAltaInmueble({
        nombre: ' Piso Centro ',
        modalidad: 'habitaciones',
        habitaciones: [{ nombre: 'H1', precioMensual: 50000 }],
      }),
    ).toEqual({
      nombre: 'Piso Centro',
      direccion: null,
      modalidad: 'habitaciones',
      mesesParciales: 'mes_completo',
      diaCobro: 1,
      habitaciones: [{ nombre: 'H1', precioMensual: 50000 }],
    });
  });

  it('C2 · sin habitaciones (R1)', () => {
    expect(() => normalizarAltaInmueble({ nombre: 'Piso', modalidad: 'entero', habitaciones: [] })).toThrow(
      ErrorValidacion,
    );
  });

  it('C3 · cambio de precio desde un mes (R4)', () => {
    const historial = [
      { desdeMes: '2026-01', precioMensual: 50000 },
      { desdeMes: '2027-01', precioMensual: 55000 },
    ];
    expect(precioVigente(historial, '2026-12')).toBe(50000);
    expect(precioVigente(historial, '2027-01')).toBe(55000);
    expect(() => precioVigente(historial, '2025-12')).toThrow(ErrorValidacion);
  });

  it('C4 · cambio de precio que afecta a meses con cobros (R5)', () => {
    expect(mesesAfectadosPorCambioDePrecio('2026-11', ['2026-10', '2026-11'])).toEqual(['2026-11']);
  });

  it('C5 · inquilino sin nombre (R6)', () => {
    expect(() => validarInquilino({ nombre: '   ' })).toThrow(ErrorValidacion);
    expect(validarInquilino({ nombre: ' Alex ' })).toEqual({ nombre: 'Alex' });
  });

  it('C6 · solape de ocupaciones (R7)', () => {
    expect(() =>
      validarOcupaciones([
        { habitacionId: 'H1', inquilinoId: 'A', entrada: '2026-09-01' },
        { habitacionId: 'H1', inquilinoId: 'B', entrada: '2026-10-01' },
      ]),
    ).toThrow(ErrorValidacion);
  });

  it('C7 · cambio de habitación (R8)', () => {
    expect(
      validarOcupaciones([
        { habitacionId: 'H1', inquilinoId: 'A', entrada: '2026-09-01', salida: '2026-10-14' },
        { habitacionId: 'H2', inquilinoId: 'A', entrada: '2026-10-15' },
      ]).length,
    ).toBe(2);
  });

  it('C8 · archivar o borrar (R11)', () => {
    expect(accionAlEliminar(true)).toBe('archivar');
    expect(accionAlEliminar(false)).toBe('borrar');
  });

  it('C9 · nombre anonimizado (R12)', () => {
    expect(nombreAnonimo(1)).toBe('Inquilino 1');
  });

  it('C10 · confirmación al borrar un inmueble (R13)', () => {
    expect(confirmaBorradoInmueble('Piso Centro', 'Piso centro')).toBe(false);
    expect(confirmaBorradoInmueble('Piso Centro', 'Piso Centro')).toBe(true);
  });
});
