import type { MesesParciales, Modalidad } from './alquiler.ts';
import { ErrorValidacion } from './errores.ts';
import { rangoDelMes, type Mes } from './fechas.ts';

/** Spec 005, R1: el día de cobro va del 1 al 28. */
export function validarDiaCobro(dia: number): number {
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
    throw new ErrorValidacion('DIA_COBRO_INVALIDO', 'El día de cobro debe estar entre el 1 y el 28');
  }
  return dia;
}

function nombreValido(nombre: string | null | undefined, que: string): string {
  const limpio = (nombre ?? '').trim();
  if (!limpio) throw new ErrorValidacion('NOMBRE_OBLIGATORIO', `Falta el nombre ${que}`);
  return limpio;
}

function precioValido(precio: number): number {
  if (!Number.isSafeInteger(precio) || precio < 0) {
    throw new ErrorValidacion('IMPORTE_INVALIDO', 'El precio debe ser un número entero de céntimos no negativo');
  }
  return precio;
}

export interface AltaInmueble {
  nombre: string;
  direccion?: string | null;
  modalidad: Modalidad;
  mesesParciales?: MesesParciales;
  diaCobro?: number;
  habitaciones: readonly { nombre: string; precioMensual: number }[];
}

export interface InmuebleNuevo {
  nombre: string;
  direccion: string | null;
  modalidad: Modalidad;
  mesesParciales: MesesParciales;
  diaCobro: number;
  habitaciones: { nombre: string; precioMensual: number }[];
}

/** Spec 007, R1: valida el alta y aplica los valores por defecto (mes completo, día de cobro 1). */
export function normalizarAltaInmueble(alta: AltaInmueble): InmuebleNuevo {
  const nombre = nombreValido(alta.nombre, 'del inmueble');
  if (alta.habitaciones.length === 0) {
    throw new ErrorValidacion('SIN_HABITACIONES', 'El inmueble necesita al menos una habitación con precio');
  }
  const direccion = (alta.direccion ?? '').trim();
  return {
    nombre,
    direccion: direccion || null,
    modalidad: alta.modalidad,
    mesesParciales: alta.mesesParciales ?? 'mes_completo',
    diaCobro: validarDiaCobro(alta.diaCobro ?? 1),
    habitaciones: alta.habitaciones.map((h) => ({
      nombre: nombreValido(h.nombre, 'de la habitación'),
      precioMensual: precioValido(h.precioMensual),
    })),
  };
}

/** Spec 007, R6: del inquilino solo se guarda el nombre, obligatorio. */
export function validarInquilino(datos: { nombre: string }): { nombre: string } {
  return { nombre: nombreValido(datos.nombre, 'del inquilino') };
}

export interface PrecioDesde {
  /** Mes desde el que aplica (`YYYY-MM`), inclusive. */
  desdeMes: Mes;
  /** Céntimos. */
  precioMensual: number;
}

/** Spec 007, R4: precio vigente en un mes = el último cambio con `desdeMes` igual o anterior. */
export function precioVigente(historial: readonly PrecioDesde[], mes: Mes): number {
  rangoDelMes(mes);
  let vigente: PrecioDesde | undefined;
  for (const p of historial) {
    rangoDelMes(p.desdeMes);
    if (p.desdeMes <= mes && (!vigente || p.desdeMes > vigente.desdeMes)) vigente = p;
  }
  if (!vigente) throw new ErrorValidacion('SIN_PRECIO', `La habitación no tiene precio en ${mes}`);
  return vigente.precioMensual;
}

/** Spec 007, R5: meses desde los que un cambio de precio afecta a cobros ya generados. */
export function mesesAfectadosPorCambioDePrecio(desdeMes: Mes, mesesConCobros: readonly Mes[]): Mes[] {
  return mesesConCobros.filter((m) => m >= desdeMes);
}

/** Spec 007, R11: lo que tiene historial se archiva; lo demás se puede borrar. */
export function accionAlEliminar(tieneHistorial: boolean): 'archivar' | 'borrar' {
  return tieneHistorial ? 'archivar' : 'borrar';
}

/** Spec 007, R12: nombre que sustituye al de un inquilino borrado. */
export function nombreAnonimo(numero: number): string {
  return `Inquilino ${numero}`;
}

/** Spec 007, R13: para borrar un inmueble hay que escribir exactamente su nombre. */
export function confirmaBorradoInmueble(nombreInmueble: string, escrito: string): boolean {
  return nombreInmueble.trim() !== '' && nombreInmueble.trim() === escrito.trim();
}
