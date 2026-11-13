import type { MesesParciales, Modalidad } from './alquiler.ts';
import { ErrorValidacion } from './errores.ts';
import { aDia, rangoDelMes, type Fecha, type Mes } from './fechas.ts';

/** Spec 005, R1: el día de cobro va del 1 al 28. */
export function validarDiaCobro(dia: number): number {
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
    throw new ErrorValidacion('DIA_COBRO_INVALIDO', 'El día de cobro debe estar entre el 1 y el 28');
  }
  return dia;
}

/** Nombre obligatorio, sin espacios sobrantes. `que` completa el mensaje ("del inmueble"). */
export function validarNombre(nombre: string | null | undefined, que: string): string {
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
  const nombre = validarNombre(alta.nombre, 'del inmueble');
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
      nombre: validarNombre(h.nombre, 'de la habitación'),
      precioMensual: precioValido(h.precioMensual),
    })),
  };
}

/** Spec 007, R6: del inquilino solo se guarda el nombre, obligatorio. */
export function validarInquilino(datos: { nombre: string }): { nombre: string } {
  return { nombre: validarNombre(datos.nombre, 'del inquilino') };
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

/**
 * Spec 007, R11b: una estancia está vigente si alguien vive o va a vivir en
 * ella: sin salida, o con salida de hoy en adelante (incluye las que aún no han empezado).
 */
export function estanciaVigente(estancia: { salida: Fecha | null }, hoy: Fecha): boolean {
  aDia(hoy);
  return estancia.salida === null || estancia.salida >= hoy;
}

/** Spec 007, R11d: antiguo = tuvo estancias y todas terminaron antes de hoy. */
export function esInquilinoAntiguo(estancias: readonly { salida: Fecha | null }[], hoy: Fecha): boolean {
  return estancias.length > 0 && !estancias.some((e) => estanciaVigente(e, hoy));
}

/** Spec 007, R12: nombre que sustituye al de un inquilino borrado. */
export function nombreAnonimo(numero: number): string {
  return `Inquilino ${numero}`;
}

/** Spec 007, R13: para borrar un inmueble hay que escribir exactamente su nombre. */
export function confirmaBorradoInmueble(nombreInmueble: string, escrito: string): boolean {
  return nombreInmueble.trim() !== '' && nombreInmueble.trim() === escrito.trim();
}

/** Spec 007, R6b: tamaño máximo del contrato o del justificante de la fianza (10 MB). */
export const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

/** La cabecera `%PDF-` puede ir precedida de basura, pero siempre en los primeros 1024 bytes. */
const ZONA_CABECERA_PDF = 1024;
const CABECERA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/**
 * Spec 007, R6b: el documento debe ser un PDF de hasta 10 MB. Se mira el contenido,
 * no la extensión ni el tipo que diga el navegador.
 */
export function validarDocumento(contenido: Uint8Array): void {
  if (contenido.length === 0 || contenido.length > TAMANO_MAXIMO_DOCUMENTO) {
    throw new ErrorValidacion('FICHERO_INVALIDO', 'El documento debe ocupar como máximo 10 MB');
  }
  const limite = Math.min(contenido.length, ZONA_CABECERA_PDF) - CABECERA_PDF.length;
  for (let i = 0; i <= limite; i++) {
    if (CABECERA_PDF.every((byte, j) => contenido[i + j] === byte)) return;
  }
  throw new ErrorValidacion('FICHERO_INVALIDO', 'El documento tiene que ser un PDF');
}

/** Spec 007, R6d: longitud máxima de las notas de la fianza. */
export const LONGITUD_MAXIMA_NOTAS_FIANZA = 300;

export interface DatosFianza {
  /** Céntimos. */
  importe: number;
  recibidaEn?: Fecha | null | undefined;
  devueltaEn?: Fecha | null | undefined;
  /** Céntimos. */
  importeDevuelto?: number | null | undefined;
  notas?: string | null | undefined;
}

export interface FianzaValida {

  importe: number;
  recibidaEn: Fecha | null;
  devueltaEn: Fecha | null;
  importeDevuelto: number | null;
  notas: string | null;
}

/** Spec 007, R6d: importe mayor que 0; la devolución lleva fecha e importe juntos, sin pasarse ni adelantarse. */
export function validarFianza(datos: DatosFianza): FianzaValida {
  if (!Number.isSafeInteger(datos.importe) || datos.importe <= 0) {
    throw new ErrorValidacion('IMPORTE_INVALIDO', 'La fianza debe ser un número entero de céntimos mayor que 0');
  }
  const recibidaEn = datos.recibidaEn ?? null;
  const devueltaEn = datos.devueltaEn ?? null;
  const importeDevuelto = datos.importeDevuelto ?? null;
  if (recibidaEn !== null) aDia(recibidaEn);
  if (devueltaEn !== null) aDia(devueltaEn);

  if ((devueltaEn === null) !== (importeDevuelto === null)) {
    throw new ErrorValidacion('DEVOLUCION_INCOMPLETA', 'La devolución necesita la fecha y el importe devuelto');
  }
  if (importeDevuelto !== null) {
    if (!Number.isSafeInteger(importeDevuelto) || importeDevuelto < 0) {
      throw new ErrorValidacion('IMPORTE_INVALIDO', 'El importe devuelto debe ser un número entero de céntimos no negativo');
    }
    if (importeDevuelto > datos.importe) {
      throw new ErrorValidacion('DEVOLUCION_MAYOR_QUE_FIANZA', 'No se puede devolver más que la fianza');
    }
  }
  if (recibidaEn !== null && devueltaEn !== null && devueltaEn < recibidaEn) {
    throw new ErrorValidacion('DEVOLUCION_ANTES_DE_RECEPCION', 'La devolución no puede ser anterior a la recepción');
  }

  const notas = (datos.notas ?? '').trim();
  if (notas.length > LONGITUD_MAXIMA_NOTAS_FIANZA) {
    throw new ErrorValidacion('NOTAS_DEMASIADO_LARGAS', `Las notas admiten como máximo ${LONGITUD_MAXIMA_NOTAS_FIANZA} caracteres`);
  }
  return { importe: datos.importe, recibidaEn, devueltaEn, importeDevuelto, notas: notas || null };
}
