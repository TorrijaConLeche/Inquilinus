import { ErrorValidacion } from './errores.ts';
import { aDia, fechaEnMadrid, mesDe, type Fecha, type Mes } from './fechas.ts';

export type Plan = 'starter' | 'plus' | 'advanced';
export type PlanDePago = Exclude<Plan, 'starter'>;
export type Periodicidad = 'mensual' | 'anual';

/** Spec 010 · Límites de cada plan. */
export const LIMITES: Readonly<Record<Plan, { inmueblesActivos: number; facturasIaAlMes: number }>> = {
  starter: { inmueblesActivos: 1, facturasIaAlMes: 5 },
  plus: { inmueblesActivos: 3, facturasIaAlMes: 100 },
  advanced: { inmueblesActivos: 10, facturasIaAlMes: 100 },
};

/** Spec 010 · Precios con IVA incluido, en céntimos. */
export const PRECIOS: Readonly<Record<PlanDePago, Readonly<Record<Periodicidad, number>>>> = {
  plus: { mensual: 499, anual: 4990 },
  advanced: { mensual: 999, anual: 9990 },
};

/** Tipo de IVA en España (spec 010, R7). */
export const IVA_ESPANA = 21;

/** De menos a más: el orden sirve para comparar planes. */
const ORDEN: readonly Plan[] = ['starter', 'plus', 'advanced'];

/** Spec 010, R3b: de dos planes, el que da más. */
export function planMayor(a: Plan, b: Plan): Plan {
  return ORDEN.indexOf(a) >= ORDEN.indexOf(b) ? a : b;
}

/** Spec 010, R1: los planes a los que se puede subir desde uno dado. */
export function planesSuperiores(plan: Plan): PlanDePago[] {
  return ORDEN.slice(ORDEN.indexOf(plan) + 1) as PlanDePago[];
}

/**
 * Spec 010, R1: qué pasa al intentar crear un inmueble más con `activos` inmuebles
 * activos (los archivados no cuentan). Si hay que subir de plan, `planesSuperiores` dice a cuáles.
 */
export function altaDeInmueble(plan: Plan, activos: number): 'permitida' | 'subir_de_plan' | 'contactar_soporte' {
  if (activos < LIMITES[plan].inmueblesActivos) return 'permitida';
  return planesSuperiores(plan).length > 0 ? 'subir_de_plan' : 'contactar_soporte';
}

/** Spec 010, R2: cuántas facturas se pueden leer aún con IA este mes. */
export function lecturasIaDisponibles(plan: Plan, leidasEsteMes: number): number {
  return Math.max(0, LIMITES[plan].facturasIaAlMes - leidasEsteMes);
}

/** Spec 010, R2: si la siguiente factura se puede leer con IA o hay que rellenarla a mano. */
export function puedeLeerConIa(plan: Plan, leidasEsteMes: number): boolean {
  return lecturasIaDisponibles(plan, leidasEsteMes) > 0;
}

/** Spec 010, R3: mes del contador de facturas por IA, en hora de Madrid. */
export function mesDeUsoIa(instante: Date | string): Mes {
  return mesDe(fechaEnMadrid(instante));
}

/** Spec 010, R5b: subir de Plus a Advanced es inmediato; bajar espera al final del periodo pagado. */
export function cambioDePlan(
  actual: PlanDePago,
  nuevo: PlanDePago,
): 'sin_cambio' | 'inmediato' | 'al_final_del_periodo' {
  if (actual === nuevo) return 'sin_cambio';
  return planMayor(actual, nuevo) === nuevo ? 'inmediato' : 'al_final_del_periodo';
}

export interface InmuebleDelPlan {
  id: string;
  creadoEn: string;
}

const porAntiguedad = (a: InmuebleDelPlan, b: InmuebleDelPlan) =>
  a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Spec 010, R10, R10b y R11: qué inmuebles (no archivados) siguen activos con un plan y
 * cuáles quedan bloqueados. Tienen preferencia, por este orden: los que eligió la usuaria
 * (R10c), los que ya estaban activos antes del cambio de plan (R11) y los más antiguos (R10).
 * Las dos listas salen ordenadas de más antiguo a más nuevo.
 */
export function inmueblesActivos(
  plan: Plan,
  inmuebles: readonly InmuebleDelPlan[],
  preferencia: { elegidos?: readonly string[] | null; previos?: readonly string[] | null } = {},
): { activos: string[]; bloqueados: string[] } {
  const ordenados = [...inmuebles].sort(porAntiguedad);
  const limite = LIMITES[plan].inmueblesActivos;
  const elegidos = new Set(preferencia.elegidos ?? []);
  const previos = new Set(preferencia.previos ?? []);
  const rango = (id: string) => (elegidos.has(id) ? 0 : previos.has(id) ? 1 : 2);
  const activos = new Set(
    [...ordenados]
      .sort((a, b) => rango(a.id) - rango(b.id) || porAntiguedad(a, b))
      .slice(0, limite)
      .map((i) => i.id),
  );
  return {
    activos: ordenados.filter((i) => activos.has(i.id)).map((i) => i.id),
    bloqueados: ordenados.filter((i) => !activos.has(i.id)).map((i) => i.id),
  };
}

/**
 * Spec 010, R10c: la elección de los inmuebles activos es única mientras siga en el mismo plan.
 * Solo hay que elegir si tiene más inmuebles de los que admite el plan. `elegidoEn` es la fecha
 * de la elección en el plan actual (vacía si aún no ha elegido; se vacía al cambiar de plan).
 */
export function puedeElegirInmueblesActivos(
  plan: Plan,
  numeroDeInmuebles: number,
  elegidoEn: Fecha | null | undefined,
): boolean {
  return numeroDeInmuebles > LIMITES[plan].inmueblesActivos && !elegidoEn;
}

/** Spec 010, R10 y R10c: una elección válida tiene tantos inmuebles como admite el plan, sin repetir y todos suyos. */
export function validarEleccion(plan: Plan, inmuebles: readonly InmuebleDelPlan[], elegidos: readonly string[]): void {
  const suyos = new Set(inmuebles.map((i) => i.id));
  const distintos = new Set(elegidos);
  const necesarios = Math.min(LIMITES[plan].inmueblesActivos, inmuebles.length);
  if (distintos.size !== elegidos.length || elegidos.length !== necesarios || elegidos.some((id) => !suyos.has(id))) {
    throw new ErrorValidacion('ELECCION_INVALIDA', `Hay que elegir ${necesarios} inmuebles`);
  }
}

/** Spec 010, R15: email (en minúsculas) → último día de la cortesía, o `null` si no caduca. */
export type Cortesias = ReadonlyMap<string, Fecha | null>;

/**
 * Spec 010, R15: lee `PLAN_CORTESIA` (`ana@ejemplo.es:2027-06-30,luis@ejemplo.es`). Mayúsculas y
 * espacios no cuentan. Las entradas mal escritas se ignoran y se cuentan en `erroneas`, para
 * avisar en el registro sin dar el email. Si un email se repite, gana la cortesía más larga.
 */
export function leerCortesias(texto: string | null | undefined): { cortesias: Cortesias; erroneas: number } {
  const cortesias = new Map<string, Fecha | null>();
  let erroneas = 0;
  for (const entrada of (texto ?? '').split(',')) {
    const limpia = entrada.trim().toLowerCase();
    if (!limpia) continue;
    const [email = '', hasta, ...resto] = limpia.split(':').map((parte) => parte.trim());
    if (resto.length > 0 || !/^[^\s@]+@[^\s@]+$/.test(email) || (hasta !== undefined && !esFecha(hasta))) {
      erroneas++;
      continue;
    }
    const fin = hasta ?? null;
    const anterior = cortesias.get(email);
    if (anterior === undefined || (anterior !== null && (fin === null || fin > anterior))) cortesias.set(email, fin);
  }
  return { cortesias, erroneas };
}

function esFecha(texto: string): boolean {
  try {
    aDia(texto);
    return true;
  } catch {
    return false;
  }
}

/** Spec 010, R15 y R15b: la cortesía vale hasta el final de su último día (en hora de Madrid). */
export function cortesiaVigente(hasta: Fecha | null | undefined, hoy: Fecha): boolean {
  if (hasta === undefined) return false;
  return hasta === null || hoy <= hasta;
}

/** Spec 010, R15c: el panel avisa en los 14 días anteriores al fin de la cortesía. */
export function avisarFinDeCortesia(hasta: Fecha | null | undefined, hoy: Fecha): boolean {
  if (!hasta) return false;
  const quedan = aDia(hasta) - aDia(hoy);
  return quedan >= 0 && quedan <= 14;
}

/** Spec 010, R3b: el plan de la cuenta es el mayor entre el pagado y el de cortesía. */
export function planEfectivo(pagado: Plan | null | undefined, cortesiaHasta: Fecha | null | undefined, hoy: Fecha): Plan {
  return planMayor(pagado ?? 'starter', cortesiaVigente(cortesiaHasta, hoy) ? 'advanced' : 'starter');
}

/** Spec 010, R7 y C12: base imponible e IVA de un precio con IVA incluido (céntimos). */
export function desgloseIva(totalConIva: number, tipo: number = IVA_ESPANA): { base: number; iva: number } {
  const base = Math.round((totalConIva * 100) / (100 + tipo));
  return { base, iva: totalConIva - base };
}
