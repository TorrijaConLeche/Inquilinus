// Facturas de suministros (spec 003): subida múltiple al bucket privado,
// lectura con IA si está activada y lista por revisar. Las funciones reciben
// un inmueble que ya se ha comprobado que es del usuario; todo se filtra por él.
import type { EdicionFactura, Factura, PermisoSubida } from "@inquilinus/contracts";
import {
  aDia,
  ErrorValidacion,
  facturasSolapadas,
  normalizarLectura,
  validarConfirmacion,
  validarDocumento,
  validarTamanoLote,
  type PropuestaFactura,
} from "@inquilinus/domain";
import { and, asc, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { claveFactura, clavePendiente, type Almacen } from "./almacen.ts";
import { ejecutarEnBloque } from "./bd/bloque.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { prepararSubida, SEGUNDOS_PERMISO } from "./documentos.ts";
import { ErrorPeticion } from "./errores.ts";
import { leerConLimite, type ExtractorFacturas } from "./extractor.ts";

/** R13: las que faltan por confirmar. */
const POR_REVISAR = ["subida", "propuesta", "error_extraccion"] as const;

type FilaFactura = typeof t.factura.$inferSelect & { nombreFichero: string };

function aFactura(fila: FilaFactura): Factura {
  const propuesta = fila.propuestaIa as PropuestaFactura | null;
  return {
    id: fila.id,
    lote: fila.lote,
    estado: fila.estado,
    nombreFichero: fila.nombreFichero,
    tipoGastoId: fila.tipoGastoId,
    periodoInicio: fila.periodoInicio,
    periodoFin: fila.periodoFin,
    importeTotal: fila.importeTotal,
    propuestaIa: propuesta
      ? { inicio: propuesta.inicio, fin: propuesta.fin, importe: propuesta.importe, tipoGastoId: propuesta.tipoGastoId }
      : null,
    subidaEn: fila.creadoEn.toISOString(),
  };
}

function consultaFacturas(bd: ConexionBd) {
  return bd
    .select({
      id: t.factura.id,
      inmuebleId: t.factura.inmuebleId,
      tipoGastoId: t.factura.tipoGastoId,
      ficheroId: t.factura.ficheroId,
      lote: t.factura.lote,
      liquidacionId: t.factura.liquidacionId,
      periodoInicio: t.factura.periodoInicio,
      periodoFin: t.factura.periodoFin,
      importeTotal: t.factura.importeTotal,
      estado: t.factura.estado,
      propuestaIa: t.factura.propuestaIa,
      creadoEn: t.factura.creadoEn,
      actualizadoEn: t.factura.actualizadoEn,
      nombreFichero: t.fichero.nombreOriginal,
    })
    .from(t.factura)
    .innerJoin(t.fichero, eq(t.fichero.id, t.factura.ficheroId));
}

/** R13: facturas del inmueble, las más recientes primero dentro de cada lote. */
export async function listarFacturas(bd: ConexionBd, inmuebleId: string, opciones: { porRevisar: boolean }): Promise<Factura[]> {
  const filas = await consultaFacturas(bd)
    .where(
      and(eq(t.factura.inmuebleId, inmuebleId), ...(opciones.porRevisar ? [inArray(t.factura.estado, [...POR_REVISAR])] : [])),
    )
    .orderBy(asc(t.factura.creadoEn), asc(t.fichero.nombreOriginal));
  return filas.map(aFactura);
}

/** R1 y R16: un permiso firmado por PDF, de 1 a 20. */
export async function prepararSubidasFacturas(
  almacen: Almacen,
  usuarioId: string,
  cantidad: number,
  ahora: Date,
): Promise<(PermisoSubida & { subidaId: string })[]> {
  validarTamanoLote(cantidad);
  return Promise.all(Array.from({ length: cantidad }, () => prepararSubida(almacen, usuarioId, ahora)));
}

/** Quita rutas y caracteres de control del nombre que manda el navegador. */
function limpiarNombre(nombre: string): string {
  const base = nombre.split(/[/\\]/).at(-1) ?? "";
  const limpio = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return limpio || "factura.pdf";
}

interface Aceptada {
  facturaId: string;
  contenido: Uint8Array;
}

/**
 * R1, R8, R8b y R12: registra un lote de PDF ya subidos. Cada uno se comprueba
 * por separado (un fichero no válido no afecta al resto), se mueve a su sitio
 * definitivo y queda por revisar. Si hay extractor, los lee todos a la vez; si
 * falla o tarda más de 60 s, esa factura queda para rellenar a mano.
 */
export async function crearFacturas(
  bd: ConexionBd,
  almacen: Almacen,
  extractor: ExtractorFacturas | undefined,
  datos: { usuarioId: string; inmuebleId: string; subidas: { subidaId: string; nombre: string }[] },
): Promise<{ lote: string; facturas: Factura[]; rechazadas: { nombre: string; error: string }[] }> {
  validarTamanoLote(datos.subidas.length);
  const lote = crypto.randomUUID();
  const rechazadas: { nombre: string; error: string }[] = [];

  const resultados = await Promise.all(
    datos.subidas.map(async ({ subidaId, nombre }): Promise<Aceptada | null> => {
      const pendiente = clavePendiente(datos.usuarioId, subidaId);
      const nombreLimpio = limpiarNombre(nombre);
      const contenido = await almacen.leer(pendiente);
      if (!contenido) {
        rechazadas.push({ nombre: nombreLimpio, error: "SUBIDA_NO_ENCONTRADA" });
        return null;
      }
      try {
        validarDocumento(contenido);
      } catch {
        await almacen.borrar([pendiente]);
        rechazadas.push({ nombre: nombreLimpio, error: "FICHERO_INVALIDO" });
        return null;
      }

      const ficheroId = crypto.randomUUID();
      const facturaId = crypto.randomUUID();
      const clave = claveFactura(datos.usuarioId, ficheroId);
      await almacen.copiar(pendiente, clave);
      await almacen.borrar([pendiente]);
      try {
        await ejecutarEnBloque(bd, (db) => [
          db.insert(t.fichero).values({
            id: ficheroId,
            usuarioId: datos.usuarioId,
            claveS3: clave,
            nombreOriginal: nombreLimpio,
            mime: "application/pdf",
            tamanoBytes: contenido.length,
            sha256: createHash("sha256").update(contenido).digest("hex"),
          }),
          db.insert(t.factura).values({ id: facturaId, inmuebleId: datos.inmuebleId, ficheroId, lote, estado: "subida" }),
        ]);
      } catch (error) {
        await almacen.borrar([clave]);
        throw error;
      }
      return { facturaId, contenido };
    }),
  );
  const aceptadas = resultados.filter((r): r is Aceptada => r !== null);

  // R2, R8 y R12: lectura en paralelo; una que falla no para a las demás.
  if (extractor && aceptadas.length > 0) {
    const tipos = await bd
      .select({ id: t.tipoGasto.id, nombre: t.tipoGasto.nombre })
      .from(t.tipoGasto)
      .where(and(eq(t.tipoGasto.inmuebleId, datos.inmuebleId), eq(t.tipoGasto.archivado, false)));
    const nombresTipos = tipos.map((tg) => tg.nombre);
    await Promise.all(
      aceptadas.map(async ({ facturaId, contenido }) => {
        try {
          const propuesta = normalizarLectura(await leerConLimite(extractor, contenido, nombresTipos), tipos);
          await bd
            .update(t.factura)
            .set({
              estado: "propuesta",
              propuestaIa: propuesta,
              tipoGastoId: propuesta.tipoGastoId,
              periodoInicio: propuesta.inicio,
              periodoFin: propuesta.fin,
              importeTotal: propuesta.importe,
              actualizadoEn: new Date(),
            })
            .where(eq(t.factura.id, facturaId));
        } catch {
          await bd.update(t.factura).set({ estado: "error_extraccion", actualizadoEn: new Date() }).where(eq(t.factura.id, facturaId));
        }
      }),
    );
  }

  const facturas =
    aceptadas.length === 0
      ? []
      : await consultaFacturas(bd)
          .where(inArray(t.factura.id, aceptadas.map((a) => a.facturaId)))
          .orderBy(asc(t.fichero.nombreOriginal));
  return { lote, facturas: facturas.map(aFactura), rechazadas };
}

async function facturaDe(bd: ConexionBd, inmuebleId: string, facturaId: string) {
  const [fila] = await bd
    .select({ estado: t.factura.estado, ficheroId: t.fichero.id, clave: t.fichero.claveS3, nombre: t.fichero.nombreOriginal })
    .from(t.factura)
    .innerJoin(t.fichero, eq(t.fichero.id, t.factura.ficheroId))
    .where(and(eq(t.factura.id, facturaId), eq(t.factura.inmuebleId, inmuebleId)));
  return fila ?? null;
}

/** URL firmada de 5 minutos para ver el PDF, o null si la factura no es de este inmueble. */
export async function urlPdfFactura(bd: ConexionBd, almacen: Almacen, inmuebleId: string, facturaId: string): Promise<string | null> {
  const factura = await facturaDe(bd, inmuebleId, facturaId);
  if (!factura) return null;
  return almacen.urlDescarga(factura.clave, { nombre: factura.nombre, segundos: SEGUNDOS_PERMISO });
}

/** R16: descarta una factura sin confirmar con su PDF. Devuelve false si no es de este inmueble. */
export async function descartarFactura(bd: ConexionBd, almacen: Almacen, inmuebleId: string, facturaId: string): Promise<boolean> {
  const factura = await facturaDe(bd, inmuebleId, facturaId);
  if (!factura) return false;
  if (!(POR_REVISAR as readonly string[]).includes(factura.estado)) throw new ErrorPeticion("FACTURA_CONFIRMADA");
  // Primero el bucket: si falla, no se borra nada y se puede reintentar.
  await almacen.borrar([factura.clave]);
  await ejecutarEnBloque(bd, (db) => [
    db.delete(t.factura).where(eq(t.factura.id, facturaId)),
    db.delete(t.fichero).where(eq(t.fichero.id, factura.ficheroId)),
  ]);
  return true;
}

// --- Revisión y confirmación (R5, R6, R9, R13, R14, R14b) ---------------------

/** R6 y R14: la factura se solapa con estas; la ruta responde 409 con ellas. */
export class ErrorSolape extends Error {
  readonly solapadas: Factura[];

  constructor(solapadas: Factura[]) {
    super("SOLAPE_FACTURAS");
    this.name = "ErrorSolape";
    this.solapadas = solapadas;
  }
}

async function porRevisarDe(bd: ConexionBd, inmuebleId: string, facturaId: string) {
  const [fila] = await consultaFacturas(bd).where(and(eq(t.factura.id, facturaId), eq(t.factura.inmuebleId, inmuebleId)));
  if (!fila) return null;
  if (!(POR_REVISAR as readonly string[]).includes(fila.estado)) throw new ErrorPeticion("FACTURA_CONFIRMADA");
  return fila;
}

/** R5: rellenar o corregir antes de confirmar. Devuelve null si la factura no es de este inmueble. */
export async function editarFactura(
  bd: ConexionBd,
  inmuebleId: string,
  facturaId: string,
  edicion: EdicionFactura,
): Promise<Factura | null> {
  const actual = await porRevisarDe(bd, inmuebleId, facturaId);
  if (!actual) return null;
  if (edicion.tipoGastoId) {
    const [tipo] = await bd
      .select({ id: t.tipoGasto.id })
      .from(t.tipoGasto)
      .where(and(eq(t.tipoGasto.id, edicion.tipoGastoId), eq(t.tipoGasto.inmuebleId, inmuebleId)));
    if (!tipo) throw new ErrorPeticion("TIPO_GASTO_DESCONOCIDO");
  }
  const cambios = {
    ...(edicion.tipoGastoId !== undefined && { tipoGastoId: edicion.tipoGastoId }),
    ...(edicion.periodoInicio !== undefined && { periodoInicio: edicion.periodoInicio }),
    ...(edicion.periodoFin !== undefined && { periodoFin: edicion.periodoFin }),
    ...(edicion.importeTotal !== undefined && { importeTotal: edicion.importeTotal }),
  };
  const inicio = cambios.periodoInicio !== undefined ? cambios.periodoInicio : actual.periodoInicio;
  const fin = cambios.periodoFin !== undefined ? cambios.periodoFin : actual.periodoFin;
  // Fechas que existen (aDia lanza FECHA_INVALIDA) y, R9, un periodo que no vaya al revés.
  const diaInicio = inicio ? aDia(inicio) : null;
  const diaFin = fin ? aDia(fin) : null;
  if (diaInicio !== null && diaFin !== null && diaFin < diaInicio) {
    throw new ErrorValidacion("PERIODO_INVALIDO", "La fecha de fin es anterior a la de inicio");
  }
  if (Object.keys(cambios).length > 0) {
    await bd.update(t.factura).set({ ...cambios, actualizadoEn: new Date() }).where(eq(t.factura.id, facturaId));
  }
  const [fila] = await consultaFacturas(bd).where(eq(t.factura.id, facturaId));
  return aFactura(fila!);
}

/** R6, R14 y R14b: las confirmadas del inmueble y las del mismo lote con tipo y periodo que se solapan. */
async function solapadasCon(
  bd: ConexionBd,
  inmuebleId: string,
  factura: { id: string; lote: string; tipoGastoId: string; inicio: string; fin: string },
): Promise<Factura[]> {
  const candidatas = await consultaFacturas(bd).where(
    and(
      eq(t.factura.inmuebleId, inmuebleId),
      eq(t.factura.tipoGastoId, factura.tipoGastoId),
      ne(t.factura.id, factura.id),
      isNotNull(t.factura.periodoInicio),
      isNotNull(t.factura.periodoFin),
      or(inArray(t.factura.estado, ["confirmada", "repartida"]), eq(t.factura.lote, factura.lote)),
    ),
  );
  const ids = facturasSolapadas(
    factura,
    candidatas.map((c) => ({ id: c.id, tipoGastoId: c.tipoGastoId!, inicio: c.periodoInicio!, fin: c.periodoFin! })),
  );
  return candidatas.filter((c) => ids.includes(c.id)).map(aFactura);
}

/**
 * R6, R9 y R14: confirma una factura completa. Si se solapa con otras del
 * mismo tipo, lanza ErrorSolape salvo que la usuaria haya decidido continuar.
 * Devuelve null si la factura no es de este inmueble.
 */
export async function confirmarFactura(
  bd: ConexionBd,
  inmuebleId: string,
  facturaId: string,
  continuarConSolapes: boolean,
): Promise<Factura | null> {
  const actual = await porRevisarDe(bd, inmuebleId, facturaId);
  if (!actual) return null;
  const valida = validarConfirmacion({
    tipoGastoId: actual.tipoGastoId,
    inicio: actual.periodoInicio,
    fin: actual.periodoFin,
    importe: actual.importeTotal,
  });
  const solapadas = await solapadasCon(bd, inmuebleId, { id: facturaId, lote: actual.lote, ...valida });
  if (solapadas.length > 0 && !continuarConSolapes) throw new ErrorSolape(solapadas);
  await bd.update(t.factura).set({ estado: "confirmada", actualizadoEn: new Date() }).where(eq(t.factura.id, facturaId));
  const [fila] = await consultaFacturas(bd).where(eq(t.factura.id, facturaId));
  return aFactura(fila!);
}

/**
 * R13 y R14b: «Confirmar todas». Confirma, en orden de subida, las completas y
 * sin solapes; las incompletas y las que se solapan siguen por revisar.
 */
export async function confirmarTodas(
  bd: ConexionBd,
  inmuebleId: string,
  lote: string | undefined,
): Promise<{ confirmadas: Factura[]; pendientes: { id: string; motivo: "incompleta" | "solape"; solapadas: string[] }[] }> {
  const porRevisar = (await listarFacturas(bd, inmuebleId, { porRevisar: true })).filter((f) => !lote || f.lote === lote);
  const confirmadas: Factura[] = [];
  const pendientes: { id: string; motivo: "incompleta" | "solape"; solapadas: string[] }[] = [];
  for (const factura of porRevisar) {
    try {
      const confirmada = await confirmarFactura(bd, inmuebleId, factura.id, false);
      if (confirmada) confirmadas.push(confirmada);
    } catch (error) {
      if (error instanceof ErrorSolape) {
        pendientes.push({ id: factura.id, motivo: "solape", solapadas: error.solapadas.map((s) => s.id) });
      } else if (error instanceof ErrorValidacion) {
        pendientes.push({ id: factura.id, motivo: "incompleta", solapadas: [] });
      } else {
        throw error;
      }
    }
  }
  return { confirmadas, pendientes };
}
