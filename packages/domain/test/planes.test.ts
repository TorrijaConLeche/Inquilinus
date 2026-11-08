import { describe, expect, it } from 'vitest';
import {
  altaDeInmueble,
  desgloseIva,
  inmueblesTrasBajada,
  mesDeUsoIa,
  PRECIOS,
  puedeElegirInmuebleActivo,
  puedeLeerConIa,
} from '../src/index.ts';

// Spec 010 · Planes y suscripciones (parte de dominio).
describe('Spec 010 · Planes', () => {
  it('C1 · segundo inmueble en Starter (R1)', () => {
    expect(altaDeInmueble('starter', 0)).toBe('permitida');
    expect(altaDeInmueble('starter', 1)).toBe('ofrecer_advanced');
  });

  it('C2 · undécimo inmueble en Advanced (R1)', () => {
    expect(altaDeInmueble('advanced', 9)).toBe('permitida');
    expect(altaDeInmueble('advanced', 10)).toBe('contactar_soporte');
  });

  it('C3 · tercera factura por IA en Starter (R2)', () => {
    expect(puedeLeerConIa('starter', 1)).toBe(true);
    expect(puedeLeerConIa('starter', 2)).toBe(false);
    expect(puedeLeerConIa('advanced', 99)).toBe(true);
    expect(puedeLeerConIa('advanced', 100)).toBe(false);
  });

  it('C4 · reinicio del contador a medianoche de Madrid (R3)', () => {
    expect(mesDeUsoIa('2026-11-30T22:59:59Z')).toBe('2026-11');
    expect(mesDeUsoIa('2026-11-30T23:00:00Z')).toBe('2026-12');
    expect(mesDeUsoIa('2026-07-31T22:00:00Z')).toBe('2026-08');
  });

  it('C10 · bajada a Starter con 3 inmuebles (R10, R10b)', () => {
    const inmuebles = [
      { id: 'atico', creadoEn: '2026-03-01T10:00:00Z' },
      { id: 'centro', creadoEn: '2026-01-15T10:00:00Z' },
      { id: 'playa', creadoEn: '2026-06-01T10:00:00Z' },
    ];
    expect(inmueblesTrasBajada(inmuebles)).toEqual({ activo: 'centro', bloqueados: ['atico', 'playa'] });
    expect(inmueblesTrasBajada(inmuebles, 'playa')).toEqual({ activo: 'playa', bloqueados: ['atico', 'centro'] });
  });

  it('C13 · el inmueble activo se elige una sola vez (R10c)', () => {
    expect(puedeElegirInmuebleActivo('starter', null)).toBe(true);
    expect(puedeElegirInmuebleActivo('starter', '2026-11-01')).toBe(false);
    expect(puedeElegirInmuebleActivo('advanced', null)).toBe(false);
  });

  it('C12 · desglose del IVA (R7)', () => {
    expect(desgloseIva(PRECIOS.mensual)).toEqual({ base: 412, iva: 87 });
    expect(desgloseIva(PRECIOS.anual)).toEqual({ base: 4124, iva: 866 });
  });
});
