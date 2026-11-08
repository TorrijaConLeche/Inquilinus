import { describe, expect, it } from 'vitest';
import { altaDeInmueble, desgloseIva, inmueblesTrasBajada, mesDeUsoIa, PRECIOS, puedeLeerConIa } from '../src/index.ts';

// Spec 010 · Planes y suscripciones (parte de dominio).
describe('Spec 010 · Planes', () => {
  it('C1 · segundo inmueble en Gratis (R1)', () => {
    expect(altaDeInmueble('gratis', 0)).toBe('permitida');
    expect(altaDeInmueble('gratis', 1)).toBe('ofrecer_propietaria');
  });

  it('C2 · undécimo inmueble en Propietaria (R1)', () => {
    expect(altaDeInmueble('propietaria', 9)).toBe('permitida');
    expect(altaDeInmueble('propietaria', 10)).toBe('contactar_soporte');
  });

  it('C3 · tercera factura por IA en Gratis (R2)', () => {
    expect(puedeLeerConIa('gratis', 1)).toBe(true);
    expect(puedeLeerConIa('gratis', 2)).toBe(false);
    expect(puedeLeerConIa('propietaria', 99)).toBe(true);
    expect(puedeLeerConIa('propietaria', 100)).toBe(false);
  });

  it('C4 · reinicio del contador a medianoche de Madrid (R3)', () => {
    expect(mesDeUsoIa('2026-11-30T22:59:59Z')).toBe('2026-11');
    expect(mesDeUsoIa('2026-11-30T23:00:00Z')).toBe('2026-12');
    expect(mesDeUsoIa('2026-07-31T22:00:00Z')).toBe('2026-08');
  });

  it('C10 · bajada a Gratis con 3 inmuebles (R10)', () => {
    const inmuebles = [
      { id: 'atico', creadoEn: '2026-03-01T10:00:00Z' },
      { id: 'centro', creadoEn: '2026-01-15T10:00:00Z' },
      { id: 'playa', creadoEn: '2026-06-01T10:00:00Z' },
    ];
    expect(inmueblesTrasBajada(inmuebles)).toEqual({ activo: 'centro', soloLectura: ['atico', 'playa'] });
    expect(inmueblesTrasBajada(inmuebles, 'playa')).toEqual({ activo: 'playa', soloLectura: ['atico', 'centro'] });
  });

  it('C12 · desglose del IVA (R7)', () => {
    expect(desgloseIva(PRECIOS.mensual)).toEqual({ base: 412, iva: 87 });
    expect(desgloseIva(PRECIOS.anual)).toEqual({ base: 4124, iva: 866 });
  });
});
