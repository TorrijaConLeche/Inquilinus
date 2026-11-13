// Inmuebles, habitaciones e historial de precios (spec 007).
// Todas las funciones reciben el id del usuario y solo ven lo suyo (R13 de la
// spec 008): lo que no es suyo se trata igual que lo que no existe.
import type {
  AltaInmueble,
  CambioPrecio,
  EdicionHabitacion,
  EdicionInmueble,
  Habitacion,
  Inmueble,
  NuevaHabitacion,
  ResumenInmueble,
} from "@inquilinus/contracts";
import {
  ErrorValidacion,
  normalizarAltaInmueble,
  precioVigente,
  validarDiaCobro,
  validarNombre,
} from "@inquilinus/domain";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { archivarHabitacion, archivarInmueble, borrarHabitacion } from "./archivo.ts";
import { ejecutarEnBloque } from "./bd/bloque.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";

import { ErrorPeticion } from "./errores.ts";

export { ErrorPeticion };

// --- Lectura ----------------------------------------------------------------

export async function listarInmuebles(
  bd: ConexionBd,
  usuarioId: string,
  opciones: { archivados: boolean },
): Promise<ResumenInmueble[]> {
  const filtro = opciones.archivados
    ? eq(t.inmueble.usuarioId, usuarioId)
    : and(eq(t.inmueble.usuarioId, usuarioId), eq(t.inmueble.archivado, false));
  const inmuebles = await bd.select().from(t.inmueble).where(filtro).orderBy(asc(t.inmueble.creadoEn));
  if (inmuebles.length === 0) return [];

  const cuentas = await bd
    .select({ inmuebleId: t.habitacion.inmuebleId, n: count() })
    .from(t.habitacion)
    .where(and(inArray(t.habitacion.inmuebleId, inmuebles.map((i) => i.id)), eq(t.habitacion.archivada, false)))
    .groupBy(t.habitacion.inmuebleId);
  const porInmueble = new Map(cuentas.map((c) => [c.inmuebleId, c.n]));

  return inmuebles.map((i) => ({
    id: i.id,
    nombre: i.nombre,
    direccion: i.direccion,
    modalidad: i.modalidad,
    archivado: i.archivado,
    bloqueado: i.bloqueado,
    numeroHabitaciones: porInmueble.get(i.id) ?? 0,
  }));
}

/** Detalle del inmueble con sus habitaciones e historial de precios, o null si no es suyo. */
export async function verInmueble(
  bd: ConexionBd,
  usuarioId: string,
  inmuebleId: string,
  mesActual: string,
): Promise<Inmueble | null> {
  const [inmueble] = await bd
    .select()
    .from(t.inmueble)
    .where(and(eq(t.inmueble.id, inmuebleId), eq(t.inmueble.usuarioId, usuarioId)));
  if (!inmueble) return null;

  const habitaciones = await bd
    .select()
    .from(t.habitacion)
    .where(eq(t.habitacion.inmuebleId, inmuebleId))
    // Las del alta se crean a la vez (mismo instante): se desempata por nombre.
    .orderBy(asc(t.habitacion.creadoEn), asc(t.habitacion.nombre));
  const idsHabitaciones = habitaciones.map((h) => h.id);
  const [precios, conEstancias] =
    idsHabitaciones.length === 0
      ? [[], []]
      : await Promise.all([
          bd
            .select()
            .from(t.precioHabitacion)
            .where(inArray(t.precioHabitacion.habitacionId, idsHabitaciones))
            .orderBy(asc(t.precioHabitacion.desdeMes)),
          bd
            .selectDistinct({ id: t.ocupacion.habitacionId })
            .from(t.ocupacion)
            .where(inArray(t.ocupacion.habitacionId, idsHabitaciones)),
        ]);
  const habitadas = new Set(conEstancias.map((f) => f.id));

  return {
    id: inmueble.id,
    nombre: inmueble.nombre,
    direccion: inmueble.direccion,
    modalidad: inmueble.modalidad,
    mesesParciales: inmueble.mesesParciales,
    diaCobro: inmueble.diaCobro,
    archivado: inmueble.archivado,
    bloqueado: inmueble.bloqueado,
    habitaciones: habitaciones.map((h): Habitacion => {
      const historialPrecios = precios
        .filter((p) => p.habitacionId === h.id)
        .map((p) => ({ desdeMes: p.desdeMes, precioMensual: p.precioMensual }));
      return {
        id: h.id,
        nombre: h.nombre,
        archivada: h.archivada,
        conEstancias: habitadas.has(h.id),
        precioActual: precioDelMes(historialPrecios, mesActual),
        historialPrecios,
      };
    }),
  };
}

/** Precio vigente en un mes (R4), o null si la habitación aún no tiene precio ese mes. */
function precioDelMes(historial: { desdeMes: string; precioMensual: number }[], mes: string): number | null {
  try {
    return precioVigente(historial, mes);
  } catch (error) {
    if (error instanceof ErrorValidacion && error.codigo === "SIN_PRECIO") return null;
    throw error;
  }
}

// --- Escritura --------------------------------------------------------------

/** R3: el precio inicial aplica desde el mes del alta o desde uno anterior, nunca posterior. */
function mesInicial(desdeMes: string | undefined, mesActual: string): string {
  const mes = desdeMes ?? mesActual;
  if (mes > mesActual) throw new ErrorPeticion("PRECIO_INICIAL_FUTURO");
  return mes;
}

/** R1: alta del inmueble con sus habitaciones y su precio inicial, todo o nada. Devuelve el id. */
export async function crearInmueble(
  bd: ConexionBd,
  usuarioId: string,
  alta: AltaInmueble,
  mesActual: string,
): Promise<string> {
  const datos = normalizarAltaInmueble({
    nombre: alta.nombre,
    direccion: alta.direccion ?? null,
    modalidad: alta.modalidad,
    ...(alta.mesesParciales !== undefined && { mesesParciales: alta.mesesParciales }),
    ...(alta.diaCobro !== undefined && { diaCobro: alta.diaCobro }),
    habitaciones: alta.habitaciones,
  });
  const meses = alta.habitaciones.map((h) => mesInicial(h.desdeMes, mesActual));

  const inmuebleId = crypto.randomUUID();
  const habitaciones = datos.habitaciones.map((h, i) => ({ id: crypto.randomUUID(), ...h, desdeMes: meses[i]! }));
  await ejecutarEnBloque(bd, (db) => [
    db.insert(t.inmueble).values({
      id: inmuebleId,
      usuarioId,
      nombre: datos.nombre,
      direccion: datos.direccion,
      modalidad: datos.modalidad,
      mesesParciales: datos.mesesParciales,
      diaCobro: datos.diaCobro,
    }),
    db.insert(t.habitacion).values(habitaciones.map((h) => ({ id: h.id, inmuebleId, nombre: h.nombre }))),
    db.insert(t.precioHabitacion).values(
      habitaciones.map((h) => ({ habitacionId: h.id, desdeMes: h.desdeMes, precioMensual: h.precioMensual })),
    ),
  ]);
  return inmuebleId;
}

/** ¿Es suyo el inmueble? Lo que no es suyo se trata como si no existiera. */
export async function esSuyo(bd: ConexionBd, usuarioId: string, inmuebleId: string): Promise<boolean> {
  const [fila] = await bd
    .select({ id: t.inmueble.id })
    .from(t.inmueble)
    .where(and(eq(t.inmueble.id, inmuebleId), eq(t.inmueble.usuarioId, usuarioId)));
  return Boolean(fila);
}

/** ¿Es suya la habitación y está en ese inmueble? */
async function habitacionSuya(
  bd: ConexionBd,
  usuarioId: string,
  inmuebleId: string,
  habitacionId: string,
): Promise<boolean> {
  const [fila] = await bd
    .select({ id: t.habitacion.id })
    .from(t.habitacion)
    .innerJoin(t.inmueble, eq(t.inmueble.id, t.habitacion.inmuebleId))
    .where(
      and(
        eq(t.habitacion.id, habitacionId),
        eq(t.habitacion.inmuebleId, inmuebleId),
        eq(t.inmueble.usuarioId, usuarioId),
      ),
    );
  return Boolean(fila);
}

/** R2: se puede editar todo menos la modalidad; R11c: archivar o restaurar. Devuelve false si no es suyo. */
export async function editarInmueble(
  bd: ConexionBd,
  usuarioId: string,
  inmuebleId: string,
  edicion: EdicionInmueble,
  hoy: string,
): Promise<boolean> {
  if (!(await esSuyo(bd, usuarioId, inmuebleId))) return false;
  if (edicion.archivado !== undefined) await archivarInmueble(bd, inmuebleId, edicion.archivado, hoy);
  const cambios: Partial<typeof t.inmueble.$inferInsert> = {};
  if (edicion.nombre !== undefined) cambios.nombre = validarNombre(edicion.nombre, "del inmueble");
  if (edicion.direccion !== undefined) cambios.direccion = edicion.direccion?.trim() || null;
  if (edicion.mesesParciales !== undefined) cambios.mesesParciales = edicion.mesesParciales;
  if (edicion.diaCobro !== undefined) cambios.diaCobro = validarDiaCobro(edicion.diaCobro);
  if (Object.keys(cambios).length > 0) {
    await bd.update(t.inmueble).set(cambios).where(eq(t.inmueble.id, inmuebleId));
  }
  return true;
}

/** R3: habitación nueva con su precio inicial. Devuelve false si el inmueble no es suyo. */
export async function crearHabitacion(
  bd: ConexionBd,
  usuarioId: string,
  inmuebleId: string,
  nueva: NuevaHabitacion,
  mesActual: string,
): Promise<boolean> {
  if (!(await esSuyo(bd, usuarioId, inmuebleId))) return false;
  const nombre = validarNombre(nueva.nombre, "de la habitación");
  const desdeMes = mesInicial(nueva.desdeMes, mesActual);
  const id = crypto.randomUUID();
  await ejecutarEnBloque(bd, (db) => [
    db.insert(t.habitacion).values({ id, inmuebleId, nombre }),
    db.insert(t.precioHabitacion).values({ habitacionId: id, desdeMes, precioMensual: nueva.precioMensual }),
  ]);
  return true;
}

/** Renombrar, archivar o restaurar (R11, R11b). Devuelve false si no es suya. */
export async function editarHabitacion(
  bd: ConexionBd,
  usuarioId: string,
  inmuebleId: string,
  habitacionId: string,
  edicion: EdicionHabitacion,
  hoy: string,
): Promise<boolean> {
  if (!(await habitacionSuya(bd, usuarioId, inmuebleId, habitacionId))) return false;
  if (edicion.nombre !== undefined) {
    await bd
      .update(t.habitacion)
      .set({ nombre: validarNombre(edicion.nombre, "de la habitación") })
      .where(eq(t.habitacion.id, habitacionId));
  }
  if (edicion.archivada !== undefined) await archivarHabitacion(bd, inmuebleId, habitacionId, edicion.archivada, hoy);
  return true;
}

/** R11: borrar una habitación sin estancias. Devuelve false si no es suya. */
export async function borrarHabitacionSuya(
  bd: ConexionBd,
  usuarioId: string,
  inmuebleId: string,
  habitacionId: string,
): Promise<boolean> {
  if (!(await habitacionSuya(bd, usuarioId, inmuebleId, habitacionId))) return false;
  return borrarHabitacion(bd, inmuebleId, habitacionId);
}

/**
 * R4: precio desde un mes, para ese mes y los siguientes. Si ya había un
 * cambio en ese mismo mes, se sustituye. (R5, cobros desactualizados: tarea 4.3.)
 */
export async function cambiarPrecio(
  bd: ConexionBd,
  usuarioId: string,
  inmuebleId: string,
  habitacionId: string,
  cambio: CambioPrecio,
): Promise<boolean> {
  if (!(await habitacionSuya(bd, usuarioId, inmuebleId, habitacionId))) return false;
  await bd
    .insert(t.precioHabitacion)
    .values({ habitacionId, desdeMes: cambio.desdeMes, precioMensual: cambio.precioMensual })
    .onConflictDoUpdate({
      target: [t.precioHabitacion.habitacionId, t.precioHabitacion.desdeMes],
      set: { precioMensual: cambio.precioMensual, actualizadoEn: new Date() },
    });
  return true;
}
