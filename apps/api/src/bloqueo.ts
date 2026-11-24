// Spec 010, R10–R11: qué inmuebles siguen activos con el plan de la cuenta.
//
// El plan puede cambiar sin que la usuaria haga nada (fin de la cortesía, un
// webhook de Paddle), así que se recalcula al entrar en sus inmuebles y en el
// proceso diario, y se guarda en `inmueble.bloqueado`. Con eso, el panel, los
// cobros automáticos y el enlace del inquilino ya saben qué está bloqueado.
import {
  inmueblesActivos,
  LIMITES,
  puedeElegirInmueblesActivos,
  validarEleccion,
  type Cortesias,
  type Fecha,
  type Plan,
} from "@inquilinus/domain";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { ejecutarEnBloque } from "./bd/bloque.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { ErrorPeticion } from "./errores.ts";
import { describirError, type Registro } from "./registro.ts";
import { planDeCuenta } from "./planes.ts";

export interface EstadoInmuebles {
  plan: Plan;
  /** Ids de los inmuebles sin archivar, de más antiguo a más nuevo. */
  activos: string[];
  bloqueados: string[];
  /** R10c: tiene más inmuebles de los que admite el plan y aún no ha elegido con él. */
  puedeElegir: boolean;
}

/**
 * Recalcula los inmuebles activos y guarda el resultado. Tienen preferencia:
 * - con el mismo plan, los que ya estaban activos (los elegidos, si eligió);
 * - al subir de plan, los que ya estaban activos y después los más antiguos (R11);
 * - al bajar, los más antiguos, hasta que elija (R10). La elección anterior se vacía.
 */
export async function sincronizarInmuebles(
  bd: ConexionBd,
  usuarioId: string,
  cortesias: Cortesias,
  hoy: Fecha,
): Promise<EstadoInmuebles> {
  const [plan, inmuebles, [anterior]] = await Promise.all([
    planDeCuenta(bd, usuarioId, cortesias, hoy),
    bd
      .select({ id: t.inmueble.id, creadoEn: t.inmueble.creadoEn, bloqueado: t.inmueble.bloqueado })
      .from(t.inmueble)
      .where(and(eq(t.inmueble.usuarioId, usuarioId), eq(t.inmueble.archivado, false))),
    bd
      .select({ plan: t.eleccionInmuebles.plan, elegidoEn: t.eleccionInmuebles.elegidoEn })
      .from(t.eleccionInmuebles)
      .where(eq(t.eleccionInmuebles.usuarioId, usuarioId)),
  ]);
  const actuales = inmuebles.filter((i) => !i.bloqueado).map((i) => i.id);

  let preferencia: { elegidos?: string[]; previos?: string[] };
  let elegidoEn: Date | null = null;
  if (!anterior) {
    // Primera vez: hasta ahora no había nada bloqueado.
    await bd.insert(t.eleccionInmuebles).values({ usuarioId, plan }).onConflictDoNothing();
    preferencia = { previos: actuales };
  } else if (anterior.plan !== plan) {
    const sube = LIMITES[plan].inmueblesActivos > LIMITES[anterior.plan].inmueblesActivos;
    preferencia = sube ? { previos: actuales } : {};
    await bd
      .update(t.eleccionInmuebles)
      .set({ plan, elegidoEn: null })
      .where(eq(t.eleccionInmuebles.usuarioId, usuarioId));
  } else {
    elegidoEn = anterior.elegidoEn;
    preferencia = elegidoEn ? { elegidos: actuales } : { previos: actuales };
  }

  const { activos, bloqueados } = inmueblesActivos(
    plan,
    inmuebles.map((i) => ({ id: i.id, creadoEn: i.creadoEn.toISOString() })),
    preferencia,
  );
  const bloquear = new Set(bloqueados);
  const aBloquear = inmuebles.filter((i) => !i.bloqueado && bloquear.has(i.id)).map((i) => i.id);
  const aDesbloquear = inmuebles.filter((i) => i.bloqueado && !bloquear.has(i.id)).map((i) => i.id);
  if (aBloquear.length + aDesbloquear.length > 0) {
    await ejecutarEnBloque(bd, (db) => [
      ...(aBloquear.length > 0
        ? [db.update(t.inmueble).set({ bloqueado: true }).where(inArray(t.inmueble.id, aBloquear))]
        : []),
      ...(aDesbloquear.length > 0
        ? [db.update(t.inmueble).set({ bloqueado: false }).where(inArray(t.inmueble.id, aDesbloquear))]
        : []),
    ]);
  }
  return {
    plan,
    activos,
    bloqueados,
    puedeElegir: puedeElegirInmueblesActivos(plan, inmuebles.length, elegidoEn?.toISOString() ?? null),
  };
}

/** R10 y R10c: la usuaria elige qué inmuebles siguen activos, una sola vez con cada plan. */
export async function elegirInmueblesActivos(
  bd: ConexionBd,
  usuarioId: string,
  cortesias: Cortesias,
  ahora: { instante: Date; hoy: Fecha },
  elegidos: string[],
): Promise<EstadoInmuebles> {
  const estado = await sincronizarInmuebles(bd, usuarioId, cortesias, ahora.hoy);
  if (!estado.puedeElegir) throw new ErrorPeticion("ELECCION_NO_DISPONIBLE");
  validarEleccion(
    estado.plan,
    [...estado.activos, ...estado.bloqueados].map((id) => ({ id, creadoEn: "" })),
    elegidos,
  );
  // Se marca la elección solo si nadie la ha hecho antes (dos peticiones a la vez: gana una).
  const [marcada] = await bd
    .update(t.eleccionInmuebles)
    .set({ elegidoEn: ahora.instante })
    .where(
      and(
        eq(t.eleccionInmuebles.usuarioId, usuarioId),
        eq(t.eleccionInmuebles.plan, estado.plan),
        isNull(t.eleccionInmuebles.elegidoEn),
      ),
    )
    .returning({ id: t.eleccionInmuebles.id });
  if (!marcada) throw new ErrorPeticion("ELECCION_NO_DISPONIBLE");

  const suyos = and(eq(t.inmueble.usuarioId, usuarioId), eq(t.inmueble.archivado, false));
  await ejecutarEnBloque(bd, (db) => [
    db.update(t.inmueble).set({ bloqueado: false }).where(and(suyos, inArray(t.inmueble.id, elegidos))),
    db.update(t.inmueble).set({ bloqueado: true }).where(and(suyos, notInArray(t.inmueble.id, elegidos))),
  ]);
  return sincronizarInmuebles(bd, usuarioId, cortesias, ahora.hoy);
}

/** Proceso diario: recalcula los inmuebles de todas las cuentas antes de generar los cobros. */
export async function sincronizarTodas(
  bd: ConexionBd,
  cortesias: Cortesias,
  hoy: Fecha,
  registro: Registro,
): Promise<void> {
  const usuarios = await bd
    .selectDistinct({ id: t.inmueble.usuarioId })
    .from(t.inmueble)
    .where(eq(t.inmueble.archivado, false));
  for (const { id } of usuarios) {
    try {
      await sincronizarInmuebles(bd, id, cortesias, hoy);
    } catch (error) {
      registro.aviso("bloqueo_fallido", describirError(error));
    }
  }
}
