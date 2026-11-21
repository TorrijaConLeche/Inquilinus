// Enlace del inquilino (spec 004, R1–R3b). El token es aleatorio de 256 bits
// y solo se guarda su hash: se ve una vez, al generarlo o regenerarlo (R2c).
// Las funciones reciben un inmueble que ya se ha comprobado que es del usuario.
import type { EnlaceGenerado, EnlaceInquilino } from "@inquilinus/contracts";
import { caducidadEnlace, enlaceDisponible } from "@inquilinus/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { registrar } from "./actividad.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { ErrorPeticion } from "./errores.ts";
import { hoyEnMadrid } from "./fechas.ts";

type FilaEnlace = typeof t.enlaceInquilino.$inferSelect;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** R3b: la última salida del inquilino, o null si alguna estancia sigue abierta (o no tiene). */
function ultimaSalida(estancias: { salida: string | null }[]): string | null {
  if (estancias.length === 0 || estancias.some((e) => e.salida === null)) return null;
  return estancias.map((e) => e.salida!).sort().at(-1)!;
}

export function aEnlace(fila: FilaEnlace, estancias: { salida: string | null }[], hoy = hoyEnMadrid()): EnlaceInquilino {
  const salida = ultimaSalida(estancias);
  return {
    creadoEn: fila.creadoEn.toISOString(),
    permiteDescarga: fila.permiteDescarga,
    caducaEl: caducidadEnlace(salida),
    disponible: enlaceDisponible(hoy, { salida }),
  };
}

/** Los enlaces vigentes (sin revocar) de unos inquilinos, por inquilino. */
export async function enlacesVigentes(bd: ConexionBd, inquilinoIds: string[]): Promise<Map<string, FilaEnlace>> {
  if (inquilinoIds.length === 0) return new Map();
  const filas = await bd
    .select()
    .from(t.enlaceInquilino)
    .where(and(inArray(t.enlaceInquilino.inquilinoId, inquilinoIds), isNull(t.enlaceInquilino.revocadoEn)));
  return new Map(filas.map((f) => [f.inquilinoId, f]));
}

/** El inquilino del inmueble con sus estancias; null si no es de él. Uno borrado no puede tener enlace (R2e). */
async function inquilinoDe(bd: ConexionBd, inmuebleId: string, inquilinoId: string) {
  const [inquilino] = await bd
    .select({ anonimizado: t.inquilino.anonimizado })
    .from(t.inquilino)
    .where(and(eq(t.inquilino.id, inquilinoId), eq(t.inquilino.inmuebleId, inmuebleId)));
  if (!inquilino) return null;
  if (inquilino.anonimizado) throw new ErrorPeticion("INQUILINO_ANONIMIZADO");
  const estancias = await bd.select({ salida: t.ocupacion.salida }).from(t.ocupacion).where(eq(t.ocupacion.inquilinoId, inquilinoId));
  return { estancias };
}

async function crear(bd: ConexionBd, inquilinoId: string, permiteDescarga: boolean) {
  // R1: 256 bits aleatorios; se guarda solo el hash.
  const token = randomBytes(32).toString("base64url");
  const [fila] = await bd
    .insert(t.enlaceInquilino)
    .values({ inquilinoId, tokenHash: hashToken(token), permiteDescarga })
    .returning();
  return { token, fila: fila! };
}

/** R1 y R2: genera el enlace del inquilino si no tiene uno vigente. Null si no es de este inmueble. */
export async function generarEnlace(bd: ConexionBd, inmuebleId: string, inquilinoId: string): Promise<EnlaceGenerado | null> {
  const inquilino = await inquilinoDe(bd, inmuebleId, inquilinoId);
  if (!inquilino) return null;
  if ((await enlacesVigentes(bd, [inquilinoId])).has(inquilinoId)) throw new ErrorPeticion("ENLACE_EXISTENTE");
  const { token, fila } = await crear(bd, inquilinoId, true);
  await registrar(bd, { inmuebleId, tipo: "enlace_generado", inquilinoId, detalle: {} });
  return { token, enlace: aEnlace(fila, inquilino.estancias) };
}

/** R2: revoca el vigente y genera otro, con el mismo permiso de descarga. Null si no es de este inmueble. */
export async function regenerarEnlace(bd: ConexionBd, inmuebleId: string, inquilinoId: string): Promise<EnlaceGenerado | null> {
  const inquilino = await inquilinoDe(bd, inmuebleId, inquilinoId);
  if (!inquilino) return null;
  const actual = (await enlacesVigentes(bd, [inquilinoId])).get(inquilinoId);
  if (actual) {
    await bd.update(t.enlaceInquilino).set({ revocadoEn: new Date(), actualizadoEn: new Date() }).where(eq(t.enlaceInquilino.id, actual.id));
  }
  const { token, fila } = await crear(bd, inquilinoId, actual?.permiteDescarga ?? true);
  await registrar(bd, { inmuebleId, tipo: actual ? "enlace_regenerado" : "enlace_generado", inquilinoId, detalle: {} });
  return { token, enlace: aEnlace(fila, inquilino.estancias) };
}

/** R2: revoca el vigente. False si no es de este inmueble o no tiene. */
export async function revocarEnlace(bd: ConexionBd, inmuebleId: string, inquilinoId: string): Promise<boolean> {
  if (!(await inquilinoDe(bd, inmuebleId, inquilinoId))) return false;
  const revocados = await bd
    .update(t.enlaceInquilino)
    .set({ revocadoEn: new Date(), actualizadoEn: new Date() })
    .where(and(eq(t.enlaceInquilino.inquilinoId, inquilinoId), isNull(t.enlaceInquilino.revocadoEn)))
    .returning({ id: t.enlaceInquilino.id });
  if (revocados.length === 0) return false;
  await registrar(bd, { inmuebleId, tipo: "enlace_revocado", inquilinoId, detalle: {} });
  return true;
}

/** R2b: habilita o deshabilita la descarga. Null si no es de este inmueble o no tiene enlace. */
export async function cambiarDescarga(
  bd: ConexionBd,
  inmuebleId: string,
  inquilinoId: string,
  permiteDescarga: boolean,
): Promise<EnlaceInquilino | null> {
  const inquilino = await inquilinoDe(bd, inmuebleId, inquilinoId);
  if (!inquilino) return null;
  const actual = (await enlacesVigentes(bd, [inquilinoId])).get(inquilinoId);
  if (!actual) return null;
  if (actual.permiteDescarga === permiteDescarga) return aEnlace(actual, inquilino.estancias);
  const [fila] = await bd
    .update(t.enlaceInquilino)
    .set({ permiteDescarga, actualizadoEn: new Date() })
    .where(eq(t.enlaceInquilino.id, actual.id))
    .returning();
  await registrar(bd, {
    inmuebleId,
    tipo: permiteDescarga ? "descarga_habilitada" : "descarga_deshabilitada",
    inquilinoId,
    detalle: {},
  });
  return aEnlace(fila!, inquilino.estancias);
}

/**
 * R1, R3 y R4: el enlace de un token, si funciona hoy (existe, no está
 * revocado ni caducado). Null en cualquier otro caso, sin decir por qué. Lo
 * usará la vista pública del inquilino (tarea 6.5).
 */
export async function enlacePorToken(
  bd: ConexionBd,
  token: string,
  hoy: string,
): Promise<{ inquilinoId: string; inmuebleId: string; permiteDescarga: boolean } | null> {
  // C9: un token mal formado ni se busca.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [fila] = await bd
    .select({
      inquilinoId: t.enlaceInquilino.inquilinoId,
      permiteDescarga: t.enlaceInquilino.permiteDescarga,
      revocadoEn: t.enlaceInquilino.revocadoEn,
      inmuebleId: t.inquilino.inmuebleId,
    })
    .from(t.enlaceInquilino)
    .innerJoin(t.inquilino, eq(t.inquilino.id, t.enlaceInquilino.inquilinoId))
    .where(eq(t.enlaceInquilino.tokenHash, hashToken(token)));
  if (!fila || fila.revocadoEn) return null;
  const estancias = await bd.select({ salida: t.ocupacion.salida }).from(t.ocupacion).where(eq(t.ocupacion.inquilinoId, fila.inquilinoId));
  if (estancias.length === 0 || !enlaceDisponible(hoy, { salida: ultimaSalida(estancias) })) return null;
  return { inquilinoId: fila.inquilinoId, inmuebleId: fila.inmuebleId, permiteDescarga: fila.permiteDescarga };
}
