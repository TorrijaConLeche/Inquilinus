import { ErrorValidacion } from './errores.ts';
import { aDia, mesDe, type Fecha } from './fechas.ts';

// Spec 011 · Liquidaciones: nombre automático, totales y estado por inquilino.

export type IdiomaNombre = 'es' | 'en';

const PREFIJO: Record<IdiomaNombre, string> = { es: 'Liquidación', en: 'Settlement' };

function nombreMes(mes: string, idioma: IdiomaNombre, conAnio: boolean): string {
  const [anio, numero] = mes.split('-').map(Number);
  return new Intl.DateTimeFormat(idioma === 'en' ? 'en-GB' : 'es-ES', {
    month: 'long',
    ...(conAnio && { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(anio!, numero! - 1, 1)));
}

/**
 * R2 y R2b: «Liquidación N · » y los meses que cubren sus facturas, del primer
 * mes de periodo al último: «octubre de 2026», «septiembre a noviembre de 2026»,
 * «diciembre de 2026 a enero de 2027» (o en inglés).
 */
export function nombreLiquidacion(
  numero: number,
  periodos: readonly { inicio: Fecha; fin: Fecha }[],
  idioma: IdiomaNombre = 'es',
): string {
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new ErrorValidacion('CAMPO_OBLIGATORIO', 'El número de liquidación empieza en 1');
  }
  if (periodos.length === 0) throw new ErrorValidacion('CAMPO_OBLIGATORIO', 'Una liquidación necesita al menos una factura');
  const inicio = periodos.map((p) => p.inicio).reduce((a, b) => (aDia(a) <= aDia(b) ? a : b));
  const fin = periodos.map((p) => p.fin).reduce((a, b) => (aDia(a) >= aDia(b) ? a : b));
  const [desde, hasta] = [mesDe(inicio), mesDe(fin)];
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  const conector = idioma === 'en' ? 'to' : 'a';
  const meses =
    desde === hasta
      ? nombreMes(desde, idioma, true)
      : `${nombreMes(desde, idioma, !mismoAnio)} ${conector} ${nombreMes(hasta, idioma, true)}`;
  return `${PREFIJO[idioma]} ${numero} · ${meses}`;
}

export type EstadoLiquidacion = 'pagada' | 'parcial' | 'pendiente';

/** R8 y R9: total, lo pagado y lo que falta de un inquilino, y su estado. */
export function estadoEnLiquidacion(partes: readonly { importe: number; pagadoEn?: Fecha | null }[]): {
  total: number;
  pagado: number;
  pendiente: number;
  estado: EstadoLiquidacion;
} {
  const total = partes.reduce((s, p) => s + p.importe, 0);
  const pagado = partes.filter((p) => p.pagadoEn).reduce((s, p) => s + p.importe, 0);
  const pagadas = partes.filter((p) => p.pagadoEn).length;
  const estado: EstadoLiquidacion = pagadas === 0 ? 'pendiente' : pagadas === partes.length ? 'pagada' : 'parcial';
  return { total, pagado, pendiente: total - pagado, estado };
}
