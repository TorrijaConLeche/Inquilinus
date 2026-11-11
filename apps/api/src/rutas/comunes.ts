// Utilidades compartidas por las rutas con sesión.
import type { RespuestaError } from "@inquilinus/contracts";
import type { Context } from "hono";
import { z } from "zod";
import { ErrorPeticion } from "../inmuebles.ts";

export type EntornoSesion = { Variables: { idPeticion: string; usuarioId: string } };

const Uuid = z.uuid();

/** Lee el cuerpo y lo valida; si no encaja, 400 con DATOS_INVALIDOS. */
export async function leer<T extends z.ZodType>(c: Context, esquema: T): Promise<z.infer<T>> {
  const datos = esquema.safeParse(await c.req.json().catch(() => undefined));
  if (!datos.success) throw new ErrorPeticion("DATOS_INVALIDOS");
  return datos.data;
}

/** Lo ajeno y lo inexistente responden igual, para no revelar nada de otras cuentas. */
export const noEncontrado = (c: Context) => c.json<RespuestaError>({ error: "no-encontrado" }, 404);

/** Ids de la URL: si alguno no tiene forma de UUID, el recurso no existe (null). */
export function ids(c: Context, ...nombres: string[]): string[] | null {
  const valores = nombres.map((n) => c.req.param(n) ?? "");
  return valores.every((v) => Uuid.safeParse(v).success) ? valores : null;
}
