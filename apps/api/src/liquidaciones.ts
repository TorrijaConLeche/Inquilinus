// Liquidaciones (spec 011): facturas repartidas agrupadas con número
// correlativo y nombre. Las funciones reciben un inmueble que ya se ha
// comprobado que es del usuario; todo se filtra además por él.
import type { EdicionLiquidacion, Liquidacion, NuevaLiquidacion, ParteGasto } from "@inquilinus/contracts";
import { estadoEnLiquidacion, nombreLiquidacion, validarFecha, validarFechaPago, validarNombre } from "@inquilinus/domain";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { conceptoParte, registrar } from "./actividad.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { ErrorPeticion } from "./errores.ts";
import { mesEnMadrid } from "./fechas.ts";
import { partesDeGastos, resumenesDeReparto } from "./repartos.ts";

/** Las liquidaciones del inmueble (todas, o solo `ids`) con sus facturas y lo de cada inquilino. */
export async function listarLiquidaciones(bd: ConexionBd, inmuebleId: string, ids?: string[]): Promise<Liquidacion[]> {
  if (ids && ids.length === 0) return [];
  const liquidaciones = await bd
    .select()
    .from(t.liquidacion)
    .where(and(eq(t.liquidacion.inmuebleId, inmuebleId), ...(ids ? [inArray(t.liquidacion.id, ids)] : [])))
    .orderBy(asc(t.liquidacion.numero));
  if (liquidaciones.length === 0) return [];
  const facturas = await bd
    .select({
      facturaId: t.factura.id,
      liquidacionId: t.factura.liquidacionId,
      tipoGastoId: t.factura.tipoGastoId,
      periodoInicio: t.factura.periodoInicio,
      periodoFin: t.factura.periodoFin,
      importeTotal: t.factura.importeTotal,
      nombreFichero: t.fichero.nombreOriginal,
    })
    .from(t.factura)
    .innerJoin(t.fichero, eq(t.fichero.id, t.factura.ficheroId))
    .where(inArray(t.factura.liquidacionId, liquidaciones.map((l) => l.id)))
    .orderBy(asc(t.factura.periodoInicio));
  const [partes, repartos] = await Promise.all([
    partesDeGastos(bd, [inmuebleId]),
    resumenesDeReparto(
      bd,
      facturas.map((f) => f.facturaId),
    ),
  ]);

  return liquidaciones.map((l) => {
    const suyas = facturas.filter((f) => f.liquidacionId === l.id);
    const deLaLiquidacion = partes.filter((p) => p.liquidacionId === l.id).map(({ inmuebleId: _, ...p }) => p);
    const inquilinos = [...new Set(deLaLiquidacion.map((p) => p.inquilinoId))].map((inquilinoId) => {
      const del = deLaLiquidacion.filter((p) => p.inquilinoId === inquilinoId);
      return { inquilinoId, ...estadoEnLiquidacion(del), partes: del };
    });
    return {
      id: l.id,
      numero: l.numero,
      nombre: l.nombre,
      mes: l.mes,
      facturas: suyas.map((f) => ({
        facturaId: f.facturaId,
        tipoGastoId: f.tipoGastoId,
        periodoInicio: f.periodoInicio!,
        periodoFin: f.periodoFin!,
        importeTotal: f.importeTotal!,
        nombreFichero: f.nombreFichero,
      })),
      total: suyas.reduce((s, f) => s + (f.importeTotal ?? 0), 0),
      sinOcupar: suyas.reduce((s, f) => s + (repartos.get(f.facturaId)?.sinOcupar.importe ?? 0), 0),
      inquilinos,
    };
  });
}

/** R3: las facturas tienen que ser del inmueble, estar repartidas y sueltas. Devuelve sus periodos. */
async function comprobarSueltas(bd: ConexionBd, inmuebleId: string, facturaIds: string[]) {
  const unicas = [...new Set(facturaIds)];
  const filas = await bd
    .select({
      id: t.factura.id,
      estado: t.factura.estado,
      liquidacionId: t.factura.liquidacionId,
      periodoInicio: t.factura.periodoInicio,
      periodoFin: t.factura.periodoFin,
    })
    .from(t.factura)
    .where(and(eq(t.factura.inmuebleId, inmuebleId), inArray(t.factura.id, unicas)));
  if (filas.length !== unicas.length) throw new ErrorPeticion("FACTURA_DESCONOCIDA");
  if (filas.some((f) => f.estado !== "repartida")) throw new ErrorPeticion("FACTURA_NO_REPARTIDA");
  // C4: una factura está como mucho en una liquidación.
  if (filas.some((f) => f.liquidacionId !== null)) throw new ErrorPeticion("FACTURA_EN_LIQUIDACION");
  return filas.map((f) => ({ inicio: f.periodoInicio!, fin: f.periodoFin! }));
}

/**
 * R1–R5: crea una liquidación con facturas repartidas y sueltas. Número
 * correlativo del inmueble que nunca se reutiliza; sin nombre, el automático
 * en el idioma de la app (R2b). Pertenece al mes en que se crea (R11).
 */
export async function crearLiquidacion(
  bd: ConexionBd,
  inmuebleId: string,
  nueva: NuevaLiquidacion,
  ahora: Date,
): Promise<Liquidacion> {
  const periodos = await comprobarSueltas(bd, inmuebleId, nueva.facturaIds);
  const nombrePropio = nueva.nombre?.trim();
  // R1: se reserva el número aunque algo falle después; nunca se reutiliza.
  const [inmueble] = await bd
    .update(t.inmueble)
    .set({ ultimoNumeroLiquidacion: sql`${t.inmueble.ultimoNumeroLiquidacion} + 1` })
    .where(eq(t.inmueble.id, inmuebleId))
    .returning({ numero: t.inmueble.ultimoNumeroLiquidacion });
  const numero = inmueble!.numero;
  const [creada] = await bd
    .insert(t.liquidacion)
    .values({
      inmuebleId,
      numero,
      nombre: nombrePropio || nombreLiquidacion(numero, periodos, nueva.idioma ?? "es"),
      mes: mesEnMadrid(ahora),
    })
    .returning({ id: t.liquidacion.id });
  await bd
    .update(t.factura)
    .set({ liquidacionId: creada!.id, actualizadoEn: new Date() })
    .where(and(inArray(t.factura.id, nueva.facturaIds), isNull(t.factura.liquidacionId)));
  const liquidacion = (await listarLiquidaciones(bd, inmuebleId, [creada!.id]))[0]!;
  // Spec 012: la liquidación creada queda en el histórico.
  await registrar(bd, {
    inmuebleId,
    tipo: "liquidacion_creada",
    detalle: {
      liquidacionId: liquidacion.id,
      nombre: liquidacion.nombre,
      importe: liquidacion.total,
      facturaIds: liquidacion.facturas.map((f) => f.facturaId),
    },
  });
  return liquidacion;
}

/** ¿Tiene ya alguna parte pagada? (R6) */
async function conPagos(bd: ConexionBd, liquidacionId: string): Promise<boolean> {
  const [fila] = await bd
    .select({ id: t.repartoLinea.id })
    .from(t.repartoLinea)
    .innerJoin(t.reparto, eq(t.reparto.id, t.repartoLinea.repartoId))
    .innerJoin(t.factura, eq(t.factura.id, t.reparto.facturaId))
    .where(and(eq(t.factura.liquidacionId, liquidacionId), isNotNull(t.repartoLinea.pagadoEn)))
    .limit(1);
  return fila !== undefined;
}

/**
 * R2, R6 y R6b: renombrar, añadir o quitar facturas. Con partes pagadas,
 * cambiar las facturas pide confirmar (las pagadas siguen pagadas). Nunca se
 * queda vacía. Devuelve null si no es de este inmueble.
 */
export async function editarLiquidacion(
  bd: ConexionBd,
  inmuebleId: string,
  liquidacionId: string,
  edicion: EdicionLiquidacion,
): Promise<Liquidacion | null> {
  const [liquidacion] = await bd
    .select({ id: t.liquidacion.id, nombre: t.liquidacion.nombre })
    .from(t.liquidacion)
    .where(and(eq(t.liquidacion.id, liquidacionId), eq(t.liquidacion.inmuebleId, inmuebleId)));
  if (!liquidacion) return null;
  const anadir = edicion.anadir ?? [];
  const quitar = edicion.quitar ?? [];

  if (anadir.length + quitar.length > 0) {
    if (anadir.length > 0) await comprobarSueltas(bd, inmuebleId, anadir);
    const actuales = await bd
      .select({ id: t.factura.id })
      .from(t.factura)
      .where(eq(t.factura.liquidacionId, liquidacionId));
    const quedan = actuales.filter((f) => !quitar.includes(f.id)).length + new Set(anadir).size;
    if (quedan === 0) throw new ErrorPeticion("LIQUIDACION_VACIA");
    if (!edicion.confirmar && (await conPagos(bd, liquidacionId))) throw new ErrorPeticion("CONFIRMACION_NECESARIA");
    if (quitar.length > 0) {
      await bd
        .update(t.factura)
        .set({ liquidacionId: null, actualizadoEn: new Date() })
        .where(and(eq(t.factura.liquidacionId, liquidacionId), inArray(t.factura.id, quitar)));
    }
    if (anadir.length > 0) {
      await bd
        .update(t.factura)
        .set({ liquidacionId, actualizadoEn: new Date() })
        .where(and(eq(t.factura.inmuebleId, inmuebleId), inArray(t.factura.id, anadir), isNull(t.factura.liquidacionId)));
    }
  }
  if (edicion.nombre !== undefined) {
    await bd
      .update(t.liquidacion)
      .set({ nombre: validarNombre(edicion.nombre, "de la liquidación"), actualizadoEn: new Date() })
      .where(eq(t.liquidacion.id, liquidacionId));
  }
  const editada = (await listarLiquidaciones(bd, inmuebleId, [liquidacionId]))[0]!;
  // Spec 012: cada cambio, en el histórico.
  const base = { liquidacionId, nombre: editada.nombre };
  await registrar(
    bd,
    ...[
      quitar.length > 0
        ? { inmuebleId, tipo: "liquidacion_factura_quitada" as const, detalle: { ...base, facturaIds: quitar, importe: editada.total } }
        : null,
      anadir.length > 0
        ? { inmuebleId, tipo: "liquidacion_factura_anadida" as const, detalle: { ...base, facturaIds: anadir, importe: editada.total } }
        : null,
      editada.nombre !== liquidacion.nombre
        ? { inmuebleId, tipo: "liquidacion_renombrada" as const, detalle: { ...base, nombreAntes: liquidacion.nombre } }
        : null,
    ].filter((a) => a !== null),
  );
  return editada;
}

/** R7: sus facturas quedan sueltas (la clave ajena las suelta) y los pagos se conservan. */
export async function borrarLiquidacion(bd: ConexionBd, inmuebleId: string, liquidacionId: string): Promise<boolean> {
  const borradas = await bd
    .delete(t.liquidacion)
    .where(and(eq(t.liquidacion.id, liquidacionId), eq(t.liquidacion.inmuebleId, inmuebleId)))
    .returning({ id: t.liquidacion.id, nombre: t.liquidacion.nombre });
  if (borradas.length > 0) {
    await registrar(bd, { inmuebleId, tipo: "liquidacion_borrada", detalle: { liquidacionId, nombre: borradas[0]!.nombre } });
  }
  return borradas.length > 0;
}

/**
 * R10: «Marcar pagada» para un inquilino: sus partes pendientes de la
 * liquidación, con la fecha indicada (por defecto, hoy). Devuelve las marcadas
 * para poder deshacerlo, o null si la liquidación no es de este inmueble.
 */
export async function pagarLiquidacion(
  bd: ConexionBd,
  inmuebleId: string,
  liquidacionId: string,
  pago: { inquilinoId: string; fecha?: string | undefined },
  hoy: string,
): Promise<ParteGasto[] | null> {
  const [liquidacion] = await bd
    .select({ id: t.liquidacion.id, nombre: t.liquidacion.nombre })
    .from(t.liquidacion)
    .where(and(eq(t.liquidacion.id, liquidacionId), eq(t.liquidacion.inmuebleId, inmuebleId)));
  if (!liquidacion) return null;
  const fecha = validarFechaPago(validarFecha(pago.fecha ?? hoy), hoy);
  const pendientes = (await partesDeGastos(bd, [inmuebleId])).filter(
    (p) => p.liquidacionId === liquidacionId && p.inquilinoId === pago.inquilinoId && p.pagadoEn === null,
  );
  if (pendientes.length === 0) return [];
  await bd
    .update(t.repartoLinea)
    .set({ pagadoEn: fecha, actualizadoEn: new Date() })
    .where(inArray(t.repartoLinea.id, pendientes.map((p) => p.id)));
  await registrar(bd, {
    inmuebleId,
    tipo: "liquidacion_pagada",
    inquilinoId: pago.inquilinoId,
    detalle: {
      liquidacionId,
      nombre: liquidacion.nombre,
      fecha,
      importe: pendientes.reduce((s, p) => s + p.importe, 0),
      conceptos: pendientes.map(conceptoParte),
    },
  });
  return pendientes.map(({ inmuebleId: _, ...p }) => ({ ...p, pagadoEn: fecha }));
}
