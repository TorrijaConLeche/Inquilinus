import { ErrorValidacion } from './errores.ts';
import { aDia, type Fecha } from './fechas.ts';

export interface Ocupacion {
  habitacionId: string;
  inquilinoId: string;
  /** Primer día en la habitación (inclusive). */
  entrada: Fecha;
  /** Último día en la habitación (inclusive). Sin valor: sigue viviendo allí. */
  salida?: Fecha | null;
}

/** Días en que un inquilino está realmente presente en una habitación. */
export interface Tramo {
  habitacionId: string;
  inquilinoId: string;
  /** Día de entrada original, usado para ordenar y desempatar. */
  entrada: number;
  desde: number;
  /** Último día presente (inclusive). `Infinity` si no hay salida. */
  hasta: number;
}

/**
 * Convierte ocupaciones en tramos de presencia aplicando:
 * - entrada y salida inclusive (spec 001, R3);
 * - relevo en la misma habitación: el día frontera es de quien entra (R4);
 * - validación de solapes en una misma habitación (R8).
 */
export function calcularTramos(ocupaciones: readonly Ocupacion[]): Tramo[] {
  const base = ocupaciones.map((o) => {
    const entrada = aDia(o.entrada);
    const salida = o.salida ? aDia(o.salida) : Infinity;
    if (salida < entrada) {
      throw new ErrorValidacion(
        'OCUPACION_INVALIDA',
        `La salida (${o.salida}) es anterior a la entrada (${o.entrada})`,
      );
    }
    return { habitacionId: o.habitacionId, inquilinoId: o.inquilinoId, entrada, salida };
  });

  const tramos: Tramo[] = [];
  base.forEach((o, i) => {
    const hayRelevo =
      o.salida !== Infinity &&
      base.some((otra, j) => j !== i && otra.habitacionId === o.habitacionId && otra.entrada === o.salida);
    const hasta = hayRelevo ? o.salida - 1 : o.salida;
    if (hasta >= o.entrada) {
      tramos.push({
        habitacionId: o.habitacionId,
        inquilinoId: o.inquilinoId,
        entrada: o.entrada,
        desde: o.entrada,
        hasta,
      });
    }
  });

  const porHabitacion = [...tramos].sort((a, b) =>
    a.habitacionId === b.habitacionId ? a.desde - b.desde : a.habitacionId < b.habitacionId ? -1 : 1,
  );
  for (let i = 1; i < porHabitacion.length; i++) {
    const prev = porHabitacion[i - 1]!;
    const act = porHabitacion[i]!;
    if (prev.habitacionId === act.habitacionId && act.desde <= prev.hasta) {
      throw new ErrorValidacion(
        'SOLAPE_OCUPACIONES',
        `Ocupaciones solapadas en la habitación ${act.habitacionId}`,
      );
    }
  }

  return tramos;
}

/** Inquilinos presentes en el inmueble cada día del rango [inicio, fin]. */
export function presentesPorDia(tramos: readonly Tramo[], inicio: number, fin: number): Set<string>[] {
  const dias: Set<string>[] = [];
  for (let d = inicio; d <= fin; d++) {
    const presentes = new Set<string>();
    for (const t of tramos) if (t.desde <= d && d <= t.hasta) presentes.add(t.inquilinoId);
    dias.push(presentes);
  }
  return dias;
}

/** Orden estable de inquilinos: por primera entrada y después por id (spec 001, R6). */
export function ordenInquilinos(tramos: readonly Tramo[]): string[] {
  const primera = new Map<string, number>();
  for (const t of tramos) {
    const actual = primera.get(t.inquilinoId);
    if (actual === undefined || t.entrada < actual) primera.set(t.inquilinoId, t.entrada);
  }
  return [...primera.keys()].sort((a, b) => {
    const diff = primera.get(a)! - primera.get(b)!;
    return diff !== 0 ? diff : a < b ? -1 : a > b ? 1 : 0;
  });
}
