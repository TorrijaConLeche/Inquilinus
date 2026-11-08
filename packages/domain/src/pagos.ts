import { mesDe, type Fecha, type Mes } from './fechas.ts';

/** Algo que un inquilino debe pagar: un cobro de alquiler o su parte de un gasto. */
export interface Concepto {
  id: string;
  inmuebleId: string;
  inquilinoId: string;
  tipo: 'alquiler' | 'gasto';
  /** Mes del cobro, o mes en que se repartió la factura (spec 009, R8). */
  mes: Mes;
  /** Céntimos. */
  importe: number;
  pagadoEn?: Fecha | null;
  /** Cobro quitado por el propietario (spec 005, R11): no se ve ni cuenta. */
  quitado?: boolean;
}

const vigentes = (conceptos: readonly Concepto[]) => conceptos.filter((c) => !c.quitado);

/** Spec 004, R5 y spec 009, R1: suma de lo que está sin pagar. */
export function totalPendiente(conceptos: readonly Concepto[]): number {
  return vigentes(conceptos)
    .filter((c) => !c.pagadoEn)
    .reduce((s, c) => s + c.importe, 0);
}

/** Spec 009, R1: lo cobrado (marcado como pagado) dentro de un mes. */
export function cobradoEnMes(conceptos: readonly Concepto[], mes: Mes): number {
  return vigentes(conceptos)
    .filter((c) => c.pagadoEn && mesDe(c.pagadoEn) === mes)
    .reduce((s, c) => s + c.importe, 0);
}

export interface PendientesInquilino {
  inquilinoId: string;
  total: number;
  /** Ordenados del más antiguo al más reciente; los atrasados van primero (spec 009, R3). */
  conceptos: (Concepto & { atrasado: boolean })[];
}

export interface PendientesInmueble {
  inmuebleId: string;
  total: number;
  inquilinos: PendientesInquilino[];
}

export interface ResumenPanel {
  totalPendiente: number;
  cobradoEsteMes: number;
  /** Solo inmuebles con algo pendiente (spec 009, R2), de mayor a menor pendiente. */
  pendientes: PendientesInmueble[];
}

/** Spec 009 · Resumen del panel principal. */
export function resumenPanel(conceptos: readonly Concepto[], hoy: Fecha): ResumenPanel {
  const mesActual = mesDe(hoy);
  const sinPagar = vigentes(conceptos).filter((c) => !c.pagadoEn);
  const porInmueble = new Map<string, Map<string, Concepto[]>>();
  for (const c of sinPagar) {
    const inquilinos = porInmueble.get(c.inmuebleId) ?? new Map<string, Concepto[]>();
    inquilinos.set(c.inquilinoId, [...(inquilinos.get(c.inquilinoId) ?? []), c]);
    porInmueble.set(c.inmuebleId, inquilinos);
  }
  const sumar = (cs: readonly { importe: number }[]) => cs.reduce((s, c) => s + c.importe, 0);
  const pendientes = [...porInmueble].map(([inmuebleId, inquilinos]) => {
    const filas = [...inquilinos].map(([inquilinoId, cs]) => ({
      inquilinoId,
      total: sumar(cs),
      conceptos: [...cs]
        .sort((a, b) => (a.mes === b.mes ? (a.tipo === b.tipo ? 0 : a.tipo === 'alquiler' ? -1 : 1) : a.mes < b.mes ? -1 : 1))
        .map((c) => ({ ...c, atrasado: c.mes < mesActual })),
    }));
    filas.sort((a, b) => b.total - a.total);
    return { inmuebleId, total: filas.reduce((s, f) => s + f.total, 0), inquilinos: filas };
  });
  pendientes.sort((a, b) => b.total - a.total);
  return { totalPendiente: totalPendiente(conceptos), cobradoEsteMes: cobradoEnMes(conceptos, mesActual), pendientes };
}

/** Spec 009, R9: marca un concepto como pagado (por defecto, hoy). */
export function marcarPagado(concepto: Concepto, fecha: Fecha): Concepto {
  return { ...concepto, pagadoEn: fecha };
}

/** Spec 009, R10: "Todo pagado" para un inquilino y un mes. No toca otros meses ni lo ya pagado. */
export function marcarTodoPagado(
  conceptos: readonly Concepto[],
  inquilinoId: string,
  mes: Mes,
  fecha: Fecha,
): Concepto[] {
  return conceptos.map((c) =>
    c.inquilinoId === inquilinoId && c.mes === mes && !c.pagadoEn && !c.quitado ? marcarPagado(c, fecha) : c,
  );
}
