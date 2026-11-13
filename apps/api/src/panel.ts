// Panel principal (spec 009, R1–R5b): totales, pendientes por inmueble e
// inquilino, una tarjeta por inmueble y avisos. Todo filtrado por el usuario.
// Los inmuebles archivados no aparecen; los bloqueados no cuentan (R4).
import type { Panel } from "@inquilinus/contracts";
import { resumenPanel, type Concepto } from "@inquilinus/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";

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

  // Hasta la fase 5 solo hay alquileres; las partes de gastos se suman con la tarea 5.4.
  const conceptos: Concepto[] = filas.map((f) => ({
    id: f.id,
    inmuebleId: f.inmuebleId,
    inquilinoId: f.inquilinoId,
    tipo: "alquiler",
    mes: f.mes,
    importe: f.importe,
    pagadoEn: f.pagadoEn,
    quitado: f.quitadoEn !== null,
  }));
  const resumen = resumenPanel(conceptos, hoy);

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
        conceptos: q.conceptos.map((c) => ({ id: c.id, tipo: c.tipo, mes: c.mes, importe: c.importe, atrasado: c.atrasado })),
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
      bloqueados: inmuebles.length - activos.length,
    },
  };
}
