import { calcularAlquilerMes, type EntradaAlquilerMes, type Habitacion, type LineaAlquiler, type ResultadoAlquilerMes } from './alquiler.ts';
import { ErrorValidacion } from './errores.ts';
import { aDia, desdeDia, diaDelMes, fechaEnMes, mesDe, rangoDelMes, type Fecha, type Mes } from './fechas.ts';
import { precioVigente, validarDiaCobro, type PrecioDesde } from './gestion.ts';
import type { Ocupacion } from './presencia.ts';

export interface CobroGenerado {
  inquilinoId: string;
  mes: Mes;
  /** Spec 005, R2 y R3: siempre el día de cobro del inmueble en ese mes. */
  fechaCobro: Fecha;
  renta: number;
  recargoVacios: number;
  importe: number;
}

export interface EntradaCobros extends Omit<EntradaAlquilerMes, 'mes'> {
  diaCobro: number;
  /** Cobros que ya existen, incluidos los quitados (spec 005, R4 y R11). */
  existentes: readonly { inquilinoId: string; mes: Mes }[];
}

/**
 * Spec 005, R4 y R5: cobros que faltan en un mes, con el cálculo de la spec 002.
 * Es la generación manual; la automática (R2) la usa con el mes en curso.
 */
export function cobrosQueFaltan(mes: Mes, entrada: EntradaCobros): CobroGenerado[] {
  const diaCobro = validarDiaCobro(entrada.diaCobro);
  const yaExisten = new Set(entrada.existentes.filter((c) => c.mes === mes).map((c) => c.inquilinoId));
  const calculo = calcularAlquilerMes({ ...entrada, mes });
  return calculo.lineas
    .filter((l) => !yaExisten.has(l.inquilinoId))
    .map((l) => ({
      inquilinoId: l.inquilinoId,
      mes,
      fechaCobro: fechaEnMes(mes, diaCobro),
      renta: l.renta,
      recargoVacios: l.recargoVacios,
      importe: l.importe,
    }));
}

/**
 * Spec 005, R2, R3 y R8: lo que genera el proceso diario. Si el día de cobro de este mes ya ha llegado,
 * crea los cobros del mes en curso que falten (también si el proceso falló días antes o el inquilino es nuevo).
 */
export function cobrosAGenerarHoy(hoy: Fecha, entrada: EntradaCobros): CobroGenerado[] {
  validarDiaCobro(entrada.diaCobro);
  if (diaDelMes(hoy) < entrada.diaCobro) return [];
  return cobrosQueFaltan(mesDe(hoy), entrada);
}

/**
 * Spec 005, R6: inquilinos cuyos cobros de un mes quedan desactualizados tras un cambio de ocupaciones o precios.
 * Se compara el cálculo de antes con el de después (no con lo guardado, que puede estar editado a mano).
 */
export function inquilinosConCobroDesactualizado(antes: ResultadoAlquilerMes, despues: ResultadoAlquilerMes): string[] {
  const clave = (r: ResultadoAlquilerMes) => new Map(r.lineas.map((l) => [l.inquilinoId, `${l.renta}|${l.recargoVacios}`]));
  const a = clave(antes);
  const d = clave(despues);
  const ids = new Set([...a.keys(), ...d.keys()]);
  return [...ids].filter((id) => a.get(id) !== d.get(id));
}

/** Spec 005, R6 y R10: recalcular un cobro pagado o editado a mano pide confirmación. */
export function recalcularPideConfirmacion(cobro: { editado?: boolean; pagadoEn?: Fecha | null }): boolean {
  return Boolean(cobro.editado || cobro.pagadoEn);
}

/** ¿Se solapa la estancia con el mes? (entrada y salida inclusive). */
function estuvoEnElMes(o: Ocupacion, mes: Mes): boolean {
  const { inicio, fin } = rangoDelMes(mes);
  return aDia(o.entrada) <= fin && (o.salida == null || aDia(o.salida) >= inicio);
}

/**
 * Spec 005, R5b: habitaciones que entran en el cálculo de un mes, con su precio de ese mes.
 * Las activas con precio ese mes, y las archivadas solo si alguien vivió en ellas ese mes.
 * Si alguien vivió en una habitación sin precio ese mes, no se puede calcular (SIN_PRECIO).
 */
export function habitacionesDelMes(
  mes: Mes,
  habitaciones: readonly { id: string; archivada: boolean; historialPrecios: readonly PrecioDesde[] }[],
  ocupaciones: readonly Ocupacion[],
): Habitacion[] {
  const ocupadas = new Set(ocupaciones.filter((o) => estuvoEnElMes(o, mes)).map((o) => o.habitacionId));
  const resultado: Habitacion[] = [];
  for (const h of habitaciones) {
    if (h.archivada && !ocupadas.has(h.id)) continue;
    const conPrecio = h.historialPrecios.some((p) => p.desdeMes <= mes);
    if (!conPrecio) {
      if (ocupadas.has(h.id)) throw new ErrorValidacion('SIN_PRECIO', `Una habitación ocupada en ${mes} no tiene precio ese mes`);
      continue;
    }
    resultado.push({ id: h.id, precioMensual: precioVigente(h.historialPrecios, mes) });
  }
  return resultado;
}

/** Spec 005, R5: no se generan cobros de meses que aún no han empezado. */
export function validarMesGenerable(mes: Mes, mesActual: Mes): Mes {
  rangoDelMes(mes);
  if (mes > mesActual) throw new ErrorValidacion('MES_FUTURO', `No se generan cobros de ${mes}: aún no ha empezado`);
  return mes;
}

/** Spec 005, R7: la fecha de pago no puede ser posterior a hoy. */
export function validarFechaPago(fecha: Fecha, hoy: Fecha): Fecha {
  if (aDia(fecha) > aDia(hoy)) throw new ErrorValidacion('PAGO_FUTURO', 'La fecha de pago no puede ser posterior a hoy');
  return fecha;
}

function importeValido(centimos: number, que: string): number {
  if (!Number.isSafeInteger(centimos) || centimos < 0) {
    throw new ErrorValidacion('IMPORTE_INVALIDO', `${que} debe ser un número entero de céntimos no negativo`);
  }
  return centimos;
}

/** Spec 005, R10: nueva renta y recargo de un cobro editado; el importe es su suma. */
export function importesEditados(renta: number, recargoVacios: number): { renta: number; recargoVacios: number; importe: number } {
  importeValido(renta, 'La renta');
  importeValido(recargoVacios, 'El recargo');
  return { renta, recargoVacios, importe: renta + recargoVacios };
}

/**
 * Spec 005, R10b: importes de un cobro añadido a mano. Si el inquilino vivió allí ese mes
 * (`calculado`), se proponen los calculados y se pueden cambiar; si no, la renta es obligatoria.
 * Queda como editado si no coincide con lo calculado.
 */
export function cobroManual(
  calculado: Pick<LineaAlquiler, 'renta' | 'recargoVacios'> | null,
  indicado: { renta?: number | undefined; recargoVacios?: number | undefined },
): { renta: number; recargoVacios: number; importe: number; editado: boolean } {
  const renta = indicado.renta ?? calculado?.renta;
  if (renta === undefined) {
    throw new ErrorValidacion('RENTA_OBLIGATORIA', 'El inquilino no vivió allí ese mes: indica la renta');
  }
  const recargoVacios = indicado.recargoVacios ?? calculado?.recargoVacios ?? 0;
  const importes = importesEditados(renta, recargoVacios);
  const editado = !calculado || calculado.renta !== importes.renta || calculado.recargoVacios !== importes.recargoVacios;
  return { ...importes, editado };
}

/** Fecha válida (`YYYY-MM-DD`); la devuelve normalizada. */
export function validarFecha(fecha: Fecha): Fecha {
  return desdeDia(aDia(fecha));
}
