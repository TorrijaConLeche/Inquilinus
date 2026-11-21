// Vista del inquilino con su enlace (spec 004). Solo lo suyo: sus cobros, su
// parte de cada gasto, sus liquidaciones y su fianza. De los demás, solo el
// nombre de pila en el cálculo por tramos y sus estancias en el timeline;
// nunca lo que han pagado o deben (R7b), ni documentos ni contacto (R9).
import type { DatosTimeline, VistaInquilino } from "@inquilinus/contracts";
import { totalPendiente } from "@inquilinus/domain";
import { eq } from "drizzle-orm";
import type { Almacen } from "./almacen.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import * as t from "./bd/esquema.ts";
import { desgloseAlquiler, listarCobros } from "./cobros.ts";
import { enlacePorToken } from "./enlaces.ts";
import { urlPdfFactura } from "./facturas.ts";
import { listarLiquidaciones } from "./liquidaciones.ts";
import { partesDeGastos, verReparto } from "./repartos.ts";
import { datosTimeline } from "./timeline.ts";

/** El nombre de pila: la primera palabra (R7). «Inquilino 3» se queda entero. */
const nombreDePila = (nombre: string) => (/^Inquilino \d+$/.test(nombre) ? nombre : (nombre.trim().split(/\s+/)[0] ?? nombre));

/** R1–R11b: la vista del token, o null si el enlace no está disponible (sin decir por qué, R4). */
export async function vistaInquilino(bd: ConexionBd, token: string, hoy: string): Promise<VistaInquilino | null> {
  const enlace = await enlacePorToken(bd, token, hoy);
  if (!enlace) return null;
  const { inquilinoId, inmuebleId } = enlace;

  const [[inmueble], inquilinos, cobrosInmueble, partesInmueble, liquidaciones, [fianza], timeline] = await Promise.all([
    bd.select({ nombre: t.inmueble.nombre, bloqueado: t.inmueble.bloqueado }).from(t.inmueble).where(eq(t.inmueble.id, inmuebleId)),
    bd.select({ id: t.inquilino.id, nombre: t.inquilino.nombre }).from(t.inquilino).where(eq(t.inquilino.inmuebleId, inmuebleId)),
    listarCobros(bd, inmuebleId, { quitados: false }),
    partesDeGastos(bd, [inmuebleId]),
    listarLiquidaciones(bd, inmuebleId),
    bd.select().from(t.fianza).where(eq(t.fianza.inquilinoId, inquilinoId)),
    datosTimeline(bd, inmuebleId),
  ]);
  const yo = inquilinos.find((q) => q.id === inquilinoId)!;
  const pila = new Map(inquilinos.map((q) => [q.id, nombreDePila(q.nombre)]));
  const cobros = cobrosInmueble.filter((c) => c.inquilinoId === inquilinoId);
  const partes = partesInmueble.filter((p) => p.inquilinoId === inquilinoId);

  // R11 de la spec 006: de cada mes, los días vacíos que paga él.
  const meses = [...new Set(cobros.map((c) => c.mes))];
  const desgloses = new Map(await Promise.all(meses.map(async (m) => [m, await desgloseAlquiler(bd, inmuebleId, m)] as const)));
  // R7: el cálculo por tramos de cada factura, solo los tramos en que estuvo.
  const repartos = new Map(
    await Promise.all(
      [...new Set(partes.map((p) => p.facturaId))].map(async (id) => [id, await verReparto(bd, inmuebleId, id)] as const),
    ),
  );

  // R6c: estancias de todos (con su nombre de pila); de dinero, solo lo suyo.
  const suyo: DatosTimeline = {
    tiposGasto: timeline.tiposGasto,
    inquilinos: timeline.inquilinos.map((q) => ({ ...q, nombre: q.id === inquilinoId ? yo.nombre : (pila.get(q.id) ?? q.nombre) })),
    cobros: timeline.cobros.filter((c) => c.inquilinoId === inquilinoId),
    facturas: timeline.facturas
      .filter((f) => f.partes.some((p) => p.inquilinoId === inquilinoId))
      .map((f) => ({ ...f, partes: f.partes.filter((p) => p.inquilinoId === inquilinoId) })),
    liquidaciones: timeline.liquidaciones.filter((l) =>
      liquidaciones.some((x) => x.id === l.id && x.inquilinos.some((q) => q.inquilinoId === inquilinoId)),
    ),
  };

  return {
    inquilino: { id: inquilinoId, nombre: yo.nombre },
    inmueble: { nombre: inmueble!.nombre, bloqueado: inmueble!.bloqueado },
    permiteDescarga: enlace.permiteDescarga,
    // R5: alquiler y gastos sin pagar.
    pendiente: totalPendiente([
      ...cobros.map((c) => ({ id: c.id, inmuebleId, inquilinoId, tipo: "alquiler" as const, mes: c.mes, importe: c.importe, pagadoEn: c.pagadoEn })),
      ...partes.map((p) => ({ id: p.id, inmuebleId, inquilinoId, tipo: "gasto" as const, mes: p.mes, importe: p.importe, pagadoEn: p.pagadoEn })),
    ]),
    cobros: cobros.map((c) => {
      const d = desgloses.get(c.mes);
      const nombreHabitacion = (id: string) => d?.habitaciones.find((h) => h.id === id)?.nombre ?? "—";
      return {
        id: c.id,
        mes: c.mes,
        renta: c.renta,
        recargoVacios: c.recargoVacios,
        importe: c.importe,
        fechaCobro: c.fechaCobro,
        pagadoEn: c.pagadoEn,
        vacios:
          c.recargoVacios > 0
            ? (d?.vacios ?? [])
                .filter((v) => v.entre.includes(inquilinoId))
                .map((v) => ({ habitacion: nombreHabitacion(v.habitacionId), desde: v.desde, hasta: v.hasta, entre: v.entre.length }))
            : [],
      };
    }),
    gastos: partes.map((p) => ({
      parteId: p.id,
      facturaId: p.facturaId,
      tipoGastoId: p.tipoGastoId,
      periodoInicio: p.periodoInicio,
      periodoFin: p.periodoFin,
      importeFactura: p.importeFactura,
      importe: p.importe,
      dias: p.dias,
      pagadoEn: p.pagadoEn,
      liquidacionId: p.liquidacionId,
      mes: p.mes,
      tramos: (repartos.get(p.facturaId)?.tramos ?? [])
        .filter((tr) => tr.presentes.includes(inquilinoId))
        .map((tr) => ({
          desde: tr.desde,
          hasta: tr.hasta,
          dias: tr.dias,
          // Con quién estuvo, por su nombre de pila; nunca cuánto pagan los demás (R7b).
          conQuien: tr.presentes.filter((id) => id !== inquilinoId).map((id) => pila.get(id) ?? "—"),
          importe: tr.partes.find((x) => x.inquilinoId === inquilinoId)?.importe ?? 0,
        })),
    })),
    liquidaciones: liquidaciones.flatMap((l) => {
      const mio = l.inquilinos.find((q) => q.inquilinoId === inquilinoId);
      return mio ? [{ id: l.id, nombre: l.nombre, mes: l.mes, total: mio.total, pendiente: mio.pendiente, estado: mio.estado }] : [];
    }),
    fianza: fianza
      ? { importe: fianza.importe, recibidaEn: fianza.recibidaEn, devueltaEn: fianza.devueltaEn, importeDevuelto: fianza.importeDevuelto }
      : null,
    timeline: suyo,
  };
}

/**
 * R8: la URL firmada (5 minutos) del PDF de una factura suya, si el enlace
 * funciona y permite la descarga. Null en cualquier otro caso (C7b, C8).
 */
export async function pdfParaInquilino(
  bd: ConexionBd,
  almacen: Almacen | undefined,
  token: string,
  facturaId: string,
  hoy: string,
): Promise<string | null> {
  const enlace = await enlacePorToken(bd, token, hoy);
  if (!enlace || !enlace.permiteDescarga || !almacen) return null;
  const suya = (await partesDeGastos(bd, [enlace.inmuebleId])).some(
    (p) => p.facturaId === facturaId && p.inquilinoId === enlace.inquilinoId,
  );
  if (!suya) return null;
  return urlPdfFactura(bd, almacen, enlace.inmuebleId, facturaId);
}
