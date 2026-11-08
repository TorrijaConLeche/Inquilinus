import { calcularAlquilerMes, type EntradaAlquilerMes, type ResultadoAlquilerMes } from './alquiler.ts';
import { diaDelMes, fechaEnMes, mesDe, type Fecha, type Mes } from './fechas.ts';
import { validarDiaCobro } from './gestion.ts';

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
