// Spec 010: plan de cada cuenta y contador mensual de facturas leídas con IA.
import {
  lecturasIaDisponibles,
  planEfectivo,
  type Cortesias,
  type Fecha,
  type Mes,
  type Plan,
} from "@inquilinus/domain";
import { and, count, eq, sql } from "drizzle-orm";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";

/**
 * Estados de Paddle con el plan pagado en vigor. Al cancelar, Paddle mantiene
 * `active` hasta el fin del periodo (R8); durante los reintentos de un pago
 * fallido manda `past_due` y el plan sigue activo (R9).
 */
const ESTADOS_VIGENTES = new Set(["active", "trialing", "past_due"]);

/** R3b y R15: el mayor entre el plan pagado vigente y el Advanced de cortesía. */
export async function planDeCuenta(
  bd: ConexionBd,
  usuarioId: string,
  cortesias: Cortesias,
  hoy: Fecha,
): Promise<Plan> {
  const [fila] = await bd
    .select({ email: t.usuario.email, plan: t.suscripcion.plan, estado: t.suscripcion.estado })
    .from(t.usuario)
    .leftJoin(t.suscripcion, eq(t.suscripcion.usuarioId, t.usuario.id))
    .where(eq(t.usuario.id, usuarioId));
  if (!fila) return "starter";
  const pagado = fila.plan && fila.estado && ESTADOS_VIGENTES.has(fila.estado) ? fila.plan : null;
  return planEfectivo(pagado, cortesias.get(fila.email.trim().toLowerCase()), hoy);
}

/** R1: los inmuebles que cuentan para el límite del plan (todos menos los archivados). */
export async function inmueblesSinArchivar(bd: ConexionBd, usuarioId: string): Promise<number> {
  const [fila] = await bd
    .select({ n: count() })
    .from(t.inmueble)
    .where(and(eq(t.inmueble.usuarioId, usuarioId), eq(t.inmueble.archivado, false)));
  return fila?.n ?? 0;
}

/** Lecturas con IA de un usuario en un mes (R2 y R3). */
export interface CupoIa {
  /** Aparta hasta `cantidad` lecturas y devuelve cuántas quedan concedidas. */
  reservar(cantidad: number): Promise<number>;
  /** Devuelve lecturas apartadas que al final no se hicieron (R2: una lectura fallida no cuenta). */
  devolver(cantidad: number): Promise<void>;
}

export function cupoIa(bd: ConexionBd, usuarioId: string, plan: Plan, mes: Mes): CupoIa {
  const delMes = and(eq(t.usoIa.usuarioId, usuarioId), eq(t.usoIa.mes, mes));
  const devolver = async (cantidad: number) => {
    if (cantidad <= 0) return;
    await bd
      .update(t.usoIa)
      .set({ facturasLeidas: sql`greatest(0, ${t.usoIa.facturasLeidas} - ${cantidad})` })
      .where(delMes);
  };
  return {
    devolver,
    async reservar(cantidad) {
      if (cantidad <= 0) return 0;
      // Se suma de una vez y se devuelve lo que sobra: con dos lotes a la vez,
      // el contador nunca pasa del límite (como mucho, uno recibe menos).
      const [fila] = await bd
        .insert(t.usoIa)
        .values({ usuarioId, mes, facturasLeidas: cantidad })
        .onConflictDoUpdate({
          target: [t.usoIa.usuarioId, t.usoIa.mes],
          set: { facturasLeidas: sql`${t.usoIa.facturasLeidas} + ${cantidad}`, actualizadoEn: new Date() },
        })
        .returning({ total: t.usoIa.facturasLeidas });
      const antes = fila!.total - cantidad;
      const concedidas = Math.min(cantidad, lecturasIaDisponibles(plan, antes));
      await devolver(cantidad - concedidas);
      return concedidas;
    },
  };
}
