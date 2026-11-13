// Rutas de facturas (spec 003). Cuelgan de /inmuebles/:idInmueble: la sesión
// ya la exige el middleware de inmuebles; aquí se comprueba que el inmueble es suyo.
import {
  ConfirmacionFactura,
  ConfirmacionReparto,
  EdicionParte,
  ConfirmacionTodas,
  EdicionFactura,
  NuevasFacturas,
  PeticionSubidasFacturas,
  type Factura,
  type ListaFacturas,
  type ParteReparto,
  type RepartoFactura,
  type RespuestaSolape,
  type ResultadoConfirmacionTodas,
  type PermisosSubida,
  type RespuestaError,
  type ResultadoSubidaFacturas,
} from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { Almacen } from "../almacen.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import type { ExtractorFacturas } from "../extractor.ts";
import {
  confirmarFactura,
  confirmarTodas,
  crearFacturas,
  descartarFactura,
  editarFactura,
  ErrorSolape,
  listarFacturas,
  prepararSubidasFacturas,
  urlPdfFactura,
  verFactura,
} from "../facturas.ts";
import { hoyEnMadrid } from "../fechas.ts";
import { deshacerReparto, marcarParte, recalcularReparto, verReparto } from "../repartos.ts";
import { esSuyo } from "../inmuebles.ts";
import { ids, leer, noEncontrado, type EntornoSesion } from "./comunes.ts";

export function registrarRutasFacturas(
  app: Hono<EntornoSesion>,
  opciones: { bd: ConexionBd; almacen: Almacen | undefined; extractor: ExtractorFacturas | undefined; ahora: () => Date },
) {
  const { bd, almacen, extractor, ahora } = opciones;

  const delInmueble = async (c: Context<EntornoSesion>, ...otros: string[]) => {
    const valores = ids(c, "idInmueble", ...otros);
    if (!valores || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return null;
    return valores;
  };
  const sinAlmacen = (c: Context) => c.json<RespuestaError>({ error: "almacen-no-configurado" }, 503);

  app.get("/inmuebles/:idInmueble/facturas", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const facturas = await listarFacturas(bd, v[0]!, { porRevisar: c.req.query("porRevisar") === "true" });
    return c.json<ListaFacturas>({ facturas });
  });

  app.post("/inmuebles/:idInmueble/facturas/subidas", async (c) => {
    if (!almacen) return sinAlmacen(c);
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const { cantidad } = await leer(c, PeticionSubidasFacturas);
    const permisos = await prepararSubidasFacturas(almacen, c.get("usuarioId"), cantidad, ahora());
    return c.json<PermisosSubida>({ permisos }, 201);
  });

  app.post("/inmuebles/:idInmueble/facturas", async (c) => {
    if (!almacen) return sinAlmacen(c);
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const { subidas } = await leer(c, NuevasFacturas);
    const resultado = await crearFacturas(bd, almacen, extractor, { usuarioId: c.get("usuarioId"), inmuebleId: v[0]!, subidas });
    return c.json<ResultadoSubidaFacturas>(resultado, 201);
  });

  app.get("/inmuebles/:idInmueble/facturas/:idFactura/pdf", async (c) => {
    if (!almacen) return sinAlmacen(c);
    const v = await delInmueble(c, "idFactura");
    if (!v) return noEncontrado(c);
    const url = await urlPdfFactura(bd, almacen, v[0]!, v[1]!);
    if (!url) return noEncontrado(c);
    c.header("cache-control", "no-store");
    return c.redirect(url, 302);
  });

  app.patch("/inmuebles/:idInmueble/facturas/:idFactura", async (c) => {
    const v = await delInmueble(c, "idFactura");
    if (!v) return noEncontrado(c);
    const factura = await editarFactura(bd, v[0]!, v[1]!, await leer(c, EdicionFactura));
    return factura ? c.json<Factura>(factura) : noEncontrado(c);
  });

  app.post("/inmuebles/:idInmueble/facturas/confirmar-todas", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const { lote } = await leer(c, ConfirmacionTodas);
    return c.json<ResultadoConfirmacionTodas>(await confirmarTodas(bd, v[0]!, lote, ahora()));
  });

  app.post("/inmuebles/:idInmueble/facturas/:idFactura/confirmar", async (c) => {
    const v = await delInmueble(c, "idFactura");
    if (!v) return noEncontrado(c);
    const { continuarConSolapes } = await leer(c, ConfirmacionFactura);
    try {
      const factura = await confirmarFactura(bd, v[0]!, v[1]!, continuarConSolapes === true, ahora());
      return factura ? c.json<Factura>(factura) : noEncontrado(c);
    } catch (error) {
      // R6: se avisa mostrando las facturas con las que se solapa; la usuaria decide.
      if (error instanceof ErrorSolape) {
        return c.json<RespuestaSolape>({ error: "SOLAPE_FACTURAS", solapadas: error.solapadas }, 409);
      }
      throw error;
    }
  });

  // --- Reparto guardado (spec 001, R10–R14) --------------------------------

  app.get("/inmuebles/:idInmueble/facturas/:idFactura/reparto", async (c) => {
    const v = await delInmueble(c, "idFactura");
    if (!v) return noEncontrado(c);
    const reparto = await verReparto(bd, v[0]!, v[1]!);
    return reparto ? c.json<RepartoFactura>(reparto) : noEncontrado(c);
  });

  app.post("/inmuebles/:idInmueble/facturas/:idFactura/recalcular", async (c) => {
    const v = await delInmueble(c, "idFactura");
    if (!v) return noEncontrado(c);
    const { confirmar } = await leer(c, ConfirmacionReparto);
    if (!(await recalcularReparto(bd, v[0]!, v[1]!, confirmar === true))) return noEncontrado(c);
    return c.json<Factura>(await verFactura(bd, v[1]!));
  });

  app.post("/inmuebles/:idInmueble/facturas/:idFactura/deshacer", async (c) => {
    const v = await delInmueble(c, "idFactura");
    if (!v) return noEncontrado(c);
    const { confirmar } = await leer(c, ConfirmacionReparto);
    if (!(await deshacerReparto(bd, v[0]!, v[1]!, confirmar === true))) return noEncontrado(c);
    return c.json<Factura>(await verFactura(bd, v[1]!));
  });

  app.patch("/inmuebles/:idInmueble/partes/:idParte", async (c) => {
    const v = await delInmueble(c, "idParte");
    if (!v) return noEncontrado(c);
    const { pagadoEn } = await leer(c, EdicionParte);
    const parte = await marcarParte(bd, v[0]!, v[1]!, pagadoEn, hoyEnMadrid(ahora()));
    return parte ? c.json<ParteReparto>(parte) : noEncontrado(c);
  });

  app.delete("/inmuebles/:idInmueble/facturas/:idFactura", async (c) => {
    if (!almacen) return sinAlmacen(c);
    const v = await delInmueble(c, "idFactura");
    if (!v) return noEncontrado(c);
    if (!(await descartarFactura(bd, almacen, v[0]!, v[1]!))) return noEncontrado(c);
    return c.body(null, 204);
  });
}
