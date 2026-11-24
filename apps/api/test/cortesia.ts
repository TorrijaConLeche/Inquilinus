import type { Cortesias } from "@inquilinus/domain";

/**
 * Advanced de cortesía (spec 010, R15) para las cuentas `<prefijo>1@ejemplo.test`,
 * `<prefijo>2@ejemplo.test`… Lo usan las pruebas que crean varios inmuebles por cuenta.
 */
export function cortesiaPara(prefijo: string, cuentas = 100): Cortesias {
  return new Map(Array.from({ length: cuentas }, (_, i) => [`${prefijo}${i + 1}@ejemplo.test`, null]));
}
