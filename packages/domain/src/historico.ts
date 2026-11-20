// Histórico del inmueble (spec 012): tipos de actividad y su grupo, filtros
// combinados, resumen de lo filtrado y agrupación por mes.
import type { Fecha, Mes } from './fechas.ts';

/** R2: grupos de actividad, en el orden en que se ofrecen como filtro. */
export const GRUPOS_ACTIVIDAD = ['alquiler', 'gastos', 'liquidaciones', 'pagos', 'inquilinos', 'inmueble', 'fianza', 'enlaces'] as const;
export type GrupoActividad = (typeof GRUPOS_ACTIVIDAD)[number];

/** R2: cada tipo de actividad y su grupo. */
export const TIPOS_ACTIVIDAD = {
  cobro_generado: 'alquiler',
  cobro_editado: 'alquiler',
  cobro_movido: 'alquiler',
  cobro_quitado: 'alquiler',
  cobro_restaurado: 'alquiler',
  cobro_recalculado: 'alquiler',
  factura_subida: 'gastos',
  factura_repartida: 'gastos',
  reparto_recalculado: 'gastos',
  reparto_deshecho: 'gastos',
  liquidacion_creada: 'liquidaciones',
  liquidacion_renombrada: 'liquidaciones',
  liquidacion_factura_anadida: 'liquidaciones',
  liquidacion_factura_quitada: 'liquidaciones',
  liquidacion_borrada: 'liquidaciones',
  cobro_pagado: 'pagos',
  cobro_desmarcado: 'pagos',
  parte_pagada: 'pagos',
  parte_desmarcada: 'pagos',
  todo_pagado: 'pagos',
  liquidacion_pagada: 'pagos',
  inquilino_alta: 'inquilinos',
  entrada: 'inquilinos',
  salida: 'inquilinos',
  estancia_corregida: 'inquilinos',
  cambio_habitacion: 'inquilinos',
  inquilino_borrado: 'inquilinos',
  precio_cambiado: 'inmueble',
  dia_cobro_cambiado: 'inmueble',
  opciones_cambiadas: 'inmueble',
  habitacion_creada: 'inmueble',
  habitacion_archivada: 'inmueble',
  tipo_gasto_creado: 'inmueble',
  tipo_gasto_archivado: 'inmueble',
  fianza_recibida: 'fianza',
  fianza_devuelta: 'fianza',
} as const satisfies Record<string, GrupoActividad>;
export type TipoActividad = keyof typeof TIPOS_ACTIVIDAD;

export function grupoDe(tipo: TipoActividad): GrupoActividad {
  return TIPOS_ACTIVIDAD[tipo];
}

/** Un cobro de alquiler o una parte de factura al que se refiere una actividad, con su estado de hoy (R7b). */
export interface ConceptoActividad {
  /** `cobro:<id>` o `parte:<id>`: cada concepto cuenta una vez en el resumen. */
  clave: string;
  inquilinoId: string;
  importe: number;
  pagado: boolean;
}

export interface ActividadFiltrable {
  /** Día en que ocurrió (hora de Madrid). */
  fecha: Fecha;
  grupo: GrupoActividad;
  inquilinoId: string | null;
  /** `alquiler`, el id del tipo de gasto o null si no es de dinero. */
  gasto: string | null;
  conceptos: readonly ConceptoActividad[];
}

/** R6: filtros combinables; los que no se dan no filtran. */
export interface FiltrosHistorico {
  inquilinos?: readonly string[] | undefined;
  /** `alquiler` o ids de tipos de gasto. */
  gastos?: readonly string[] | undefined;
  grupos?: readonly GrupoActividad[] | undefined;
  estado?: 'pagado' | 'pendiente' | undefined;
  desde?: Fecha | undefined;
  hasta?: Fecha | undefined;
}

export function hayFiltros(f: FiltrosHistorico): boolean {
  return Boolean(f.inquilinos?.length || f.gastos?.length || f.grupos?.length || f.estado || f.desde || f.hasta);
}

/** Los conceptos de una actividad que cuentan con estos filtros: los de los inquilinos elegidos. */
function conceptosDe(a: ActividadFiltrable, f: FiltrosHistorico): readonly ConceptoActividad[] {
  return f.inquilinos?.length ? a.conceptos.filter((c) => f.inquilinos!.includes(c.inquilinoId)) : a.conceptos;
}

/**
 * R6 y R7b: una actividad pasa si es de alguno de los inquilinos elegidos (o
 * afecta a uno), de alguno de los gastos y grupos elegidos, está entre las
 * fechas y, con estado, sus conceptos están todos pagados (pagado) o alguno
 * pendiente (pendiente).
 */
export function filtrarHistorico<T extends ActividadFiltrable>(actividades: readonly T[], f: FiltrosHistorico): T[] {
  return actividades.filter((a) => {
    if (f.inquilinos?.length) {
      const suya = (a.inquilinoId !== null && f.inquilinos.includes(a.inquilinoId)) || a.conceptos.some((c) => f.inquilinos!.includes(c.inquilinoId));
      if (!suya) return false;
    }
    if (f.gastos?.length && (a.gasto === null || !f.gastos.includes(a.gasto))) return false;
    if (f.grupos?.length && !f.grupos.includes(a.grupo)) return false;
    if (f.desde && a.fecha < f.desde) return false;
    if (f.hasta && a.fecha > f.hasta) return false;
    if (f.estado) {
      const conceptos = conceptosDe(a, f);
      if (conceptos.length === 0) return false;
      const todoPagado = conceptos.every((c) => c.pagado);
      if (f.estado === 'pagado' ? !todoPagado : todoPagado) return false;
    }
    return true;
  });
}

/** R7 y R7b: lo cobrado y lo pendiente hoy de los conceptos de lo filtrado, cada uno una vez. */
export function resumenHistorico(actividades: readonly ActividadFiltrable[], f: FiltrosHistorico): { pagado: number; pendiente: number } {
  const vistos = new Map<string, ConceptoActividad>();
  for (const a of actividades) for (const c of conceptosDe(a, f)) vistos.set(c.clave, c);
  let pagado = 0;
  let pendiente = 0;
  for (const c of vistos.values()) {
    if (c.pagado) pagado += c.importe;
    else pendiente += c.importe;
  }
  return { pagado, pendiente };
}

/** R5: por mes, en el orden en que llegan (lo más reciente primero). */
export function agruparPorMes<T extends { fecha: Fecha }>(actividades: readonly T[]): { mes: Mes; actividades: T[] }[] {
  const grupos: { mes: Mes; actividades: T[] }[] = [];
  for (const a of actividades) {
    const mes = a.fecha.slice(0, 7);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.mes === mes) ultimo.actividades.push(a);
    else grupos.push({ mes, actividades: [a] });
  }
  return grupos;
}
