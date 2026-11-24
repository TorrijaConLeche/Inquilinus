import { describe, expect, it } from 'vitest';
import {
  altaDeInmueble,
  avisarFinDeCortesia,
  cambioDePlan,
  cortesiaVigente,
  desgloseIva,
  ErrorValidacion,
  inmueblesActivos,
  leerCortesias,
  lecturasIaDisponibles,
  mesDeUsoIa,
  planEfectivo,
  planesSuperiores,
  PRECIOS,
  puedeElegirInmueblesActivos,
  puedeLeerConIa,
  validarEleccion,
} from '../src/index.ts';

// Spec 010 · Planes y suscripciones (parte de dominio).
const tres = [
  { id: 'atico', creadoEn: '2026-03-01T10:00:00Z' },
  { id: 'centro', creadoEn: '2026-01-15T10:00:00Z' },
  { id: 'playa', creadoEn: '2026-06-01T10:00:00Z' },
];
// De más antiguo a más nuevo: a, b, c, d, e.
const cinco = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, creadoEn: `2026-0${i + 1}-01T10:00:00Z` }));

describe('Spec 010 · Planes', () => {
  it('C1 · segundo inmueble en Starter (R1)', () => {
    expect(altaDeInmueble('starter', 0)).toBe('permitida');
    expect(altaDeInmueble('starter', 1)).toBe('subir_de_plan');
    expect(planesSuperiores('starter')).toEqual(['plus', 'advanced']);
  });

  it('C2 · undécimo inmueble en Advanced (R1)', () => {
    expect(altaDeInmueble('advanced', 9)).toBe('permitida');
    expect(altaDeInmueble('advanced', 10)).toBe('contactar_soporte');
    expect(planesSuperiores('advanced')).toEqual([]);
  });

  it('C18 · cuarto inmueble en Plus (R1)', () => {
    expect(altaDeInmueble('plus', 2)).toBe('permitida');
    expect(altaDeInmueble('plus', 3)).toBe('subir_de_plan');
    expect(planesSuperiores('plus')).toEqual(['advanced']);
  });

  it('C3 · sexta factura por IA en Starter (R2)', () => {
    expect(puedeLeerConIa('starter', 4)).toBe(true);
    expect(puedeLeerConIa('starter', 5)).toBe(false);
    expect(lecturasIaDisponibles('starter', 3)).toBe(2);
    expect(lecturasIaDisponibles('starter', 7)).toBe(0);
    expect(puedeLeerConIa('plus', 99)).toBe(true);
    expect(puedeLeerConIa('advanced', 100)).toBe(false);
  });

  it('C4 · reinicio del contador a medianoche de Madrid (R3)', () => {
    expect(mesDeUsoIa('2026-11-30T22:59:59Z')).toBe('2026-11');
    expect(mesDeUsoIa('2026-11-30T23:00:00Z')).toBe('2026-12');
    expect(mesDeUsoIa('2026-07-31T22:00:00Z')).toBe('2026-08');
  });

  it('C10 · bajada a Starter con 3 inmuebles (R10, R10b)', () => {
    expect(inmueblesActivos('starter', tres)).toEqual({ activos: ['centro'], bloqueados: ['atico', 'playa'] });
    expect(inmueblesActivos('starter', tres, { elegidos: ['playa'] })).toEqual({
      activos: ['playa'],
      bloqueados: ['centro', 'atico'],
    });
    expect(inmueblesActivos('advanced', tres)).toEqual({ activos: ['centro', 'atico', 'playa'], bloqueados: [] });
  });

  it('C12 · desglose del IVA (R7)', () => {
    expect(desgloseIva(PRECIOS.plus.mensual)).toEqual({ base: 412, iva: 87 });
    expect(desgloseIva(PRECIOS.plus.anual)).toEqual({ base: 4124, iva: 866 });
    expect(desgloseIva(PRECIOS.advanced.mensual)).toEqual({ base: 826, iva: 173 });
    expect(desgloseIva(PRECIOS.advanced.anual)).toEqual({ base: 8256, iva: 1734 });
  });

  it('C13 · los inmuebles activos se eligen una sola vez (R10c)', () => {
    expect(puedeElegirInmueblesActivos('starter', 3, null)).toBe(true);
    expect(puedeElegirInmueblesActivos('starter', 3, '2026-11-01')).toBe(false);
    // Con todos dentro del límite no hay nada que elegir.
    expect(puedeElegirInmueblesActivos('advanced', 3, null)).toBe(false);
    expect(puedeElegirInmueblesActivos('starter', 1, null)).toBe(false);

    validarEleccion('starter', tres, ['playa']);
    validarEleccion('plus', cinco, ['e', 'a', 'c']);
    for (const mala of [[], ['playa', 'centro'], ['otro'], ['playa', 'playa']]) {
      expect(() => validarEleccion('starter', tres, mala)).toThrow(ErrorValidacion);
    }
    expect(() => validarEleccion('plus', cinco, ['a', 'b'])).toThrow('Hay que elegir 3 inmuebles');
  });

  it('C19 · subir de Plus a Advanced es inmediato (R5b)', () => {
    expect(cambioDePlan('plus', 'advanced')).toBe('inmediato');
    expect(cambioDePlan('plus', 'plus')).toBe('sin_cambio');
  });

  it('C20 · bajar de Advanced a Plus con 5 inmuebles (R5b, R10)', () => {
    expect(cambioDePlan('advanced', 'plus')).toBe('al_final_del_periodo');
    // Al acabar el periodo: los 3 más antiguos hasta que elija.
    expect(inmueblesActivos('plus', cinco, { previos: ['a', 'b', 'c', 'd', 'e'] })).toEqual({
      activos: ['a', 'b', 'c'],
      bloqueados: ['d', 'e'],
    });
    expect(inmueblesActivos('plus', cinco, { elegidos: ['b', 'd', 'e'] })).toEqual({
      activos: ['b', 'd', 'e'],
      bloqueados: ['a', 'c'],
    });
  });

  it('C21 · de Starter a Plus con 5 inmuebles (R11)', () => {
    // En Starter tenía activo el más nuevo: sigue activo, y se suman los 2 más antiguos.
    expect(inmueblesActivos('plus', cinco, { previos: ['e'] })).toEqual({ activos: ['a', 'b', 'e'], bloqueados: ['c', 'd'] });
    expect(puedeElegirInmueblesActivos('plus', 5, null)).toBe(true);
    // Si un elegido ya no existe, su hueco lo ocupa el siguiente con preferencia.
    expect(inmueblesActivos('plus', cinco, { elegidos: ['d', 'borrado'], previos: ['e'] })).toEqual({
      activos: ['a', 'd', 'e'],
      bloqueados: ['b', 'c'],
    });
  });

  it('C22 · cortesía sin fecha (R15, R3b)', () => {
    const { cortesias, erroneas } = leerCortesias(' Ana@Ejemplo.es , luis@ejemplo.es:2027-06-30,, ');
    expect(erroneas).toBe(0);
    expect(cortesias.get('ana@ejemplo.es')).toBeNull();
    expect(cortesias.get('luis@ejemplo.es')).toBe('2027-06-30');
    expect(cortesias.has('otra@ejemplo.es')).toBe(false);
    expect(planEfectivo(null, cortesias.get('ana@ejemplo.es'), '2030-01-01')).toBe('advanced');
    expect(planEfectivo(null, cortesias.get('otra@ejemplo.es'), '2030-01-01')).toBe('starter');
    expect(leerCortesias(undefined).cortesias.size).toBe(0);
  });

  it('C23 · fin de la cortesía (R15b, R15c)', () => {
    const hasta = '2027-06-30';
    expect(avisarFinDeCortesia(hasta, '2027-06-15')).toBe(false);
    expect(avisarFinDeCortesia(hasta, '2027-06-16')).toBe(true);
    expect(avisarFinDeCortesia(hasta, '2027-06-30')).toBe(true);
    expect(avisarFinDeCortesia(null, '2027-06-30')).toBe(false);
    expect(cortesiaVigente(hasta, '2027-06-30')).toBe(true);
    expect(cortesiaVigente(hasta, '2027-07-01')).toBe(false);
    expect(planEfectivo(null, hasta, '2027-06-30')).toBe('advanced');
    expect(planEfectivo(null, hasta, '2027-07-01')).toBe('starter');
  });

  it('C24 · cortesía y suscripción a la vez (R3b, R15d)', () => {
    expect(planEfectivo('plus', '2027-06-30', '2027-06-01')).toBe('advanced');
    expect(planEfectivo('plus', '2027-06-30', '2027-07-01')).toBe('plus');
    expect(planEfectivo('advanced', undefined, '2027-07-01')).toBe('advanced');
  });

  it('C25 · entrada mal escrita (R15)', () => {
    const { cortesias, erroneas } = leerCortesias(
      'ana@ejemplo.es:2027-02-30,sin-arroba,luis@ejemplo.es:30-06-2027,eva@ejemplo.es:2027-01-01:x,rosa@ejemplo.es',
    );
    expect(erroneas).toBe(4);
    expect([...cortesias.keys()]).toEqual(['rosa@ejemplo.es']);
    // Repetido: gana la cortesía más larga.
    expect(leerCortesias('a@b.es:2027-01-01,A@b.es:2027-06-30').cortesias.get('a@b.es')).toBe('2027-06-30');
    expect(leerCortesias('a@b.es:2027-01-01,a@b.es').cortesias.get('a@b.es')).toBeNull();
  });
});
