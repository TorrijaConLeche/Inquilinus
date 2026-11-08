// Consultas de la cuenta que necesita la web (spec 008).
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as esquema from "./bd/esquema.ts";

export type MetodoDobleFactor = "app" | "email";

/** Método de doble factor activo (R7): app si hay un secreto confirmado; si no, email. */
export async function metodoDobleFactor(
  bd: PgDatabase<PgQueryResultHKT, typeof esquema>,
  usuario: { id: string; dobleFactorActivo: boolean },
): Promise<MetodoDobleFactor | null> {
  if (!usuario.dobleFactorActivo) return null;
  const [fila] = await bd
    .select({ id: esquema.dobleFactor.id })
    .from(esquema.dobleFactor)
    .where(and(eq(esquema.dobleFactor.usuarioId, usuario.id), eq(esquema.dobleFactor.verificado, true)))
    .limit(1);
  return fila ? "app" : "email";
}
