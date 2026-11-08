import { describe, expect, it } from 'vitest';
import { marcarPagado, marcarTodoPagado, resumenPanel, type Concepto } from '../src/index.ts';

// Spec 009 · Panel principal y cobros del inmueble (parte de dominio). Hoy es el 2026-10-20.
const HOY = '2026-10-20';
const conceptos: Concepto[] = [
  { id: 'a-oct', inmuebleId: 'centro', inquilinoId: 'A', tipo: 'alquiler', mes: '2026-10', importe: 50000 },
  { id: 'a-sep', inmuebleId: 'centro', inquilinoId: 'A', tipo: 'alquiler', mes: '2026-09', importe: 50000 },
  { id: 'b-luz', inmuebleId: 'centro', inquilinoId: 'B', tipo: 'gasto', mes: '2026-10', importe: 3000 },
  { id: 'x-oct', inmuebleId: 'atico', inquilinoId: 'X', tipo: 'alquiler', mes: '2026-10', importe: 70000, pagadoEn: '2026-10-02' },
];

describe('Spec 009 · Panel y cobros', () => {
  it('C1 · resumen (R1)', () => {
    const r = resumenPanel(conceptos, HOY);
    expect(r.totalPendiente).toBe(103000);
    expect(r.cobradoEsteMes).toBe(70000);
  });

  it('C2 · agrupación por inmueble e inquilino (R2)', () => {
    const r = resumenPanel(conceptos, HOY);
    expect(r.pendientes.map((i) => [i.inmuebleId, i.total])).toEqual([['centro', 103000]]);
    expect(r.pendientes[0]!.inquilinos.map((q) => [q.inquilinoId, q.total])).toEqual([
      ['A', 100000],
      ['B', 3000],
    ]);
  });

  it('C3 · los meses anteriores van primero y destacados (R3, R7)', () => {
    const a = resumenPanel(conceptos, HOY).pendientes[0]!.inquilinos[0]!;
    expect(a.conceptos.map((c) => [c.id, c.atrasado])).toEqual([
      ['a-sep', true],
      ['a-oct', false],
    ]);
  });

  it('C4 · un toque marca pagado con la fecha de hoy (R9)', () => {
    const pagado = marcarPagado(conceptos[2]!, HOY);
    expect(pagado.pagadoEn).toBe(HOY);
    expect({ ...pagado, pagadoEn: null }.pagadoEn).toBe(null);
  });

  it('C5 · "Todo pagado" solo afecta al mes elegido (R10)', () => {
    const r = marcarTodoPagado(conceptos, 'A', '2026-10', HOY);
    expect(r.find((c) => c.id === 'a-oct')!.pagadoEn).toBe(HOY);
    expect(r.find((c) => c.id === 'a-sep')!.pagadoEn).toBe(undefined);
  });

  it('C7 · un cobro quitado no cuenta (R12)', () => {
    const conQuitado = conceptos.map((c) => (c.id === 'a-sep' ? { ...c, quitado: true } : c));
    expect(resumenPanel(conQuitado, HOY).totalPendiente).toBe(53000);
  });
});
