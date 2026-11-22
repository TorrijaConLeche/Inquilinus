import { describe, expect, it } from 'vitest';
import {
  carriles,
  chinchetasAlquiler,
  diaEnEje,
  ejeTimeline,
  estadoPagoGrupo,
  filasTimeline,
  limitarDiasVisibles,
  marcasTimeline,
  tramoEnEje,
  zoomDeDiasVisibles,
} from '../src/index.ts';

// Spec 006. Datos del caso C4 de la spec 002: A y B todo septiembre, C desde
// el 11; luz del 1 al 30 de septiembre, 90 €. Hoy, 2026-09-20.
const HOY = '2026-09-20';

describe('eje del timeline (R6b)', () => {
  it('por defecto, del mes anterior al actual completos', () => {
    expect(ejeTimeline([], HOY)).toEqual({ desde: '2026-08-01', hasta: '2026-09-30', dias: 61 });
  });

  it('si no llena lo que se ve de una vez, empieza meses antes', () => {
    expect(ejeTimeline([], HOY, 365)).toEqual({ desde: '2025-10-01', hasta: '2026-09-30', dias: 365 });
    expect(ejeTimeline([], '2027-03-10', 61)).toEqual({ desde: '2027-01-01', hasta: '2027-03-31', dias: 90 });
  });

  it('se alarga a meses completos con los datos más antiguos o más nuevos', () => {
    expect(ejeTimeline(['2026-03-10', '2026-11-30'], HOY)).toEqual({ desde: '2026-03-01', hasta: '2026-11-30', dias: 275 });
  });
});

describe('rayitas (R1, R6)', () => {
  const eje = ejeTimeline([], HOY);

  it('mes: una por día; el 1 y el 15, largas y con etiqueta', () => {
    const marcas = marcasTimeline(eje, 'mes');
    expect(marcas).toHaveLength(61);
    expect(marcas.filter((m) => m.larga).map((m) => m.fecha)).toEqual(['2026-08-01', '2026-08-15', '2026-09-01', '2026-09-15']);
    expect(marcas.filter((m) => m.etiqueta === 'dia')).toHaveLength(4);
  });

  it('trimestre: una por semana (los lunes) y el 1 de cada mes con su etiqueta', () => {
    const marcas = marcasTimeline(eje, 'trimestre');
    const lunes = marcas.filter((m) => !m.larga).map((m) => m.fecha);
    expect(lunes).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(marcas.filter((m) => m.etiqueta === 'mes').map((m) => m.fecha)).toEqual(['2026-08-01', '2026-09-01']);
  });

  it('C10 · zoom año: una rayita por mes con la etiqueta del mes', () => {
    const anio = ejeTimeline(['2026-01-15'], HOY);
    const marcas = marcasTimeline(anio, 'anio');
    expect(marcas.map((m) => m.fecha)).toEqual(Array.from({ length: 9 }, (_, i) => `2026-0${i + 1}-01`));
    expect(marcas.every((m) => m.larga && m.etiqueta === 'mes')).toBe(true);
  });
});

describe('zoom libre (R6c)', () => {
  it('C16 · zoom libre: rayitas del zoom más cercano y entre 14 y 730 días', () => {
    expect([61, 120, 121, 183, 270, 271, 365, 730].map(zoomDeDiasVisibles)).toEqual([
      'mes',
      'mes',
      'trimestre',
      'trimestre',
      'trimestre',
      'anio',
      'anio',
      'anio',
    ]);
    expect([3, 14, 90.5, 730, 2000].map(limitarDiasVisibles)).toEqual([14, 14, 90.5, 730, 730]);
  });
});

describe('filas y tramos', () => {
  const eje = ejeTimeline([], HOY);

  it('C1 · orden de filas: Alquiler, Luz, A, B, C (R2)', () => {
    const filas = filasTimeline({
      tiposGasto: [{ id: 'luz', archivado: false }],
      conFacturas: new Set(['luz']),
      inquilinos: [
        { id: 'A', estancias: 1 },
        { id: 'B', estancias: 1 },
        { id: 'C', estancias: 1 },
      ],
    });
    expect(filas).toEqual([
      { tipo: 'alquiler' },
      { tipo: 'gasto', tipoGastoId: 'luz' },
      { tipo: 'inquilino', inquilinoId: 'A' },
      { tipo: 'inquilino', inquilinoId: 'B' },
      { tipo: 'inquilino', inquilinoId: 'C' },
    ]);
  });

  it('R2b: los tipos archivados solo con facturas; los inquilinos sin estancias, fuera', () => {
    const filas = filasTimeline({
      tiposGasto: [
        { id: 'luz', archivado: false },
        { id: 'gas', archivado: true },
        { id: 'agua', archivado: true },
      ],
      conFacturas: new Set(['agua']),
      inquilinos: [
        { id: 'A', estancias: 1 },
        { id: 'X', estancias: 0 },
      ],
    });
    expect(filas.map((f) => (f.tipo === 'gasto' ? f.tipoGastoId : f.tipo === 'inquilino' ? f.inquilinoId : f.tipo))).toEqual([
      'alquiler',
      'luz',
      'agua',
      'A',
    ]);
  });

  it('C2 · la barra de Luz ocupa del 1 al 30 de septiembre (R4)', () => {
    expect(tramoEnEje(eje, '2026-09-01', '2026-09-30')).toEqual({ desde: 31, hasta: 60 });
  });

  it('C3 · C empieza el 11; A y B, sin salida, llegan al borde derecho (R5)', () => {
    expect(tramoEnEje(eje, '2026-09-11', null)).toEqual({ desde: 41, hasta: 60 });
    expect(tramoEnEje(eje, '2026-09-01', null)?.hasta).toBe(eje.dias - 1);
    // Lo que empieza antes del eje se recorta; lo que acaba antes, no se dibuja.
    expect(tramoEnEje(eje, '2026-05-01', null)).toEqual({ desde: 0, hasta: 60 });
    expect(tramoEnEje(eje, '2026-05-01', '2026-06-30')).toBeNull();
  });

  it('C11 · relevo: A sale el 15 y B entra el 15; las dos líneas se tocan ese día', () => {
    const a = tramoEnEje(eje, '2026-09-01', '2026-09-15')!;
    const b = tramoEnEje(eje, '2026-09-15', null)!;
    expect(a.hasta).toBe(b.desde);
    expect(diaEnEje(eje, '2026-09-15')).toBe(a.hasta);
  });
});

describe('estado de pago y chinchetas (R3b, R10)', () => {
  it('C12 · si 2 de 3 han pagado, «2/3 pagado»; si todos, completo', () => {
    expect(estadoPagoGrupo([true, true, false])).toEqual({ pagados: 2, total: 3, completo: false });
    expect(estadoPagoGrupo([true, true])).toEqual({ pagados: 2, total: 2, completo: true });
    expect(estadoPagoGrupo([]).completo).toBe(false);
  });

  it('C14 · los cobros del mismo día son una chincheta con la suma; si solo A ha pagado, 1/3', () => {
    const chinchetas = chinchetasAlquiler([
      { id: 'b-oct', fechaCobro: '2026-10-01', importe: 45_000, pagado: false },
      { id: 'a-sep', fechaCobro: '2026-09-01', importe: 55_000, pagado: true },
      { id: 'a-oct', fechaCobro: '2026-10-01', importe: 55_000, pagado: true },
      { id: 'c-oct', fechaCobro: '2026-10-01', importe: 20_000, pagado: false },
    ]);
    expect(chinchetas).toEqual([
      { fecha: '2026-09-01', importe: 55_000, ids: ['a-sep'], estado: { pagados: 1, total: 1, completo: true } },
      {
        fecha: '2026-10-01',
        importe: 120_000,
        ids: ['b-oct', 'a-oct', 'c-oct'],
        estado: { pagados: 1, total: 3, completo: false },
      },
    ]);
  });
});

describe('carriles (R4b)', () => {
  it('C15 · dos facturas de luz que se solapan van en dos carriles', () => {
    expect(
      carriles([
        { inicio: '2026-09-01', fin: '2026-09-30' },
        { inicio: '2026-09-15', fin: '2026-10-14' },
        { inicio: '2026-10-01', fin: '2026-10-31' },
      ]),
    ).toEqual([0, 1, 0]);
  });

  it('las que solo se tocan por fuera comparten carril', () => {
    expect(
      carriles([
        { inicio: '2026-10-01', fin: '2026-10-31' },
        { inicio: '2026-09-01', fin: '2026-09-30' },
      ]),
    ).toEqual([0, 0]);
  });
});
