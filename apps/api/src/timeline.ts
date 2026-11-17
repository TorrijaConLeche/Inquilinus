// Timeline del inmueble (spec 006). Recibe un inmueble que ya se ha comprobado
// que es del usuario. Solo lo necesario para dibujarlo: sin documentos ni fianzas.
import type { DatosTimeline } from "@inquilinus/contracts";
import type { ConexionBd } from "./bd/cliente.ts";
import { listarCobros } from "./cobros.ts";
import { listarFacturas } from "./facturas.ts";
import { listarInquilinos, listarTiposGasto } from "./inquilinos.ts";

export async function datosTimeline(bd: ConexionBd, inmuebleId: string): Promise<DatosTimeline> {
  const [tiposGasto, inquilinos, cobros, facturas] = await Promise.all([
    listarTiposGasto(bd, inmuebleId),
    listarInquilinos(bd, inmuebleId),
    listarCobros(bd, inmuebleId, { quitados: false }),
    listarFacturas(bd, inmuebleId, { porRevisar: false }),
  ]);
  return {
    tiposGasto,
    inquilinos: inquilinos.map((q) => ({
      id: q.id,
      nombre: q.nombre,
      ocupaciones: q.ocupaciones.map((o) => ({ habitacionId: o.habitacionId, entrada: o.entrada, salida: o.salida })),
    })),
    // R3b: los quitados no aparecen.
    cobros: cobros
      .filter((c) => !c.quitado)
      .map((c) => ({
        id: c.id,
        inquilinoId: c.inquilinoId,
        mes: c.mes,
        fechaCobro: c.fechaCobro,
        importe: c.importe,
        pagadoEn: c.pagadoEn,
      })),
    // R4b: solo las repartidas.
    facturas: facturas
      .filter((f) => f.estado === "repartida" && f.reparto && f.periodoInicio && f.periodoFin && f.importeTotal !== null)
      .map((f) => ({
        id: f.id,
        tipoGastoId: f.tipoGastoId,
        periodoInicio: f.periodoInicio!,
        periodoFin: f.periodoFin!,
        importeTotal: f.importeTotal!,
        liquidacionId: f.liquidacionId,
        partes: f.reparto!.partes.map((p) => ({ inquilinoId: p.inquilinoId, importe: p.importe, pagadoEn: p.pagadoEn })),
      })),
  };
}
