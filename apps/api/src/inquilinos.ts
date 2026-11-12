// Inquilinos, ocupaciones y tipos de gasto (spec 007).
// Las funciones reciben un inmueble que ya se ha comprobado que es del usuario
// (las rutas lo hacen con `esSuyo`); aquí todo se filtra además por ese inmueble.
import {
  COLORES_GASTO,
  type CambioHabitacion,
  type ColorGasto,
  type EdicionOcupacion,
  type EdicionTipoGasto,
  type Inquilino,
  type NuevaOcupacion,
  type NuevoInquilino,
  type NuevoTipoGasto,
  type TipoGasto,
} from "@inquilinus/contracts";
import { aDia, desdeDia, validarInquilino, validarNombre, validarOcupaciones } from "@inquilinus/domain";
import { and, asc, eq, ne } from "drizzle-orm";
import { ejecutarEnBloque } from "./bd/bloque.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { documentosYFianzas, type DocumentosYFianzas } from "./documentos.ts";
import { ErrorPeticion } from "./inmuebles.ts";

// --- Inquilinos -------------------------------------------------------------

type FilaOcupacion = typeof t.ocupacion.$inferSelect;

function aInquilino(
  fila: typeof t.inquilino.$inferSelect,
  ocupaciones: FilaOcupacion[],
  { documentos, fianzas }: DocumentosYFianzas,
): Inquilino {
  return {
    id: fila.id,
    nombre: fila.nombre,
    anonimizado: fila.anonimizado,
    ocupaciones: ocupaciones
      .filter((o) => o.inquilinoId === fila.id)
      .sort((a, b) => (a.entrada < b.entrada ? -1 : a.entrada > b.entrada ? 1 : 0))
      .map((o) => ({ id: o.id, habitacionId: o.habitacionId, entrada: o.entrada, salida: o.salida })),
    documentos: documentos.get(fila.id) ?? [],
    fianza: fianzas.get(fila.id) ?? null,
  };
}

export async function listarInquilinos(bd: ConexionBd, inmuebleId: string): Promise<Inquilino[]> {
  const [inquilinos, ocupaciones] = await Promise.all([
    bd.select().from(t.inquilino).where(eq(t.inquilino.inmuebleId, inmuebleId)).orderBy(asc(t.inquilino.creadoEn)),
    bd.select().from(t.ocupacion).where(eq(t.ocupacion.inmuebleId, inmuebleId)),
  ]);
  const extras = await documentosYFianzas(
    bd,
    inquilinos.map((q) => q.id),
  );
  return inquilinos.map((q) => aInquilino(q, ocupaciones, extras));
}

/** El inquilino con sus estancias, si es de ese inmueble. */
export async function verInquilino(bd: ConexionBd, inmuebleId: string, inquilinoId: string): Promise<Inquilino | null> {
  const [fila] = await bd
    .select()
    .from(t.inquilino)
    .where(and(eq(t.inquilino.id, inquilinoId), eq(t.inquilino.inmuebleId, inmuebleId)));
  if (!fila) return null;
  const [ocupaciones, extras] = await Promise.all([
    bd.select().from(t.ocupacion).where(eq(t.ocupacion.inquilinoId, inquilinoId)),
    documentosYFianzas(bd, [inquilinoId]),
  ]);
  return aInquilino(fila, ocupaciones, extras);

}

/**
 * R7: una estancia válida en una habitación de este inmueble, sin solaparse
 * con las demás de esa habitación (spec 001, R8; el día de relevo no cuenta).
 * `excluir` es la propia ocupación cuando se edita.
 */
async function validarEstancia(
  bd: ConexionBd,
  inmuebleId: string,
  estancia: { habitacionId: string; inquilinoId: string; entrada: string; salida: string | null },
  excluir?: string,
): Promise<void> {
  const [habitacion] = await bd
    .select({ archivada: t.habitacion.archivada })
    .from(t.habitacion)
    .where(and(eq(t.habitacion.id, estancia.habitacionId), eq(t.habitacion.inmuebleId, inmuebleId)));
  if (!habitacion) throw new ErrorPeticion("HABITACION_DESCONOCIDA");
  if (habitacion.archivada) throw new ErrorPeticion("HABITACION_ARCHIVADA");

  const otras = await bd
    .select()
    .from(t.ocupacion)
    .where(
      and(
        eq(t.ocupacion.habitacionId, estancia.habitacionId),
        ...(excluir ? [ne(t.ocupacion.id, excluir)] : []),
      ),
    );
  // Lanza FECHA_INVALIDA, OCUPACION_INVALIDA (salida antes de entrada) o SOLAPE_OCUPACIONES.
  validarOcupaciones([...otras, estancia]);
}

/** R6 y R7: alta del inquilino, con su primera estancia si se indica (todo o nada). Devuelve el id. */
export async function crearInquilino(bd: ConexionBd, inmuebleId: string, nuevo: NuevoInquilino): Promise<string> {
  const { nombre } = validarInquilino({ nombre: nuevo.nombre });
  const id = crypto.randomUUID();
  const ocupacion = nuevo.ocupacion && {
    inmuebleId,
    inquilinoId: id,
    habitacionId: nuevo.ocupacion.habitacionId,
    entrada: nuevo.ocupacion.entrada,
    salida: nuevo.ocupacion.salida ?? null,
  };
  if (ocupacion) await validarEstancia(bd, inmuebleId, ocupacion);
  await ejecutarEnBloque(bd, (db) => [
    db.insert(t.inquilino).values({ id, inmuebleId, nombre }),
    ...(ocupacion ? [db.insert(t.ocupacion).values(ocupacion)] : []),
  ]);
  return id;
}

export async function renombrarInquilino(
  bd: ConexionBd,
  inmuebleId: string,
  inquilinoId: string,
  nombre: string,
): Promise<boolean> {
  const { nombre: limpio } = validarInquilino({ nombre });
  const cambiados = await bd
    .update(t.inquilino)
    .set({ nombre: limpio })
    .where(and(eq(t.inquilino.id, inquilinoId), eq(t.inquilino.inmuebleId, inmuebleId)))
    .returning({ id: t.inquilino.id });
  return cambiados.length > 0;
}

// --- Ocupaciones ------------------------------------------------------------

/** R7: nueva estancia del inquilino. Devuelve false si el inquilino no es de este inmueble. */
export async function crearOcupacion(
  bd: ConexionBd,
  inmuebleId: string,
  inquilinoId: string,
  nueva: NuevaOcupacion,
): Promise<boolean> {
  if (!(await verInquilino(bd, inmuebleId, inquilinoId))) return false;
  const estancia = {
    inmuebleId,
    inquilinoId,
    habitacionId: nueva.habitacionId,
    entrada: nueva.entrada,
    salida: nueva.salida ?? null,
  };
  await validarEstancia(bd, inmuebleId, estancia);
  await bd.insert(t.ocupacion).values(estancia);
  return true;
}

/** R9 y correcciones: cambia entrada o salida y vuelve a validar. Devuelve el id del inquilino, o null. */
export async function editarOcupacion(
  bd: ConexionBd,
  inmuebleId: string,
  ocupacionId: string,
  edicion: EdicionOcupacion,
): Promise<string | null> {
  const [actual] = await bd
    .select()
    .from(t.ocupacion)
    .where(and(eq(t.ocupacion.id, ocupacionId), eq(t.ocupacion.inmuebleId, inmuebleId)));
  if (!actual) return null;
  const nueva = {
    habitacionId: actual.habitacionId,
    inquilinoId: actual.inquilinoId,
    entrada: edicion.entrada ?? actual.entrada,
    salida: edicion.salida === undefined ? actual.salida : edicion.salida,
  };
  await validarEstancia(bd, inmuebleId, nueva, ocupacionId);
  await bd
    .update(t.ocupacion)
    .set({ entrada: nueva.entrada, salida: nueva.salida })
    .where(eq(t.ocupacion.id, ocupacionId));
  return actual.inquilinoId;
}

/**
 * R8: cambiar de habitación es cerrar la estancia abierta el día anterior a
 * `fecha` y abrir otra en la habitación nueva desde `fecha`, todo o nada.
 */
export async function cambiarHabitacion(
  bd: ConexionBd,
  inmuebleId: string,
  inquilinoId: string,
  cambio: CambioHabitacion,
): Promise<boolean> {
  const inquilino = await verInquilino(bd, inmuebleId, inquilinoId);
  if (!inquilino) return false;
  const abierta = inquilino.ocupaciones.find((o) => o.salida === null);
  if (!abierta) throw new ErrorPeticion("SIN_ESTANCIA_ABIERTA");
  if (abierta.habitacionId === cambio.habitacionId) throw new ErrorPeticion("MISMA_HABITACION");

  const diaAnterior = desdeDia(aDia(cambio.fecha) - 1);
  if (diaAnterior < abierta.entrada) throw new ErrorPeticion("CAMBIO_ANTES_DE_LA_ENTRADA");

  const nueva = { inmuebleId, inquilinoId, habitacionId: cambio.habitacionId, entrada: cambio.fecha, salida: null };
  await validarEstancia(bd, inmuebleId, nueva);
  await ejecutarEnBloque(bd, (db) => [
    db.update(t.ocupacion).set({ salida: diaAnterior }).where(eq(t.ocupacion.id, abierta.id)),
    db.insert(t.ocupacion).values(nueva),
  ]);
  return true;
}

// --- Tipos de gasto ---------------------------------------------------------

function aTipoGasto(fila: typeof t.tipoGasto.$inferSelect): TipoGasto {
  return { id: fila.id, nombre: fila.nombre, color: fila.color as ColorGasto, archivado: fila.archivado };
}

export async function listarTiposGasto(bd: ConexionBd, inmuebleId: string): Promise<TipoGasto[]> {
  const filas = await bd
    .select()
    .from(t.tipoGasto)
    .where(eq(t.tipoGasto.inmuebleId, inmuebleId))
    .orderBy(asc(t.tipoGasto.creadoEn));
  return filas.map(aTipoGasto);
}

/** Spec 006, R7: sin color elegido, el primero de la paleta que no use otro tipo del inmueble. */
function primerColorLibre(usados: string[]): ColorGasto {
  return COLORES_GASTO.find((c) => !usados.includes(c)) ?? COLORES_GASTO[usados.length % COLORES_GASTO.length]!;
}

export async function crearTipoGasto(bd: ConexionBd, inmuebleId: string, nuevo: NuevoTipoGasto): Promise<TipoGasto> {
  const nombre = validarNombre(nuevo.nombre, "del tipo de gasto");
  const activos = (await listarTiposGasto(bd, inmuebleId)).filter((tg) => !tg.archivado);
  const color = nuevo.color ?? primerColorLibre(activos.map((tg) => tg.color));
  const [fila] = await bd.insert(t.tipoGasto).values({ inmuebleId, nombre, color }).returning();
  return aTipoGasto(fila!);
}

/** R10: renombrar o cambiar de color. Devuelve null si no es de este inmueble. */
export async function editarTipoGasto(
  bd: ConexionBd,
  inmuebleId: string,
  tipoGastoId: string,
  edicion: EdicionTipoGasto,
): Promise<TipoGasto | null> {
  const cambios: Partial<typeof t.tipoGasto.$inferInsert> = {};
  if (edicion.nombre !== undefined) cambios.nombre = validarNombre(edicion.nombre, "del tipo de gasto");
  if (edicion.color !== undefined) cambios.color = edicion.color;
  const filtro = and(eq(t.tipoGasto.id, tipoGastoId), eq(t.tipoGasto.inmuebleId, inmuebleId));
  const [fila] =
    Object.keys(cambios).length > 0
      ? await bd.update(t.tipoGasto).set(cambios).where(filtro).returning()
      : await bd.select().from(t.tipoGasto).where(filtro);
  return fila ? aTipoGasto(fila) : null;
}
