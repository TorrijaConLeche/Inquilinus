// Documentos y fianza del inquilino (spec 007, R6b–R6e).
// Las funciones reciben un inquilino que ya se ha comprobado que es del
// usuario (las rutas lo hacen con `inquilinoSuyo`).
import type { Documento, Fianza, PeticionFianza, TipoDocumento } from "@inquilinus/contracts";
import { TAMANO_MAXIMO_DOCUMENTO, validarDocumento, validarFianza } from "@inquilinus/domain";
import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { claveDocumento, clavePendiente, type Almacen, type PermisoSubida } from "./almacen.ts";
import { ejecutarEnBloque } from "./bd/bloque.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { ErrorPeticion } from "./inmuebles.ts";

/** R6c: el permiso de subida y la URL de descarga caducan a los 5 minutos. */
export const SEGUNDOS_PERMISO = 5 * 60;

/** El inquilino, si es de ese inmueble y el inmueble es del usuario. */
export async function inquilinoSuyo(
  bd: ConexionBd,
  usuarioId: string,
  inmuebleId: string,
  inquilinoId: string,
): Promise<boolean> {
  const [fila] = await bd
    .select({ id: t.inquilino.id })
    .from(t.inquilino)
    .innerJoin(t.inmueble, eq(t.inmueble.id, t.inquilino.inmuebleId))
    .where(and(eq(t.inquilino.id, inquilinoId), eq(t.inmueble.id, inmuebleId), eq(t.inmueble.usuarioId, usuarioId)));
  return fila !== undefined;
}

// --- Lectura ----------------------------------------------------------------

export interface DocumentosYFianzas {
  documentos: Map<string, Documento[]>;
  fianzas: Map<string, Fianza>;
}

/** Documentos y fianzas de varios inquilinos, agrupados por inquilino. */
export async function documentosYFianzas(bd: ConexionBd, inquilinoIds: string[]): Promise<DocumentosYFianzas> {
  const resultado: DocumentosYFianzas = { documentos: new Map(), fianzas: new Map() };
  if (inquilinoIds.length === 0) return resultado;
  const [documentos, fianzas] = await Promise.all([
    bd
      .select({
        inquilinoId: t.documento.inquilinoId,
        tipo: t.documento.tipo,
        nombre: t.fichero.nombreOriginal,
        tamanoBytes: t.fichero.tamanoBytes,
        subidoEn: t.documento.creadoEn,
      })
      .from(t.documento)
      .innerJoin(t.fichero, eq(t.fichero.id, t.documento.ficheroId))
      .where(inArray(t.documento.inquilinoId, inquilinoIds)),
    bd.select().from(t.fianza).where(inArray(t.fianza.inquilinoId, inquilinoIds)),
  ]);
  for (const { inquilinoId, subidoEn, ...documento } of documentos) {
    const lista = resultado.documentos.get(inquilinoId) ?? [];
    lista.push({ ...documento, subidoEn: subidoEn.toISOString() });
    lista.sort((a, b) => a.tipo.localeCompare(b.tipo));
    resultado.documentos.set(inquilinoId, lista);
  }
  for (const f of fianzas) resultado.fianzas.set(f.inquilinoId, aFianza(f));
  return resultado;
}

function aFianza(fila: typeof t.fianza.$inferSelect): Fianza {
  return {
    importe: fila.importe,
    recibidaEn: fila.recibidaEn,
    devueltaEn: fila.devueltaEn,
    importeDevuelto: fila.importeDevuelto,
    notas: fila.notas,
  };
}

// --- Documentos -------------------------------------------------------------

/** R6c: permiso para que el navegador suba el PDF a una clave pendiente de este usuario. */
export async function prepararSubida(
  almacen: Almacen,
  usuarioId: string,
  ahora: Date,
): Promise<PermisoSubida & { subidaId: string; tamanoMaximo: number; caducaEn: string }> {
  const subidaId = crypto.randomUUID();
  const permiso = await almacen.prepararSubida(clavePendiente(usuarioId, subidaId), {
    tamanoMaximo: TAMANO_MAXIMO_DOCUMENTO,
    segundos: SEGUNDOS_PERMISO,
  });
  return {
    ...permiso,
    subidaId,
    tamanoMaximo: TAMANO_MAXIMO_DOCUMENTO,
    caducaEn: new Date(ahora.getTime() + SEGUNDOS_PERMISO * 1000).toISOString(),
  };
}

/** Quita rutas y caracteres de control del nombre que manda el navegador. */
function limpiarNombre(nombre: string): string {
  const base = nombre.split(/[/\\]/).at(-1) ?? "";
  const limpio
 = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return limpio || "documento.pdf";
}

/**
 * R6b: confirma una subida. Comprueba que es un PDF de hasta 10 MB, lo mueve a
 * su sitio definitivo y reemplaza el documento anterior del mismo tipo, que se
 * borra del bucket. Si algo falla, no queda nada a medias (C11).
 */
export async function guardarDocumento(
  bd: ConexionBd,
  almacen: Almacen,
  datos: { usuarioId: string; inquilinoId: string; tipo: TipoDocumento; subidaId: string; nombre: string },
): Promise<Documento> {
  const pendiente = clavePendiente(datos.usuarioId, datos.subidaId);
  const contenido = await almacen.leer(pendiente);
  if (!contenido) throw new ErrorPeticion("SUBIDA_NO_ENCONTRADA");
  try {
    validarDocumento(contenido);
  } catch (error) {
    await almacen.borrar([pendiente]);
    throw error;
  }

  const ficheroId = crypto.randomUUID();
  const clave = claveDocumento(datos.usuarioId, ficheroId);
  await almacen.copiar(pendiente, clave);
  await almacen.borrar([pendiente]);

  const [anterior] = await bd
    .select({ ficheroId: t.fichero.id, clave: t.fichero.claveS3 })
    .from(t.documento)
    .innerJoin(t.fichero, eq(t.fichero.id, t.documento.ficheroId))
    .where(and(eq(t.documento.inquilinoId, datos.inquilinoId), eq(t.documento.tipo, datos.tipo)));

  const nombre = limpiarNombre(datos.nombre);
  try {
    await ejecutarEnBloque(bd, (db) => [
      // Al borrar el fichero se borra en cascada su documento.
      ...(anterior ? [db.delete(t.fichero).where(eq(t.fichero.id, anterior.ficheroId))] : []),
      db.insert(t.fichero).values({
        id: ficheroId,
        usuarioId: datos.usuarioId,
        claveS3: clave,
        nombreOriginal: nombre,
        mime: "application/pdf",
        tamanoBytes: contenido.length,
        sha256: createHash("sha256").update(contenido).digest("hex"),
      }),
      db.insert(t.documento).values({ inquilinoId: datos.inquilinoId, tipo: datos.tipo, ficheroId }),
    ]);
  } catch (error) {
    await almacen.borrar([clave]);
    throw error;
  }
  if (anterior) await almacen.borrar([anterior.clave]);

  const [guardado] = await bd
    .select({ subidoEn: t.documento.creadoEn })
    .from(t.documento)
    .where(eq(t.documento.ficheroId, ficheroId));
  return { tipo: datos.tipo, nombre, tamanoBytes: contenido.length, subidoEn: guardado!.subidoEn.toISOString() };
}

async function ficheroDe(bd: ConexionBd, inquilinoId: string, tipo: TipoDocumento) {
  const [fila] = await bd
    .select({ id: t.fichero.id, clave: t.fichero.claveS3, nombre: t.fichero.nombreOriginal })
    .from(t.documento)
    .innerJoin(t.fichero, eq(t.fichero.id, t.documento.ficheroId))
    .where(and(eq(t.documento.inquilinoId, inquilinoId), eq(t.documento.tipo, tipo)));
  return fila ?? null;
}

/** R6c: URL firmada de 5 minutos para ver el PDF, o null si no hay documento de ese tipo. */
export async function urlDocumento(
  bd: ConexionBd,
  almacen: Almacen,
  inquilinoId: string,
  tipo: TipoDocumento,
): Promise<string | null> {
  const fichero = await ficheroDe(bd, inquilinoId, tipo);
  if (!fichero) return null;
  return almacen.urlDescarga(fichero.clave, { nombre: fichero.nombre, segundos: SEGUNDOS_PERMISO });
}

/** R6b: borra el documento, su fila de fichero y el objeto del bucket. Devuelve false si no había. */
export async function borrarDocumento(
  bd: ConexionBd,
  almacen: Almacen,
  inquilinoId: string,
  tipo: TipoDocumento,
): Promise<boolean> {
  const fichero = await ficheroDe(bd, inquilinoId, tipo);
  if (!fichero) return false;
  // Primero el bucket: si falla, no se borra nada y se puede reintentar.
  await almacen.borrar([fichero.clave]);
  await bd.delete(t.fichero).where(eq(t.fichero.id, fichero.id));
  return true;
}

// --- Fianza -----------------------------------------------------------------

/** R6d: crea o reemplaza la fianza del inquilino. */
export async function guardarFianza(bd: ConexionBd, inquilinoId: string, peticion: PeticionFianza): Promise<Fianza> {
  const valida = validarFianza(peticion);
  const [fila] = await bd
    .insert(t.fianza)
    .values({ inquilinoId, ...valida })
    .onConflictDoUpdate({ target: t.fianza.inquilinoId, set: { ...valida, actualizadoEn: new Date() } })
    .returning();
  return aFianza(fila!);
}

export async function borrarFianza(bd: ConexionBd, inquilinoId: string): Promise<boolean> {
  const borradas = await bd.delete(t.fianza).where(eq(t.fianza.inquilinoId, inquilinoId)).returning({ id: t.fianza.id });
  return borradas.length > 0;
}
