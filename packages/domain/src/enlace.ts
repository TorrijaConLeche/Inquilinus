import { aDia, sumarMeses, type Fecha } from './fechas.ts';

/** Spec 004, R3: el enlace funciona hasta 3 meses después de la salida. */
export const MESES_VIGENCIA_TRAS_SALIDA = 3;

/** Último día en que funciona el enlace (inclusive). `null` si el inquilino no tiene fecha de salida. */
export function caducidadEnlace(salida: Fecha | null | undefined): Fecha | null {
  return salida ? sumarMeses(salida, MESES_VIGENCIA_TRAS_SALIDA) : null;
}

/** Spec 004, R3 y R4: un enlace revocado o caducado no está disponible. */
export function enlaceDisponible(
  hoy: Fecha,
  enlace: { salida?: Fecha | null; revocadoEn?: string | null },
): boolean {
  if (enlace.revocadoEn) return false;
  const caducidad = caducidadEnlace(enlace.salida);
  return caducidad === null || aDia(hoy) <= aDia(caducidad);
}
