// Histórico del inmueble (spec 012): registrar actividades y leerlas con
// filtros. Solo se añade; nada se edita ni se borra (R3). Las funciones de
// lectura reciben un inmueble que ya se ha comprobado que es del usuario.
import type { Actividad, DetalleActividad, FiltrosHistorico, Historico, TipoActividad } from "@inquilinus/contracts";
import { filtrarHistorico, grupoDe, hayFiltros, resumenHistorico, type ConceptoActividad } from "@inquilinus/domain";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { hoyEnMadrid } from "./fechas.ts";

export interface NuevaActividad {
  inmuebleId: string;
  tipo: TipoActividad;
  inquilinoId?: string | null | undefined;
  tipoGastoId?: string | null | undefined;
  detalle: DetalleActividad;
}

/** Añade actividades al histórico. Nunca se editan ni se borran (R3). */
export async function registrar(bd: ConexionBd, ...actividades: NuevaActividad[]): Promise<void> {
  if (actividades.length === 0) return;
  await bd.insert(t.actividad).values(
    actividades.map((a) => ({
      inmuebleId: a.inmuebleId,
      tipo: a.tipo,
      inquilinoId: a.inquilinoId ?? null,
      tipoGastoId: a.tipoGastoId ?? null,
      detalle: a.detalle,
    })),
  );
}

const DE_ALQUILER = new Set<TipoActividad>([
  "cobro_generado",
  "cobro_editado",
  "cobro_movido",
  "cobro_quitado",
  "cobro_restaurado",
  "cobro_recalculado",
  "cobro_pagado",
  "cobro_desmarcado",
]);

/** R6: `alquiler`, el tipo de gasto, o null si la actividad no es de dinero o mezcla varios. */
function gastoDe(tipo: TipoActividad, tipoGastoId: string | null): string | null {
  if (DE_ALQUILER.has(tipo)) return "alquiler";
  // Crear o archivar un tipo de gasto es del inmueble, no un movimiento de dinero (C3).
  return grupoDe(tipo) === "inmueble" ? null : tipoGastoId;
}

/**
 * R5–R7b: el histórico del inmueble, lo más reciente primero, filtrado y con
 * el resumen de lo filtrado. El estado de pago es el de hoy de cada concepto.
 */
export async function listarHistorico(bd: ConexionBd, inmuebleId: string, f: FiltrosHistorico = {}): Promise<Historico> {
  const filas = await bd
    .select()
    .from(t.actividad)
    .where(eq(t.actividad.inmuebleId, inmuebleId))
    .orderBy(desc(t.actividad.ocurridaEn), desc(t.actividad.creadoEn));

  // El estado de hoy de los cobros y las partes a los que se refieren (R7b).
  const conceptos = filas.flatMap((a) => (a.detalle as DetalleActividad).conceptos ?? []);
  const idsCobros = [...new Set(conceptos.filter((c) => c.tipo === "cobro").map((c) => c.id))];
  const idsPartes = [...new Set(conceptos.filter((c) => c.tipo === "parte").map((c) => c.id))];
  const [cobros, partes] = await Promise.all([
    idsCobros.length === 0
      ? []
      : bd
          .select({ id: t.cobroAlquiler.id, importe: t.cobroAlquiler.importe, pagadoEn: t.cobroAlquiler.pagadoEn })
          .from(t.cobroAlquiler)
          .where(and(inArray(t.cobroAlquiler.id, idsCobros), isNull(t.cobroAlquiler.quitadoEn))),
    idsPartes.length === 0
      ? []
      : bd
          .select({ id: t.repartoLinea.id, importe: t.repartoLinea.importe, pagadoEn: t.repartoLinea.pagadoEn })
          .from(t.repartoLinea)
          .where(inArray(t.repartoLinea.id, idsPartes)),
  ]);
  const hoy = new Map<string, { importe: number; pagado: boolean }>([
    ...cobros.map((c) => [`cobro:${c.id}`, { importe: c.importe, pagado: c.pagadoEn !== null }] as const),
    ...partes.map((p) => [`parte:${p.id}`, { importe: p.importe, pagado: p.pagadoEn !== null }] as const),
  ]);

  const actividades = filas.map((a) => {
    const detalle = a.detalle as DetalleActividad;
    const tipo = a.tipo as TipoActividad;
    // Los que ya no existen (quitados, repartos deshechos) no cuentan.
    const deHoy: ConceptoActividad[] = (detalle.conceptos ?? []).flatMap((c) => {
      const clave = `${c.tipo}:${c.id}`;
      const estado = hoy.get(clave);
      return estado ? [{ clave, inquilinoId: c.inquilinoId, importe: estado.importe, pagado: estado.pagado }] : [];
    });
    const actividad: Actividad = {
      id: a.id,
      tipo,
      grupo: grupoDe(tipo),
      ocurridaEn: a.ocurridaEn.toISOString(),
      fecha: hoyEnMadrid(a.ocurridaEn),
      inquilinoId: a.inquilinoId,
      tipoGastoId: a.tipoGastoId,
      gasto: gastoDe(tipo, a.tipoGastoId),
      detalle,
      estadoPago: deHoy.length === 0 ? null : deHoy.every((c) => c.pagado) ? "pagado" : "pendiente",
    };
    return { ...actividad, conceptos: deHoy };
  });

  const filtros = {
    inquilinos: f.inquilino,
    gastos: f.gasto,
    grupos: f.grupo,
    estado: f.estado,
    desde: f.desde,
    hasta: f.hasta,
  };
  const filtradas = filtrarHistorico(actividades, filtros);
  return {
    actividades: filtradas.map(({ conceptos: _, ...a }) => a),
    resumen: hayFiltros(filtros) ? resumenHistorico(filtradas, filtros) : null,
  };
}

/** Un cobro de alquiler en el histórico, con lo que se sabe de él. */
export function actividadCobro(
  inmuebleId: string,
  tipo: TipoActividad,
  c: { id: string; inquilinoId: string; mes: string; importe: number },
  extra: DetalleActividad = {},
): NuevaActividad {
  return {
    inmuebleId,
    tipo,
    inquilinoId: c.inquilinoId,
    detalle: {
      cobroId: c.id,
      mes: c.mes,
      importe: c.importe,
      conceptos: [{ tipo: "cobro", id: c.id, inquilinoId: c.inquilinoId, importe: c.importe }],
      ...extra,
    },
  };
}

/** Una parte de factura como concepto de una actividad (R7b). */
export function conceptoParte(p: { id: string; inquilinoId: string; importe: number }) {
  return { tipo: "parte" as const, id: p.id, inquilinoId: p.inquilinoId, importe: p.importe };
}
