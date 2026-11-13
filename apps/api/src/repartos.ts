// Reparto guardado de una factura (spec 001, R10–R15): se crea al confirmarla,
// cada parte tiene su pago, un cambio de estancias lo deja desactualizado y
// recalcular o deshacer son acciones explícitas. Las funciones reciben un
// inmueble que ya se ha comprobado que es del usuario; todo se filtra por él.
import type { ParteGasto, ParteReparto, RepartoFactura, ResumenReparto } from "@inquilinus/contracts";
import {
  repartirSuministro,
  validarFecha,
  validarFechaPago,
  type ResultadoRepartoSuministro,
  type TramoReparto,
} from "@inquilinus/domain";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { ejecutarEnBloque } from "./bd/bloque.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { ErrorPeticion } from "./errores.ts";
import { mesEnMadrid } from "./fechas.ts";

/** Lo guardado en `reparto.detalle`: el detalle por tramos (spec 004) y lo sin ocupar. */
interface Detalle {
  tramos: TramoReparto[];
  sinOcupar: { dias: number; importe: number };
}

type Ocupaciones = Parameters<typeof repartirSuministro>[0]["ocupaciones"];

/** Las estancias del inmueble, para repartir sus facturas. */
export async function ocupacionesDe(bd: ConexionBd, inmuebleId: string): Promise<Ocupaciones> {
  return bd
    .select({
      habitacionId: t.ocupacion.habitacionId,
      inquilinoId: t.ocupacion.inquilinoId,
      entrada: t.ocupacion.entrada,
      salida: t.ocupacion.salida,
    })
    .from(t.ocupacion)
    .where(eq(t.ocupacion.inmuebleId, inmuebleId));
}

/** Spec 001: el reparto de una factura con unas estancias. */
export function calcularReparto(
  factura: { periodoInicio: string; periodoFin: string; importeTotal: number },
  ocupaciones: Ocupaciones,
): ResultadoRepartoSuministro {
  return repartirSuministro({
    inicio: factura.periodoInicio,
    fin: factura.periodoFin,
    importe: factura.importeTotal,
    ocupaciones,
  });
}

/** Filas para guardar un reparto: una por inquilino y, si hay, una sin inquilino para lo sin ocupar. */
function lineasDe(repartoId: string, resultado: ResultadoRepartoSuministro, pagos: Map<string, string | null> = new Map()) {
  return [
    ...resultado.lineas.map((l) => ({
      repartoId,
      inquilinoId: l.inquilinoId,
      dias: l.dias,
      importe: l.importe,
      pagadoEn: pagos.get(l.inquilinoId) ?? null,
    })),
    ...(resultado.sinOcupar.dias > 0 || resultado.sinOcupar.importe > 0
      ? [{ repartoId, inquilinoId: null, dias: resultado.sinOcupar.dias, importe: resultado.sinOcupar.importe, pagadoEn: null }]
      : []),
  ];
}

const detalleDe = (r: ResultadoRepartoSuministro): Detalle => ({ tramos: r.tramos, sinOcupar: r.sinOcupar });

/**
 * R10: reparte una factura confirmada con las estancias de ahora y la deja
 * `repartida`, todo o nada. La factura ya está validada (spec 003, R9).
 */
export async function crearReparto(
  bd: ConexionBd,
  inmuebleId: string,
  factura: { id: string; periodoInicio: string; periodoFin: string; importeTotal: number },
  ahora: Date,
): Promise<void> {
  const resultado = calcularReparto(factura, await ocupacionesDe(bd, inmuebleId));
  const repartoId = crypto.randomUUID();
  await ejecutarEnBloque(bd, (db) => [
    db.update(t.factura).set({ estado: "repartida", actualizadoEn: new Date() }).where(eq(t.factura.id, factura.id)),
    // R12: la fecha del reparto (su mes) la pone el reloj de la app.
    db.insert(t.reparto).values({ id: repartoId, facturaId: factura.id, detalle: detalleDe(resultado), creadoEn: ahora, calculadoEn: ahora }),
    db.insert(t.repartoLinea).values(lineasDe(repartoId, resultado)),
  ]);
}

/** Resúmenes de los repartos de varias facturas, por id de factura. */
export async function resumenesDeReparto(bd: ConexionBd, facturaIds: string[]): Promise<Map<string, ResumenReparto>> {
  const resumenes = new Map<string, ResumenReparto>();
  if (facturaIds.length === 0) return resumenes;
  const repartos = await bd.select().from(t.reparto).where(inArray(t.reparto.facturaId, facturaIds));
  if (repartos.length === 0) return resumenes;
  const lineas = await bd
    .select()
    .from(t.repartoLinea)
    .where(inArray(t.repartoLinea.repartoId, repartos.map((r) => r.id)));
  for (const r of repartos) {
    const suyas = lineas.filter((l) => l.repartoId === r.id);
    const sinOcupar = suyas.find((l) => l.inquilinoId === null);
    resumenes.set(r.facturaId, {
      mes: mesEnMadrid(r.creadoEn),
      desactualizado: r.desactualizado,
      sinOcupar: { dias: sinOcupar?.dias ?? 0, importe: sinOcupar?.importe ?? 0 },
      partes: suyas
        .filter((l) => l.inquilinoId !== null)
        .map((l) => ({ id: l.id, inquilinoId: l.inquilinoId!, dias: l.dias, importe: l.importe, pagadoEn: l.pagadoEn })),
    });
  }
  return resumenes;
}

/** El reparto de una factura del inmueble con su detalle, o null si no hay. */
export async function verReparto(bd: ConexionBd, inmuebleId: string, facturaId: string): Promise<RepartoFactura | null> {
  const [reparto] = await bd
    .select({ id: t.reparto.id, calculadoEn: t.reparto.calculadoEn, detalle: t.reparto.detalle })
    .from(t.reparto)
    .innerJoin(t.factura, eq(t.factura.id, t.reparto.facturaId))
    .where(and(eq(t.reparto.facturaId, facturaId), eq(t.factura.inmuebleId, inmuebleId)));
  if (!reparto) return null;
  const resumen = (await resumenesDeReparto(bd, [facturaId])).get(facturaId)!;
  const detalle = reparto.detalle as Detalle;
  return { ...resumen, calculadoEn: reparto.calculadoEn.toISOString(), tramos: detalle.tramos };
}

/** Datos de la factura repartida del inmueble que hacen falta para recalcular o deshacer. */
async function repartoDe(bd: ConexionBd, inmuebleId: string, facturaId: string) {
  const [fila] = await bd
    .select({
      repartoId: t.reparto.id,
      periodoInicio: t.factura.periodoInicio,
      periodoFin: t.factura.periodoFin,
      importeTotal: t.factura.importeTotal,
      propuestaIa: t.factura.propuestaIa,
    })
    .from(t.factura)
    .innerJoin(t.reparto, eq(t.reparto.facturaId, t.factura.id))
    .where(and(eq(t.factura.id, facturaId), eq(t.factura.inmuebleId, inmuebleId)));
  if (!fila) return null;
  const pagadas = await bd
    .select({ inquilinoId: t.repartoLinea.inquilinoId, pagadoEn: t.repartoLinea.pagadoEn })
    .from(t.repartoLinea)
    .where(and(eq(t.repartoLinea.repartoId, fila.repartoId), isNotNull(t.repartoLinea.pagadoEn)));
  return { ...fila, pagadas };
}

/**
 * R13: pone las partes del cálculo actual. Cada inquilino conserva su estado
 * de pago; si alguna parte está pagada, hace falta confirmar. Devuelve false si
 * la factura no está repartida en este inmueble.
 */
export async function recalcularReparto(bd: ConexionBd, inmuebleId: string, facturaId: string, confirmado: boolean): Promise<boolean> {
  const actual = await repartoDe(bd, inmuebleId, facturaId);
  if (!actual) return false;
  if (actual.pagadas.length > 0 && !confirmado) throw new ErrorPeticion("CONFIRMACION_NECESARIA");
  const resultado = calcularReparto(
    { periodoInicio: actual.periodoInicio!, periodoFin: actual.periodoFin!, importeTotal: actual.importeTotal! },
    await ocupacionesDe(bd, inmuebleId),
  );
  const pagos = new Map(actual.pagadas.map((p) => [p.inquilinoId!, p.pagadoEn]));
  await ejecutarEnBloque(bd, (db) => [
    db.delete(t.repartoLinea).where(eq(t.repartoLinea.repartoId, actual.repartoId)),
    db.insert(t.repartoLinea).values(lineasDe(actual.repartoId, resultado, pagos)),
    // R12: el reparto conserva su fecha de creación (su mes); solo cambia la del cálculo.
    db
      .update(t.reparto)
      .set({ detalle: detalleDe(resultado), calculadoEn: new Date(), desactualizado: false, actualizadoEn: new Date() })
      .where(eq(t.reparto.id, actual.repartoId)),
  ]);
  return true;
}

/**
 * R14: la factura vuelve a «por revisar» con sus datos y se borra su reparto.
 * Con partes pagadas (esos pagos se pierden), hace falta confirmar.
 */
export async function deshacerReparto(bd: ConexionBd, inmuebleId: string, facturaId: string, confirmado: boolean): Promise<boolean> {
  const actual = await repartoDe(bd, inmuebleId, facturaId);
  if (!actual) return false;
  if (actual.pagadas.length > 0 && !confirmado) throw new ErrorPeticion("CONFIRMACION_NECESARIA");
  await ejecutarEnBloque(bd, (db) => [
    // Al borrar el reparto se borran en cascada sus partes.
    db.delete(t.reparto).where(eq(t.reparto.id, actual.repartoId)),
    db
      .update(t.factura)
      .set({ estado: actual.propuestaIa ? "propuesta" : "subida", actualizadoEn: new Date() })
      .where(eq(t.factura.id, facturaId)),
  ]);
  return true;
}

/** R11: marcar una parte pagada (fecha no posterior a hoy) o pendiente. Devuelve null si no es de este inmueble. */
export async function marcarParte(
  bd: ConexionBd,
  inmuebleId: string,
  parteId: string,
  pagadoEn: string | null,
  hoy: string,
): Promise<ParteReparto | null> {
  const [parte] = await bd
    .select({ id: t.repartoLinea.id })
    .from(t.repartoLinea)
    .innerJoin(t.reparto, eq(t.reparto.id, t.repartoLinea.repartoId))
    .innerJoin(t.factura, eq(t.factura.id, t.reparto.facturaId))
    .where(and(eq(t.repartoLinea.id, parteId), eq(t.factura.inmuebleId, inmuebleId), isNotNull(t.repartoLinea.inquilinoId)));
  if (!parte) return null;
  const fecha = pagadoEn === null ? null : validarFechaPago(validarFecha(pagadoEn), hoy);
  const [fila] = await bd
    .update(t.repartoLinea)
    .set({ pagadoEn: fecha, actualizadoEn: new Date() })
    .where(eq(t.repartoLinea.id, parteId))
    .returning();
  return { id: fila!.id, inquilinoId: fila!.inquilinoId!, dias: fila!.dias, importe: fila!.importe, pagadoEn: fila!.pagadoEn };
}

/**
 * Partes de gastos del inmueble (spec 009, R8), con su factura y su mes (R12).
 * Sin lo sin ocupar, que no es de ningún inquilino.
 */
export async function partesDeGastos(bd: ConexionBd, inmuebleIds: string[]): Promise<(ParteGasto & { inmuebleId: string })[]> {
  if (inmuebleIds.length === 0) return [];
  const filas = await bd
    .select({
      id: t.repartoLinea.id,
      inquilinoId: t.repartoLinea.inquilinoId,
      dias: t.repartoLinea.dias,
      importe: t.repartoLinea.importe,
      pagadoEn: t.repartoLinea.pagadoEn,
      facturaId: t.factura.id,
      inmuebleId: t.factura.inmuebleId,
      tipoGastoId: t.factura.tipoGastoId,
      periodoInicio: t.factura.periodoInicio,
      periodoFin: t.factura.periodoFin,
      creadoEn: t.reparto.creadoEn,
    })
    .from(t.repartoLinea)
    .innerJoin(t.reparto, eq(t.reparto.id, t.repartoLinea.repartoId))
    .innerJoin(t.factura, eq(t.factura.id, t.reparto.facturaId))
    .where(and(inArray(t.factura.inmuebleId, inmuebleIds), isNotNull(t.repartoLinea.inquilinoId)));
  return filas.map((f) => ({
    id: f.id,
    inquilinoId: f.inquilinoId!,
    dias: f.dias,
    importe: f.importe,
    pagadoEn: f.pagadoEn,
    facturaId: f.facturaId,
    inmuebleId: f.inmuebleId,
    tipoGastoId: f.tipoGastoId,
    periodoInicio: f.periodoInicio!,
    periodoFin: f.periodoFin!,
    mes: mesEnMadrid(f.creadoEn),
  }));
}

/** Lo sin ocupar de las facturas del inmueble repartidas en un mes (spec 009, R11). */
export async function sinOcuparDelMes(bd: ConexionBd, inmuebleId: string, mes: string): Promise<number> {
  const filas = await bd
    .select({ importe: t.repartoLinea.importe, creadoEn: t.reparto.creadoEn })
    .from(t.repartoLinea)
    .innerJoin(t.reparto, eq(t.reparto.id, t.repartoLinea.repartoId))
    .innerJoin(t.factura, eq(t.factura.id, t.reparto.facturaId))
    .where(and(eq(t.factura.inmuebleId, inmuebleId), isNull(t.repartoLinea.inquilinoId)));
  return filas.filter((f) => mesEnMadrid(f.creadoEn) === mes).reduce((s, f) => s + f.importe, 0);
}

/** Spec 009, R10: marca pagadas (con una fecha ya validada) las partes pendientes de un inquilino en un mes. */
export async function pagarPartesDelMes(
  bd: ConexionBd,
  inmuebleId: string,
  inquilinoId: string,
  mes: string,
  fecha: string,
): Promise<ParteGasto[]> {
  const pendientes = (await partesDeGastos(bd, [inmuebleId])).filter(
    (p) => p.inquilinoId === inquilinoId && p.mes === mes && p.pagadoEn === null,
  );
  if (pendientes.length === 0) return [];
  await bd
    .update(t.repartoLinea)
    .set({ pagadoEn: fecha, actualizadoEn: new Date() })
    .where(inArray(t.repartoLinea.id, pendientes.map((p) => p.id)));
  return pendientes.map(({ inmuebleId: _, ...p }) => ({ ...p, pagadoEn: fecha }));
}

/** Repartos vigentes del inmueble con lo necesario para recalcularlos (R13). */
export async function repartosVigilados(bd: ConexionBd, inmuebleId: string) {
  return bd
    .select({
      repartoId: t.reparto.id,
      periodoInicio: t.factura.periodoInicio,
      periodoFin: t.factura.periodoFin,
      importeTotal: t.factura.importeTotal,
    })
    .from(t.reparto)
    .innerJoin(t.factura, eq(t.factura.id, t.reparto.facturaId))
    .where(and(eq(t.factura.inmuebleId, inmuebleId), eq(t.reparto.desactualizado, false)));
}
