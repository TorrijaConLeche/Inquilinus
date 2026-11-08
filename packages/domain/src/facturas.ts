import { ErrorValidacion } from './errores.ts';
import { aDia, type Fecha } from './fechas.ts';

/** Spec 003, R1: tamaño máximo del PDF de una factura (10 MB). */
export const TAMANO_MAXIMO_FACTURA = 10 * 1024 * 1024;

/** Spec 003, R1: solo PDF de hasta 10 MB. Se comprueba antes de llamar a la IA. */
export function validarFicheroFactura(fichero: { tipoMime: string; tamano: number }): void {
  if (fichero.tipoMime !== 'application/pdf') {
    throw new ErrorValidacion('FICHERO_INVALIDO', 'Solo se aceptan facturas en PDF');
  }
  if (!Number.isSafeInteger(fichero.tamano) || fichero.tamano <= 0 || fichero.tamano > TAMANO_MAXIMO_FACTURA) {
    throw new ErrorValidacion('FICHERO_INVALIDO', 'El PDF debe ocupar como máximo 10 MB');
  }
}

/**
 * Convierte un importe escrito ("87,45 €", "1.234,56", "87.45") en céntimos.
 * Devuelve `null` si no se puede interpretar sin ambigüedad: nunca se inventa un valor (spec 003, R4).
 */
export function importeDesdeTexto(texto: string): number | null {
  const limpio = texto.replace(/[\s€]|EUR/gi, '');
  if (!/^\d[\d.,]*$/.test(limpio)) return null;
  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');
  let entera: string;
  let decimales = '';
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const sep = Math.max(ultimaComa, ultimoPunto);
    entera = limpio.slice(0, sep).replace(/[.,]/g, '');
    decimales = limpio.slice(sep + 1);
  } else if (ultimaComa >= 0) {
    if (limpio.indexOf(',') !== ultimaComa) return null;
    entera = limpio.slice(0, ultimaComa);
    decimales = limpio.slice(ultimaComa + 1);
  } else if (ultimoPunto >= 0) {
    const grupos = limpio.split('.');
    const soloMiles = grupos.length > 1 && grupos.slice(1).every((g) => g.length === 3);
    if (soloMiles) {
      entera = grupos.join('');
    } else {
      if (grupos.length !== 2) return null;
      entera = grupos[0]!;
      decimales = grupos[1]!;
    }
  } else {
    entera = limpio;
  }
  if (!/^\d+$/.test(entera) || !/^\d{0,2}$/.test(decimales)) return null;
  const centimos = Number(entera) * 100 + Number(decimales.padEnd(2, '0'));
  return Number.isSafeInteger(centimos) ? centimos : null;
}

/** Lo que propone la IA o rellena la usuaria antes de confirmar. Cualquier campo puede faltar. */
export interface BorradorFactura {
  tipoGastoId?: string | null;
  inicio?: Fecha | null;
  fin?: Fecha | null;
  /** Céntimos. */
  importe?: number | null;
}

export interface FacturaConfirmada {
  tipoGastoId: string;
  inicio: Fecha;
  fin: Fecha;
  importe: number;
}

/** Spec 003, R3, R4 y R9: todos los campos rellenos, periodo válido e importe positivo. */
export function validarConfirmacion(borrador: BorradorFactura): FacturaConfirmada {
  const { tipoGastoId, inicio, fin, importe } = borrador;
  if (!tipoGastoId || !inicio || !fin || importe === null || importe === undefined) {
    throw new ErrorValidacion('CAMPO_OBLIGATORIO', 'Faltan datos de la factura: tipo de gasto, periodo o importe');
  }
  if (aDia(fin) < aDia(inicio)) {
    throw new ErrorValidacion('PERIODO_INVALIDO', 'La fecha de fin es anterior a la de inicio');
  }
  if (!Number.isSafeInteger(importe) || importe <= 0) {
    throw new ErrorValidacion('IMPORTE_INVALIDO', 'El importe debe ser un número entero de céntimos mayor que cero');
  }
  return { tipoGastoId, inicio, fin, importe };
}

export interface FacturaExistente {
  id: string;
  tipoGastoId: string;
  inicio: Fecha;
  fin: Fecha;
}

/**
 * Spec 003, R6: facturas del mismo tipo de gasto cuyo periodo comparte al menos un día con el de la nueva.
 * Devuelve sus ids; la usuaria decide si continúa.
 */
export function facturasSolapadas(
  nueva: { tipoGastoId: string; inicio: Fecha; fin: Fecha },
  existentes: readonly FacturaExistente[],
  excluirId?: string,
): string[] {
  const ini = aDia(nueva.inicio);
  const fin = aDia(nueva.fin);
  return existentes
    .filter((f) => f.id !== excluirId && f.tipoGastoId === nueva.tipoGastoId)
    .filter((f) => aDia(f.inicio) <= fin && ini <= aDia(f.fin))
    .map((f) => f.id);
}
