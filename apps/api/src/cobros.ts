// Cobros de alquiler (spec 005): listar, generar a mano, añadir, editar,
// mover, quitar, restaurar y marcar pagado. Las funciones reciben un inmueble
// que ya se ha comprobado que es del usuario; aquí todo se filtra además por él.
import type { Cobro, EdicionCobro, NuevoCobro } from "@inquilinus/contracts";
import {
  calcularAlquilerMes,
  cobroManual,
  cobrosAGenerarHoy,
  cobrosQueFaltan,
  diaDelMes,
  ErrorValidacion,
  fechaEnMes,
  habitacionesDelMes,
  importesEditados,
  inquilinosConCobroDesactualizado,
  mesDe,
  recalcularPideConfirmacion,
  validarFecha,
  validarFechaPago,
  validarMesGenerable,
  type EntradaCobros,
  type ResultadoAlquilerMes,
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

/** Todo lo que hace falta para calcular cualquier mes del inmueble (spec 002), en una sola lectura. */
async function datosDelInmueble(bd: ConexionBd, inmuebleId: string) {
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
  return {
    inmueble: inmueble!,
    habitaciones: habitaciones.map((h) => ({ ...h, historialPrecios: precios.filter((p) => p.habitacionId === h.id) })),
    ocupaciones,
  };
}

type DatosInmueble = Awaited<ReturnType<typeof datosDelInmueble>>;

/**
 * Entrada del cálculo de un mes con las habitaciones que existían ese mes
 * (R5b). Las estancias de habitaciones que no entran no tocan ese mes y se dejan fuera.
 */
function entradaParaMes(datos: DatosInmueble, mes: string): Omit<EntradaCobros, "existentes"> {
  const delMes = habitacionesDelMes(mes, datos.habitaciones, datos.ocupaciones);
  const ids = new Set(delMes.map((h) => h.id));
  return {
    modalidad: datos.inmueble.modalidad,
    mesesParciales: datos.inmueble.mesesParciales,
    diaCobro: datos.inmueble.diaCobro,
    habitaciones: delMes,
    ocupaciones: datos.ocupaciones.filter((o) => ids.has(o.habitacionId)),
  };
}

async function entradaDelMes(bd: ConexionBd, inmuebleId: string, mes: string): Promise<Omit<EntradaCobros, "existentes">> {
  return entradaParaMes(await datosDelInmueble(bd, inmuebleId), mes);
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

// --- Proceso diario (R2, R2b, R3, R8, R8b) -----------------------------------

export interface ResumenProcesoDiario {
  inmuebles: number;
  creados: number;
  /** Solo el código de cada fallo: nunca datos del inmueble ni de sus inquilinos. */
  fallos: string[];
}

/**
 * Crea, en cada inmueble activo cuyo día de cobro de este mes ya ha llegado,
 * los cobros del mes en curso que falten (origen `auto`). Los archivados y
 * bloqueados no generan (R2b). Un inmueble que falla no para a los demás.
 */
export async function generarCobrosDelDia(bd: ConexionBd, hoy: string): Promise<ResumenProcesoDiario> {
  const mes = mesDe(hoy);
  const inmuebles = await bd
    .select({ id: t.inmueble.id, diaCobro: t.inmueble.diaCobro })
    .from(t.inmueble)
    .where(and(eq(t.inmueble.archivado, false), eq(t.inmueble.bloqueado, false)));
  const resumen: ResumenProcesoDiario = { inmuebles: inmuebles.length, creados: 0, fallos: [] };

  for (const inmueble of inmuebles) {
    // R2 y R8: hasta que llega el día de cobro de este mes no hay nada que hacer.
    if (diaDelMes(hoy) < inmueble.diaCobro) continue;
    try {
      const [entrada, existentes] = await Promise.all([
        entradaDelMes(bd, inmueble.id, mes),
        existentesDelMes(bd, inmueble.id, mes),
      ]);
      const nuevos = cobrosAGenerarHoy(hoy, { ...entrada, existentes });
      if (nuevos.length === 0) continue;
      const filas = await bd
        .insert(t.cobroAlquiler)
        .values(nuevos.map((c) => ({ ...c, origen: "auto" as const })))
        .onConflictDoNothing()
        .returning({ id: t.cobroAlquiler.id });
      resumen.creados += filas.length;
    } catch (error) {
      resumen.fallos.push(error instanceof ErrorValidacion ? error.codigo : error instanceof Error ? error.name : "DESCONOCIDO");
    }
  }
  return resumen;
}

// --- Desactualizados y recálculo (R6, R6b) ------------------------------------

/** Cálculo de cada mes; null si ese mes no se puede calcular (por ejemplo, una habitación ocupada sin precio). */
function calculosDeMeses(datos: DatosInmueble, meses: string[]): Map<string, ResultadoAlquilerMes | null> {
  const calculos = new Map<string, ResultadoAlquilerMes | null>();
  for (const mes of meses) {
    try {
      calculos.set(mes, calcularAlquilerMes({ ...entradaParaMes(datos, mes), mes }));
    } catch (error) {
      if (!(error instanceof ErrorValidacion)) throw error;
      calculos.set(mes, null);
    }
  }
  return calculos;
}

/**
 * R6: hace un cambio en el inmueble y marca como desactualizados los cobros
 * (no quitados) cuyo cálculo sale distinto después. Compara cálculo con
 * cálculo, no con lo guardado, así que lo editado a mano solo se marca si
 * cambia su cálculo. Si el cambio falla, no se marca nada.
 */
export async function vigilarCobros<T>(bd: ConexionBd, inmuebleId: string, cambio: () => Promise<T>): Promise<T> {
  const cobros = await bd
    .select({ mes: t.cobroAlquiler.mes, inquilinoId: t.cobroAlquiler.inquilinoId })
    .from(t.cobroAlquiler)
    .where(and(inArray(t.cobroAlquiler.inquilinoId, inquilinosDe(bd, inmuebleId)), isNull(t.cobroAlquiler.quitadoEn)));
  if (cobros.length === 0) return cambio();

  const meses = [...new Set(cobros.map((c) => c.mes))];
  const antes = calculosDeMeses(await datosDelInmueble(bd, inmuebleId), meses);
  const resultado = await cambio();
  const despues = calculosDeMeses(await datosDelInmueble(bd, inmuebleId), meses);

  for (const mes of meses) {
    const a = antes.get(mes) ?? null;
    const d = despues.get(mes) ?? null;
    const conCobro = cobros.filter((c) => c.mes === mes).map((c) => c.inquilinoId);
    // Si un lado no se puede calcular y el otro sí, todo el mes ha cambiado.
    const cambiados = a && d ? inquilinosConCobroDesactualizado(a, d) : a === d ? [] : conCobro;
    const marcar = cambiados.filter((id) => conCobro.includes(id));
    if (marcar.length === 0) continue;
    await bd
      .update(t.cobroAlquiler)
      .set({ desactualizado: true, actualizadoEn: new Date() })
      .where(
        and(eq(t.cobroAlquiler.mes, mes), inArray(t.cobroAlquiler.inquilinoId, marcar), isNull(t.cobroAlquiler.quitadoEn)),
      );
  }
  return resultado;
}

/**
 * R6 y R6b: pone los importes del cálculo actual. Con el cobro pagado o
 * editado pide confirmación; conserva una fecha movida (y sigue editado); si
 * el inquilino ya no vivió allí ese mes, no se recalcula. Devuelve null si el
 * cobro no es de este inmueble.
 */
export async function recalcularCobro(
  bd: ConexionBd,
  inmuebleId: string,
  cobroId: string,
  confirmado: boolean,
): Promise<Cobro | null> {
  const [actual] = await bd
    .select()
    .from(t.cobroAlquiler)
    .where(and(eq(t.cobroAlquiler.id, cobroId), inArray(t.cobroAlquiler.inquilinoId, inquilinosDe(bd, inmuebleId))));
  if (!actual) return null;
  if (recalcularPideConfirmacion(actual) && !confirmado) throw new ErrorPeticion("CONFIRMACION_NECESARIA");

  const datos = await datosDelInmueble(bd, inmuebleId);
  const linea = calcularAlquilerMes({ ...entradaParaMes(datos, actual.mes), mes: actual.mes }).lineas.find(
    (l) => l.inquilinoId === actual.inquilinoId,
  );
  if (!linea) throw new ErrorPeticion("SIN_ESTANCIA_EN_EL_MES");

  const movido = actual.fechaCobro !== fechaEnMes(actual.mes, datos.inmueble.diaCobro);
  const [fila] = await bd
    .update(t.cobroAlquiler)
    .set({
      renta: linea.renta,
      recargoVacios: linea.recargoVacios,
      importe: linea.importe,
      desactualizado: false,
      editado: movido,
      actualizadoEn: new Date(),
    })
    .where(eq(t.cobroAlquiler.id, cobroId))
    .returning();
  return aCobro(fila!);
}
