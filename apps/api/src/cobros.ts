// Cobros de alquiler (spec 005): listar, generar a mano, añadir, editar,
// mover, quitar, restaurar y marcar pagado. Las funciones reciben un inmueble
// que ya se ha comprobado que es del usuario; aquí todo se filtra además por él.
import type { Cobro, EdicionCobro, NuevoCobro } from "@inquilinus/contracts";
import {
  calcularAlquilerMes,
  cobroManual,
  cobrosQueFaltan,
  fechaEnMes,
  habitacionesDelMes,
  importesEditados,
  validarFecha,
  validarFechaPago,
  validarMesGenerable,
  type EntradaCobros,
} from "@inquilinus/domain";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { ErrorPeticion } from "./errores.ts";

type FilaCobro = typeof t.cobroAlquiler.$inferSelect;

function aCobro(fila: FilaCobro): Cobro {
  return {
    id: fila.id,
    inquilinoId: fila.inquilinoId,
    mes: fila.mes,
    renta: fila.renta,
    recargoVacios: fila.recargoVacios,
    importe: fila.importe,
    fechaCobro: fila.fechaCobro,
    origen: fila.origen,
    editado: fila.editado,
    desactualizado: fila.desactualizado,
    quitado: fila.quitadoEn !== null,
    pagadoEn: fila.pagadoEn,
  };
}

/** Inquilinos del inmueble, para filtrar sus cobros. */
const inquilinosDe = (bd: ConexionBd, inmuebleId: string) =>
  bd.select({ id: t.inquilino.id }).from(t.inquilino).where(eq(t.inquilino.inmuebleId, inmuebleId));

/** R11: sin los quitados, salvo que se pidan. Ordenados por fecha de cobro. */
export async function listarCobros(
  bd: ConexionBd,
  inmuebleId: string,
  opciones: { mes?: string | undefined; quitados: boolean },
): Promise<Cobro[]> {
  const filas = await bd
    .select()
    .from(t.cobroAlquiler)
    .where(
      and(
        inArray(t.cobroAlquiler.inquilinoId, inquilinosDe(bd, inmuebleId)),
        ...(opciones.mes ? [eq(t.cobroAlquiler.mes, opciones.mes)] : []),
        ...(opciones.quitados ? [] : [isNull(t.cobroAlquiler.quitadoEn)]),
      ),
    )
    .orderBy(asc(t.cobroAlquiler.fechaCobro), asc(t.cobroAlquiler.creadoEn));
  return filas.map(aCobro);
}

/**
 * Datos del inmueble para calcular un mes (spec 002), con las habitaciones que
 * existían ese mes (R5b). Las estancias de habitaciones que no entran no
 * tocan ese mes y se dejan fuera.
 */
async function entradaDelMes(bd: ConexionBd, inmuebleId: string, mes: string): Promise<Omit<EntradaCobros, "existentes">> {
  const [inmueble] = await bd
    .select({ modalidad: t.inmueble.modalidad, mesesParciales: t.inmueble.mesesParciales, diaCobro: t.inmueble.diaCobro })
    .from(t.inmueble)
    .where(eq(t.inmueble.id, inmuebleId));
  const [habitaciones, ocupaciones] = await Promise.all([
    bd.select({ id: t.habitacion.id, archivada: t.habitacion.archivada }).from(t.habitacion).where(eq(t.habitacion.inmuebleId, inmuebleId)),
    bd
      .select({
        habitacionId: t.ocupacion.habitacionId,
        inquilinoId: t.ocupacion.inquilinoId,
        entrada: t.ocupacion.entrada,
        salida: t.ocupacion.salida,
      })
      .from(t.ocupacion)
      .where(eq(t.ocupacion.inmuebleId, inmuebleId)),
  ]);
  const precios =
    habitaciones.length === 0
      ? []
      : await bd
          .select()
          .from(t.precioHabitacion)
          .where(inArray(t.precioHabitacion.habitacionId, habitaciones.map((h) => h.id)));
  const delMes = habitacionesDelMes(
    mes,
    habitaciones.map((h) => ({
      ...h,
      historialPrecios: precios.filter((p) => p.habitacionId === h.id),
    })),
    ocupaciones,
  );
  const ids = new Set(delMes.map((h) => h.id));
  return {
    modalidad: inmueble!.modalidad,
    mesesParciales: inmueble!.mesesParciales,
    diaCobro: inmueble!.diaCobro,
    habitaciones: delMes,
    ocupaciones: ocupaciones.filter((o) => ids.has(o.habitacionId)),
  };
}

/** Cobros que ya existen en un mes, incluidos los quitados (R4 y R11). */
async function existentesDelMes(bd: ConexionBd, inmuebleId: string, mes: string) {
  return bd
    .select({ inquilinoId: t.cobroAlquiler.inquilinoId, mes: t.cobroAlquiler.mes })
    .from(t.cobroAlquiler)
    .where(and(inArray(t.cobroAlquiler.inquilinoId, inquilinosDe(bd, inmuebleId)), eq(t.cobroAlquiler.mes, mes)));
}

/** R5: genera a mano los cobros que falten de un mes (no futuro). Devuelve los creados. */
export async function generarCobros(bd: ConexionBd, inmuebleId: string, mes: string, mesActual: string): Promise<Cobro[]> {
  validarMesGenerable(mes, mesActual);
  const [entrada, existentes] = await Promise.all([entradaDelMes(bd, inmuebleId, mes), existentesDelMes(bd, inmuebleId, mes)]);
  const nuevos = cobrosQueFaltan(mes, { ...entrada, existentes });
  if (nuevos.length === 0) return [];
  // R4: si otro proceso los creó a la vez, el índice único (inquilino, mes) evita el duplicado.
  const filas = await bd
    .insert(t.cobroAlquiler)
    .values(nuevos.map((c) => ({ ...c, origen: "manual" as const })))
    .onConflictDoNothing()
    .returning();
  return filas.map(aCobro);
}

/**
 * R10 y R10b: añade a mano el cobro de un inquilino en un mes que no lo tiene.
 * Si vivió allí ese mes, se proponen los importes calculados; si no, la renta es obligatoria.
 * Devuelve null si el inquilino no es de este inmueble.
 */
export async function crearCobro(bd: ConexionBd, inmuebleId: string, nuevo: NuevoCobro): Promise<Cobro | null> {
  const [inquilino] = await bd
    .select({ anonimizado: t.inquilino.anonimizado })
    .from(t.inquilino)
    .where(and(eq(t.inquilino.id, nuevo.inquilinoId), eq(t.inquilino.inmuebleId, inmuebleId)));
  if (!inquilino) return null;
  if (inquilino.anonimizado) throw new ErrorPeticion("INQUILINO_ANONIMIZADO");
  const [existente] = await bd
    .select({ id: t.cobroAlquiler.id })
    .from(t.cobroAlquiler)
    .where(and(eq(t.cobroAlquiler.inquilinoId, nuevo.inquilinoId), eq(t.cobroAlquiler.mes, nuevo.mes)));
  // R4 y R11: también si está quitado; entonces se restaura.
  if (existente) throw new ErrorPeticion("COBRO_EXISTENTE");

  let calculado: { renta: number; recargoVacios: number } | null = null;
  let diaCobro: number;
  try {
    const entrada = await entradaDelMes(bd, inmuebleId, nuevo.mes);
    diaCobro = entrada.diaCobro;
    calculado = calcularAlquilerMes({ ...entrada, mes: nuevo.mes }).lineas.find((l) => l.inquilinoId === nuevo.inquilinoId) ?? null;
  } catch (error) {
    // Sin poder calcular el mes (habitación sin precio), vale si se indica la renta.
    if (nuevo.renta === undefined) throw error;
    const [inmueble] = await bd.select({ diaCobro: t.inmueble.diaCobro }).from(t.inmueble).where(eq(t.inmueble.id, inmuebleId));
    diaCobro = inmueble!.diaCobro;
  }

  const importes = cobroManual(calculado, { renta: nuevo.renta, recargoVacios: nuevo.recargoVacios });
  const [fila] = await bd
    .insert(t.cobroAlquiler)
    .values({
      inquilinoId: nuevo.inquilinoId,
      mes: nuevo.mes,
      renta: importes.renta,
      recargoVacios: importes.recargoVacios,
      importe: importes.importe,
      fechaCobro: nuevo.fechaCobro ? validarFecha(nuevo.fechaCobro) : fechaEnMes(nuevo.mes, diaCobro),
      origen: "manual",
      editado: importes.editado,
    })
    .returning();
  return aCobro(fila!);
}

/**
 * R7, R10 y R11: cambiar renta, recargo o fecha (queda editado si algo cambia),
 * quitar o restaurar, y marcar pagado (fecha no posterior a hoy) o pendiente.
 * Devuelve null si el cobro no es de este inmueble.
 */
export async function editarCobro(
  bd: ConexionBd,
  inmuebleId: string,
  cobroId: string,
  edicion: EdicionCobro,
  hoy: string,
): Promise<Cobro | null> {
  const [actual] = await bd
    .select()
    .from(t.cobroAlquiler)
    .where(and(eq(t.cobroAlquiler.id, cobroId), inArray(t.cobroAlquiler.inquilinoId, inquilinosDe(bd, inmuebleId))));
  if (!actual) return null;

  const cambios: Partial<typeof t.cobroAlquiler.$inferInsert> = {};
  if (edicion.renta !== undefined || edicion.recargoVacios !== undefined) {
    const importes = importesEditados(edicion.renta ?? actual.renta, edicion.recargoVacios ?? actual.recargoVacios);
    if (importes.renta !== actual.renta || importes.recargoVacios !== actual.recargoVacios) {
      Object.assign(cambios, importes, { editado: true });
    }
  }
  if (edicion.fechaCobro !== undefined) {
    const fecha = validarFecha(edicion.fechaCobro);
    if (fecha !== actual.fechaCobro) Object.assign(cambios, { fechaCobro: fecha, editado: true });
  }
  if (edicion.quitado !== undefined && edicion.quitado !== (actual.quitadoEn !== null)) {
    cambios.quitadoEn = edicion.quitado ? new Date() : null;
  }
  if (edicion.pagadoEn !== undefined) {
    cambios.pagadoEn = edicion.pagadoEn === null ? null : validarFechaPago(validarFecha(edicion.pagadoEn), hoy);
  }

  if (Object.keys(cambios).length === 0) return aCobro(actual);
  const [fila] = await bd
    .update(t.cobroAlquiler)
    .set({ ...cambios, actualizadoEn: new Date() })
    .where(eq(t.cobroAlquiler.id, cobroId))
    .returning();
  return aCobro(fila!);
}
