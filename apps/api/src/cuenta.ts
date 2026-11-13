// Datos de la cuenta (spec 008): método de doble factor, exportar y borrar (R14).
import type { ExportacionCuenta } from "@inquilinus/contracts";
import { and, eq, getTableName, inArray, type Column } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTable } from "drizzle-orm/pg-core";
import * as esquema from "./bd/esquema.ts";

type Bd = PgDatabase<PgQueryResultHKT, typeof esquema>;

export type MetodoDobleFactor = "app" | "email";

/** Método de doble factor activo (R7): app si hay un secreto confirmado; si no, email. */
export async function metodoDobleFactor(
  bd: Bd,
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

// --- Exportar (R14) ---------------------------------------------------------

/**
 * Columnas que nunca salen en la exportación: secretos que no le sirven a la
 * usuaria y serían un riesgo si el fichero se pierde.
 */
const SECRETOS: Record<string, string[]> = {
  metodo_acceso: ["contrasenaHash", "tokenAcceso", "tokenRefresco", "tokenId"],
  sesion: ["token"],
  enlace_inquilino: ["tokenHash"],
  // Ruta interna del bucket: no es un dato de la usuaria.
  fichero: ["claveS3"],
};

/**
 * Tablas que no se exportan, con el motivo. Un test comprueba que toda tabla
 * del esquema está exportada o aquí, para que ninguna nueva se olvide.
 */
export const TABLAS_NO_EXPORTADAS: Record<string, string> = {
  doble_factor: "Solo secretos; el método activo va en «cuenta».",
  verificacion: "Tokens de un solo uso que caducan solos.",
  intento_acceso: "Contadores con huellas, sin datos legibles.",
  evento_pago: "Identificadores de Paddle sin datos de la cuenta.",
};

function limpiar(tabla: PgTable, filas: Record<string, unknown>[]) {
  const ocultas = SECRETOS[getTableName(tabla)] ?? [];
  return filas.map((fila) => {
    const copia: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(fila)) {
      if (ocultas.includes(clave)) continue;
      copia[clave] = valor instanceof Date ? valor.toISOString() : valor;
    }
    return copia;
  });
}

/** Todos los datos de la cuenta, tabla a tabla, sin secretos (R14). */
export async function exportarDatos(bd: Bd, usuarioId: string): Promise<ExportacionCuenta> {
  const t = esquema;
  const tablas: Record<string, Record<string, unknown>[]> = {};
  const de = async (tabla: PgTable, columna: Column, valores: string[]) => {
    const filas = valores.length === 0 ? [] : await bd.select().from(tabla).where(inArray(columna, valores));
    tablas[getTableName(tabla)] = limpiar(tabla, filas as Record<string, unknown>[]);
    return filas as { id: string }[];
  };
  const ids = (filas: { id: string }[]) => filas.map((f) => f.id);

  const [usuario] = await de(t.usuario, t.usuario.id, [usuarioId]);
  if (!usuario) throw new Error("USUARIO_NO_ENCONTRADO");
  await de(t.metodoAcceso, t.metodoAcceso.usuarioId, [usuarioId]);
  await de(t.sesion, t.sesion.usuarioId, [usuarioId]);
  await de(t.fichero, t.fichero.usuarioId, [usuarioId]);
  await de(t.suscripcion, t.suscripcion.usuarioId, [usuarioId]);
  await de(t.usoIa, t.usoIa.usuarioId, [usuarioId]);

  const inmuebles = ids(await de(t.inmueble, t.inmueble.usuarioId, [usuarioId]));
  const habitaciones = ids(await de(t.habitacion, t.habitacion.inmuebleId, inmuebles));
  await de(t.precioHabitacion, t.precioHabitacion.habitacionId, habitaciones);
  const inquilinos = ids(await de(t.inquilino, t.inquilino.inmuebleId, inmuebles));
  await de(t.ocupacion, t.ocupacion.inmuebleId, inmuebles);
  await de(t.tipoGasto, t.tipoGasto.inmuebleId, inmuebles);
  await de(t.liquidacion, t.liquidacion.inmuebleId, inmuebles);
  const facturas = ids(await de(t.factura, t.factura.inmuebleId, inmuebles));
  const repartos = ids(await de(t.reparto, t.reparto.facturaId, facturas));
  await de(t.repartoLinea, t.repartoLinea.repartoId, repartos);
  await de(t.cobroAlquiler, t.cobroAlquiler.inquilinoId, inquilinos);
  await de(t.fianza, t.fianza.inquilinoId, inquilinos);
  await de(t.documento, t.documento.inquilinoId, inquilinos);
  await de(t.enlaceInquilino, t.enlaceInquilino.inquilinoId, inquilinos);
  await de(t.actividad, t.actividad.inmuebleId, inmuebles);

  // El método de doble factor, sin el secreto (la tabla doble_factor no se exporta).
  const dobleFactorActivo = Boolean((usuario as unknown as { dobleFactorActivo: boolean }).dobleFactorActivo);
  const metodo = await metodoDobleFactor(bd, { id: usuarioId, dobleFactorActivo });
  tablas["usuario"] = tablas["usuario"]!.map((u) => ({ ...u, dobleFactorMetodo: metodo }));

  return { formato: "inquilinus-exportacion", version: 1, exportadoEn: new Date().toISOString(), tablas };
}

// --- Borrar (R14) -----------------------------------------------------------

export interface OpcionesBorrado {
  /** Borra los ficheros del bucket (fase 3). Sin él, una cuenta con ficheros no se borra. */
  borrarFicheros?: (claves: string[]) => Promise<void>;
  /** Clave del limitador de intentos de esta cuenta, para no dejar su contador. */
  claveIntentos?: string;
}

/**
 * Borra la cuenta y todo lo suyo (R14, C12). Primero los ficheros: si falla
 * el bucket, no se borra nada y se puede reintentar. Después la base de datos:
 * al borrar el usuario se borra en cascada todo lo que cuelga de él.
 */
export async function borrarCuenta(bd: Bd, usuarioId: string, opciones: OpcionesBorrado = {}): Promise<void> {
  const t = esquema;
  const ficheros = await bd.select({ clave: t.fichero.claveS3 }).from(t.fichero).where(eq(t.fichero.usuarioId, usuarioId));
  if (ficheros.length > 0) {
    if (!opciones.borrarFicheros) throw new Error("ALMACEN_NO_CONFIGURADO");
    await opciones.borrarFicheros(ficheros.map((f) => f.clave));
  }

  // Restos que no cuelgan del usuario: tokens pendientes y el contador de intentos.
  await bd.delete(t.verificacion).where(eq(t.verificacion.valor, usuarioId));
  if (opciones.claveIntentos) await bd.delete(t.intentoAcceso).where(eq(t.intentoAcceso.clave, opciones.claveIntentos));

  // Las líneas de reparto y las facturas protegen a sus inquilinos y ficheros
  // (no se pueden borrar sueltos). Postgres no garantiza el orden de la cascada,
  // así que se borran antes, de abajo arriba.
  const inmuebles = bd.select({ id: t.inmueble.id }).from(t.inmueble).where(eq(t.inmueble.usuarioId, usuarioId));
  const facturas = bd.select({ id: t.factura.id }).from(t.factura).where(inArray(t.factura.inmuebleId, inmuebles));
  const repartos = bd.select({ id: t.reparto.id }).from(t.reparto).where(inArray(t.reparto.facturaId, facturas));
  await bd.delete(t.repartoLinea).where(inArray(t.repartoLinea.repartoId, repartos));
  await bd.delete(t.factura).where(inArray(t.factura.inmuebleId, inmuebles));

  // El resto cuelga del usuario y se borra en cascada.
  await bd.delete(t.usuario).where(eq(t.usuario.id, usuarioId));
}
