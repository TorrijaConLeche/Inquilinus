// Archivar, restaurar, borrar y anonimizar (spec 007, R11–R13).
// Las funciones reciben un inmueble que ya se ha comprobado que es del usuario
// (salvo `borrarInmueble`, que lo comprueba); aquí todo se filtra además por él.
import { confirmaBorradoInmueble, estanciaVigente, nombreAnonimo } from "@inquilinus/domain";
import { and, count, eq, inArray, ne, type SQL } from "drizzle-orm";
import type { Almacen } from "./almacen.ts";
import { ejecutarEnBloque } from "./bd/bloque.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { ErrorPeticion } from "./errores.ts";

/** R11b: ¿vive o va a vivir alguien en alguna de estas estancias? */
async function hayEstanciaVigente(bd: ConexionBd, filtro: SQL | undefined, hoy: string): Promise<boolean> {
  const estancias = await bd.select({ salida: t.ocupacion.salida }).from(t.ocupacion).where(filtro);
  return estancias.some((e) => estanciaVigente(e, hoy));
}

/** R11b: ¿es la única habitación activa del inmueble? */
async function esUltimaActiva(bd: ConexionBd, inmuebleId: string, habitacionId: string): Promise<boolean> {
  const [{ n }] = (await bd
    .select({ n: count() })
    .from(t.habitacion)
    .where(
      and(eq(t.habitacion.inmuebleId, inmuebleId), eq(t.habitacion.archivada, false), ne(t.habitacion.id, habitacionId)),
    )) as [{ n: number }];
  return n === 0;
}

/** Borra los objetos del bucket. Sin almacén, una operación que tiene ficheros no puede seguir. */
async function borrarDelBucket(almacen: Almacen | undefined, claves: string[]): Promise<void> {
  if (claves.length === 0) return;
  if (!almacen) throw new Error("ALMACEN_NO_CONFIGURADO");
  await almacen.borrar(claves);
}

// --- Inmueble ---------------------------------------------------------------

/** R11c: archivar (si nadie vive allí, R11b) o restaurar. */
export async function archivarInmueble(bd: ConexionBd, inmuebleId: string, archivado: boolean, hoy: string): Promise<void> {
  if (archivado && (await hayEstanciaVigente(bd, eq(t.ocupacion.inmuebleId, inmuebleId), hoy))) {
    throw new ErrorPeticion("ALGUIEN_VIVIENDO");
  }
  await bd.update(t.inmueble).set({ archivado }).where(eq(t.inmueble.id, inmuebleId));
}

/**
 * R13: borra el inmueble con todo lo que contiene si el nombre escrito
 * coincide. Primero los ficheros del bucket (si falla, no se borra nada y se
 * puede reintentar); después la base de datos, todo o nada.
 */
export async function borrarInmueble(
  bd: ConexionBd,
  almacen: Almacen | undefined,
  usuarioId: string,
  inmuebleId: string,
  nombreEscrito: string,
): Promise<boolean> {
  const [inmueble] = await bd
    .select({ nombre: t.inmueble.nombre })
    .from(t.inmueble)
    .where(and(eq(t.inmueble.id, inmuebleId), eq(t.inmueble.usuarioId, usuarioId)));
  if (!inmueble) return false;
  if (!confirmaBorradoInmueble(inmueble.nombre, nombreEscrito)) throw new ErrorPeticion("CONFIRMACION_INCORRECTA");

  const inquilinos = bd.select({ id: t.inquilino.id }).from(t.inquilino).where(eq(t.inquilino.inmuebleId, inmuebleId));
  const tipos = bd.select({ id: t.tipoGasto.id }).from(t.tipoGasto).where(eq(t.tipoGasto.inmuebleId, inmuebleId));
  const [deDocumentos, deFacturas] = await Promise.all([
    bd
      .select({ id: t.fichero.id, clave: t.fichero.claveS3 })
      .from(t.documento)
      .innerJoin(t.fichero, eq(t.fichero.id, t.documento.ficheroId))
      .where(inArray(t.documento.inquilinoId, inquilinos)),
    bd
      .select({ id: t.fichero.id, clave: t.fichero.claveS3 })
      .from(t.factura)
      .innerJoin(t.fichero, eq(t.fichero.id, t.factura.ficheroId))
      .where(inArray(t.factura.tipoGastoId, tipos)),
  ]);
  const ficheros = [...deDocumentos, ...deFacturas];
  await borrarDelBucket(almacen, ficheros.map((f) => f.clave));

  await ejecutarEnBloque(bd, (db) => {
    const tiposDb = db.select({ id: t.tipoGasto.id }).from(t.tipoGasto).where(eq(t.tipoGasto.inmuebleId, inmuebleId));
    const facturas = db.select({ id: t.factura.id }).from(t.factura).where(inArray(t.factura.tipoGastoId, tiposDb));
    const repartos = db.select({ id: t.reparto.id }).from(t.reparto).where(inArray(t.reparto.facturaId, facturas));
    return [
      // Las líneas de reparto y las facturas protegen a sus inquilinos y ficheros: van antes.
      db.delete(t.repartoLinea).where(inArray(t.repartoLinea.repartoId, repartos)),
      db.delete(t.factura).where(inArray(t.factura.tipoGastoId, tiposDb)),
      ...(ficheros.length > 0 ? [db.delete(t.fichero).where(inArray(t.fichero.id, ficheros.map((f) => f.id)))] : []),
      // El resto cuelga del inmueble y se borra en cascada.
      db.delete(t.inmueble).where(eq(t.inmueble.id, inmuebleId)),
    ];
  });
  return true;
}

// --- Habitaciones -----------------------------------------------------------

async function habitacionDe(bd: ConexionBd, inmuebleId: string, habitacionId: string) {
  const [fila] = await bd
    .select({ archivada: t.habitacion.archivada })
    .from(t.habitacion)
    .where(and(eq(t.habitacion.id, habitacionId), eq(t.habitacion.inmuebleId, inmuebleId)));
  return fila ?? null;
}

/** R11 y R11b: archivar (sin nadie viviendo y sin quedarse sin habitaciones) o restaurar. */
export async function archivarHabitacion(
  bd: ConexionBd,
  inmuebleId: string,
  habitacionId: string,
  archivada: boolean,
  hoy: string,
): Promise<boolean> {
  const habitacion = await habitacionDe(bd, inmuebleId, habitacionId);
  if (!habitacion) return false;
  if (archivada && !habitacion.archivada) {
    if (await hayEstanciaVigente(bd, eq(t.ocupacion.habitacionId, habitacionId), hoy)) {
      throw new ErrorPeticion("ALGUIEN_VIVIENDO");
    }
    if (await esUltimaActiva(bd, inmuebleId, habitacionId)) throw new ErrorPeticion("ULTIMA_HABITACION");
  }
  await bd.update(t.habitacion).set({ archivada }).where(eq(t.habitacion.id, habitacionId));
  return true;
}

/** R11: solo sin estancias, y nunca la última activa (R11b). */
export async function borrarHabitacion(bd: ConexionBd, inmuebleId: string, habitacionId: string): Promise<boolean> {
  const habitacion = await habitacionDe(bd, inmuebleId, habitacionId);
  if (!habitacion) return false;
  const [{ n }] = (await bd
    .select({ n: count() })
    .from(t.ocupacion)
    .where(eq(t.ocupacion.habitacionId, habitacionId))) as [{ n: number }];
  if (n > 0) throw new ErrorPeticion("HABITACION_CON_ESTANCIAS");
  if (!habitacion.archivada && (await esUltimaActiva(bd, inmuebleId, habitacionId))) {
    throw new ErrorPeticion("ULTIMA_HABITACION");
  }
  await bd.delete(t.habitacion).where(eq(t.habitacion.id, habitacionId));
  return true;
}

// --- Tipos de gasto ---------------------------------------------------------

/** R11: solo sin facturas; con ellas, se archiva. */
export async function borrarTipoGasto(bd: ConexionBd, inmuebleId: string, tipoGastoId: string): Promise<boolean> {
  const [tipo] = await bd
    .select({ id: t.tipoGasto.id })
    .from(t.tipoGasto)
    .where(and(eq(t.tipoGasto.id, tipoGastoId), eq(t.tipoGasto.inmuebleId, inmuebleId)));
  if (!tipo) return false;
  const [{ n }] = (await bd
    .select({ n: count() })
    .from(t.factura)
    .where(eq(t.factura.tipoGastoId, tipoGastoId))) as [{ n: number }];
  if (n > 0) throw new ErrorPeticion("TIPO_GASTO_CON_FACTURAS");
  await bd.delete(t.tipoGasto).where(eq(t.tipoGasto.id, tipoGastoId));
  return true;
}

// --- Inquilinos -------------------------------------------------------------

/** R12: ¿tiene cobros o repartos? Entonces se anonimiza en vez de borrarse. */
export async function inquilinosConHistorial(bd: ConexionBd, inquilinoIds: string[]): Promise<Set<string>> {
  if (inquilinoIds.length === 0) return new Set();
  const [cobros, lineas] = await Promise.all([
    bd
      .selectDistinct({ id: t.cobroAlquiler.inquilinoId })
      .from(t.cobroAlquiler)
      .where(inArray(t.cobroAlquiler.inquilinoId, inquilinoIds)),
    bd
      .selectDistinct({ id: t.repartoLinea.inquilinoId })
      .from(t.repartoLinea)
      .where(inArray(t.repartoLinea.inquilinoId, inquilinoIds)),
  ]);
  return new Set([...cobros, ...lineas].map((f) => f.id).filter((id): id is string => id !== null));
}

/**
 * R12, derecho de supresión. Solo si ya no vive allí ni va a vivir. Con
 * historial se anonimiza ("Inquilino N") y se borran sus documentos, fianza,
 * ficheros y enlace; sin historial, se borra del todo con sus estancias.
 * Devuelve null si el inquilino no es de este inmueble.
 */
export async function borrarInquilino(
  bd: ConexionBd,
  almacen: Almacen | undefined,
  inmuebleId: string,
  inquilinoId: string,
  hoy: string,
): Promise<"anonimizado" | "borrado" | null> {
  const [inquilino] = await bd
    .select({ anonimizado: t.inquilino.anonimizado })
    .from(t.inquilino)
    .where(and(eq(t.inquilino.id, inquilinoId), eq(t.inquilino.inmuebleId, inmuebleId)));
  if (!inquilino) return null;
  if (inquilino.anonimizado) throw new ErrorPeticion("INQUILINO_ANONIMIZADO");
  if (await hayEstanciaVigente(bd, eq(t.ocupacion.inquilinoId, inquilinoId), hoy)) {
    throw new ErrorPeticion("INQUILINO_VIVIENDO");
  }

  const ficheros = await bd
    .select({ id: t.fichero.id, clave: t.fichero.claveS3 })
    .from(t.documento)
    .innerJoin(t.fichero, eq(t.fichero.id, t.documento.ficheroId))
    .where(eq(t.documento.inquilinoId, inquilinoId));
  const conHistorial = (await inquilinosConHistorial(bd, [inquilinoId])).has(inquilinoId);
  const [{ n }] = (await bd
    .select({ n: count() })
    .from(t.inquilino)
    .where(and(eq(t.inquilino.inmuebleId, inmuebleId), eq(t.inquilino.anonimizado, true)))) as [{ n: number }];

  // Primero el bucket: si falla, no se borra nada y se puede reintentar.
  await borrarDelBucket(almacen, ficheros.map((f) => f.clave));

  await ejecutarEnBloque(bd, (db) => [
    // Al borrar el fichero se borra en cascada su documento.
    ...(ficheros.length > 0 ? [db.delete(t.fichero).where(inArray(t.fichero.id, ficheros.map((f) => f.id)))] : []),
    ...(conHistorial
      ? [
          db.delete(t.fianza).where(eq(t.fianza.inquilinoId, inquilinoId)),
          db.delete(t.enlaceInquilino).where(eq(t.enlaceInquilino.inquilinoId, inquilinoId)),
          db
            .update(t.inquilino)
            .set({ nombre: nombreAnonimo(n + 1), anonimizado: true })
            .where(eq(t.inquilino.id, inquilinoId)),
        ]
      : [db.delete(t.inquilino).where(eq(t.inquilino.id, inquilinoId))]),
  ]);
  return conHistorial ? "anonimizado" : "borrado";
}

/** R12: un inquilino anonimizado ya no se puede editar. */
export async function exigirEditable(bd: ConexionBd, inquilinoId: string): Promise<void> {
  const [fila] = await bd
    .select({ anonimizado: t.inquilino.anonimizado })
    .from(t.inquilino)
    .where(eq(t.inquilino.id, inquilinoId));
  if (fila?.anonimizado) throw new ErrorPeticion("INQUILINO_ANONIMIZADO");
}
