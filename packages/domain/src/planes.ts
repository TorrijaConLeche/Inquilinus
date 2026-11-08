import { fechaEnMadrid, mesDe, type Fecha, type Mes } from './fechas.ts';

export type Plan = 'starter' | 'advanced';
export type Periodicidad = 'mensual' | 'anual';

/** Spec 010 · Límites de cada plan. */
export const LIMITES: Readonly<Record<Plan, { inmueblesActivos: number; facturasIaAlMes: number }>> = {
  starter: { inmueblesActivos: 1, facturasIaAlMes: 2 },
  advanced: { inmueblesActivos: 10, facturasIaAlMes: 100 },
};

/** Spec 010 · Precios con IVA incluido, en céntimos. */
export const PRECIOS: Readonly<Record<Periodicidad, number>> = { mensual: 499, anual: 4990 };

/** Tipo de IVA en España (spec 010, R7). */
export const IVA_ESPANA = 21;

/** Spec 010, R1: qué pasa al intentar crear un inmueble más. */
export function altaDeInmueble(plan: Plan, activos: number): 'permitida' | 'ofrecer_advanced' | 'contactar_soporte' {
  if (activos < LIMITES[plan].inmueblesActivos) return 'permitida';
  return plan === 'starter' ? 'ofrecer_advanced' : 'contactar_soporte';
}

/** Spec 010, R2: si la siguiente factura se puede leer con IA o hay que rellenarla a mano. */
export function puedeLeerConIa(plan: Plan, leidasEsteMes: number): boolean {
  return leidasEsteMes < LIMITES[plan].facturasIaAlMes;
}

/** Spec 010, R3: mes del contador de facturas por IA, en hora de Madrid. */
export function mesDeUsoIa(instante: Date | string): Mes {
  return mesDe(fechaEnMadrid(instante));
}

/**
 * Spec 010, R10 y R10b: al pasar a Starter, qué inmueble sigue activo y cuáles quedan bloqueados.
 * Si el usuario no ha elegido, sigue activo el más antiguo.
 */
export function inmueblesTrasBajada(
  inmuebles: readonly { id: string; creadoEn: string }[],
  elegido?: string | null,
): { activo: string | null; bloqueados: string[] } {
  if (inmuebles.length === 0) return { activo: null, bloqueados: [] };
  const masAntiguo = [...inmuebles].sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0))[0]!;
  const activo = elegido && inmuebles.some((i) => i.id === elegido) ? elegido : masAntiguo.id;
  return { activo, bloqueados: inmuebles.filter((i) => i.id !== activo).map((i) => i.id) };
}

/**
 * Spec 010, R10c: en Starter, el inmueble activo se elige una sola vez.
 * `elegidoEn` es la fecha de la elección en el periodo actual en Starter (vacía si aún no ha elegido;
 * se vacía al volver a Advanced).
 */
export function puedeElegirInmuebleActivo(plan: Plan, elegidoEn: Fecha | null | undefined): boolean {
  return plan === 'starter' && !elegidoEn;
}

/** Spec 010, R7 y C12: base imponible e IVA de un precio con IVA incluido (céntimos). */
export function desgloseIva(totalConIva: number, tipo: number = IVA_ESPANA): { base: number; iva: number } {
  const base = Math.round((totalConIva * 100) / (100 + tipo));
  return { base, iva: totalConIva - base };
}
