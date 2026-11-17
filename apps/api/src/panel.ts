// Panel principal (spec 009, R1–R5b): totales, pendientes por inmueble e
// inquilino, una tarjeta por inmueble y avisos. Todo filtrado por el usuario.
// Los inmuebles archivados no aparecen; los bloqueados no cuentan (R4).
import type { ConceptoPendiente, Panel } from "@inquilinus/contracts";
import { resumenPanel, type Concepto } from "@inquilinus/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { partesDeGastos } from "./repartos.ts";

export async function resumenDelPanel(bd: ConexionBd, usuarioId: string, hoy: string): Promise<Panel> {
  const inmuebles = await bd
    .select({ id: t.inmueble.id, nombre: t.inmueble.nombre, bloqueado: t.inmueble.bloqueado })
    .from(t.inmueble)
    .where(and(eq(t.inmueble.usuarioId, usuarioId), eq(t.inmueble.archivado, false)))
    .orderBy(asc(t.inmueble.creadoEn));
  const activos = inmuebles.filter((i) => !i.bloqueado);
  const nombreInmueble = new Map(activos.map((i) => [i.id, i.nombre]));

  const filas =
    activos.length === 0
      ? []
      : await bd
          .select({
            id: t.cobroAlquiler.id,
            inquilinoId: t.cobroAlquiler.inquilinoId,
            inmuebleId: t.inquilino.inmuebleId,
            nombreInquilino: t.inquilino.nombre,
            mes: t.cobroAlquiler.mes,
            importe: t.cobroAlquiler.importe,
            pagadoEn: t.cobroAlquiler.pagadoEn,
            quitadoEn: t.cobroAlquiler.quitadoEn,
            desactualizado: t.cobroAlquiler.desactualizado,
          })
          .from(t.cobroAlquiler)
          .innerJoin(t.inquilino, eq(t.inquilino.id, t.cobroAlquiler.inquilinoId))
          .where(inArray(t.inquilino.inmuebleId, activos.map((i) => i.id)));
  const nombreInquilino = new Map(filas.map((f) => [f.inquilinoId, f.nombreInquilino]));

  // R2: alquileres y partes de gastos (con el mes en que se repartió la factura, R8).
  const [partes, tipos] = await Promise.all([
    partesDeGastos(
      bd,
      activos.map((i) => i.id),
    ),
    activos.length === 0
      ? []
      : bd
          .select({ id: t.tipoGasto.id, nombre: t.tipoGasto.nombre })
          .from(t.tipoGasto)
          .where(inArray(t.tipoGasto.inmuebleId, activos.map((i) => i.id))),
  ]);
  const nombreGasto = new Map<string, string | null>(
    partes.map((p) => [p.id, tipos.find((tg) => tg.id === p.tipoGastoId)?.nombre ?? null]),
  );
  // Quien solo tiene partes de gastos (sin cobros) también necesita su nombre.
  const sinNombre = [...new Set(partes.map((p) => p.inquilinoId))].filter((id) => !nombreInquilino.has(id));
  if (sinNombre.length > 0) {
    const inquilinos = await bd
      .select({ id: t.inquilino.id, nombre: t.inquilino.nombre })
      .from(t.inquilino)
      .where(inArray(t.inquilino.id, sinNombre));
    for (const q of inquilinos) nombreInquilino.set(q.id, q.nombre);
  }
  const conceptos: Concepto[] = [
    ...filas.map(
      (f): Concepto => ({
        id: f.id,
        inmuebleId: f.inmuebleId,
        inquilinoId: f.inquilinoId,
        tipo: "alquiler",
        mes: f.mes,
        importe: f.importe,
        pagadoEn: f.pagadoEn,
        quitado: f.quitadoEn !== null,
      }),
    ),
    ...partes.map(
      (p): Concepto => ({
        id: p.id,
        inmuebleId: p.inmuebleId,
        inquilinoId: p.inquilinoId,
        tipo: "gasto",
        mes: p.mes,
        importe: p.importe,
        pagadoEn: p.pagadoEn,
      }),
    ),
  ];
  const resumen = resumenPanel(conceptos, hoy);

  // Spec 011, R12: las partes de una liquidación van en una sola línea por inquilino.
  const partePorId = new Map(partes.map((p) => [p.id, p]));
  const liquidaciones =
    activos.length === 0
      ? []
      : await bd
          .select({ id: t.liquidacion.id, nombre: t.liquidacion.nombre })
          .from(t.liquidacion)
          .where(inArray(t.liquidacion.inmuebleId, activos.map((i) => i.id)));
  const nombreLiquidacion = new Map(liquidaciones.map((l) => [l.id, l.nombre]));
  const ORDEN: Record<ConceptoPendiente["tipo"], number> = { alquiler: 0, liquidacion: 1, gasto: 2 };
  const agrupar = (
    inquilinoId: string,
    lista: { id: string; tipo: "alquiler" | "gasto"; mes: string; importe: number; atrasado: boolean }[],
  ): ConceptoPendiente[] => {
    const sueltos: ConceptoPendiente[] = [];
    const porLiquidacion = new Map<string, typeof lista>();
    for (const c of lista) {
      const liquidacionId = c.tipo === "gasto" ? partePorId.get(c.id)?.liquidacionId : null;
      if (liquidacionId) porLiquidacion.set(liquidacionId, [...(porLiquidacion.get(liquidacionId) ?? []), c]);
      else
        sueltos.push({
          id: c.id,
          tipo: c.tipo,
          nombreGasto: c.tipo === "gasto" ? (nombreGasto.get(c.id) ?? null) : null,
          liquidacion: null,
          mes: c.mes,
          importe: c.importe,
          atrasado: c.atrasado,
        });
    }
    const agrupados: ConceptoPendiente[] = [...porLiquidacion].map(([liquidacionId, pendientes]) => ({
      id: liquidacionId,
      tipo: "liquidacion",
      nombreGasto: null,
      mes: pendientes[0]!.mes,
      // Lo que le falta por pagar de la liquidación.
      importe: pendientes.reduce((s, c) => s + c.importe, 0),
      atrasado: pendientes[0]!.atrasado,
      liquidacion: {
        id: liquidacionId,
        nombre: nombreLiquidacion.get(liquidacionId) ?? "",
        partes: partes
          .filter((p) => p.liquidacionId === liquidacionId && p.inquilinoId === inquilinoId)
          .map(({ inmuebleId: _, ...p }) => ({ ...p, nombreGasto: nombreGasto.get(p.id) ?? null })),
      },
    }));
    return [...sueltos, ...agrupados].sort((a, b) => (a.mes === b.mes ? ORDEN[a.tipo] - ORDEN[b.tipo] : a.mes < b.mes ? -1 : 1));
  };

  // R4: facturas por revisar (subidas, leídas o que no se pudieron leer).
  const porRevisar =
    activos.length === 0
      ? []
      : await bd
          .select({ inmuebleId: t.factura.inmuebleId })
          .from(t.factura)
          .where(
            and(
              inArray(t.factura.inmuebleId, activos.map((i) => i.id)),
              inArray(t.factura.estado, ["subida", "propuesta", "error_extraccion"]),
            ),
          );

  const desactualizados = new Map<string, number>();
  for (const f of filas) {
    if (f.desactualizado && f.quitadoEn === null) desactualizados.set(f.inmuebleId, (desactualizados.get(f.inmuebleId) ?? 0) + 1);
  }

  return {
    totalPendiente: resumen.totalPendiente,
    cobradoEsteMes: resumen.cobradoEsteMes,
    pendientes: resumen.pendientes.map((p) => ({
      inmuebleId: p.inmuebleId,
      nombre: nombreInmueble.get(p.inmuebleId) ?? "",
      total: p.total,
      inquilinos: p.inquilinos.map((q) => ({
        inquilinoId: q.inquilinoId,
        nombre: nombreInquilino.get(q.inquilinoId) ?? "",
        total: q.total,
        conceptos: agrupar(q.inquilinoId, q.conceptos),
      })),
    })),
    inmuebles: activos.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      pendiente: resumen.pendientes.find((p) => p.inmuebleId === i.id)?.total ?? 0,
    })),
    avisos: {
      desactualizados: activos
        .filter((i) => desactualizados.has(i.id))
        .map((i) => ({ inmuebleId: i.id, nombre: i.nombre, cobros: desactualizados.get(i.id)! })),
      porRevisar: activos
        .map((i) => ({ inmuebleId: i.id, nombre: i.nombre, facturas: porRevisar.filter((f) => f.inmuebleId === i.id).length }))
        .filter((a) => a.facturas > 0),
      bloqueados: inmuebles.length - activos.length,
    },
  };
}
