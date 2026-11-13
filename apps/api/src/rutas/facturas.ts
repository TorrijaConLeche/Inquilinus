// Rutas de facturas (spec 003). Cuelgan de /inmuebles/:idInmueble: la sesión
// ya la exige el middleware de inmuebles; aquí se comprueba que el inmueble es suyo.
import {
  NuevasFacturas,
  PeticionSubidasFacturas,
  type ListaFacturas,
  type PermisosSubida,
  type RespuestaError,
  type ResultadoSubidaFacturas,
} from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { Almacen } from "../almacen.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import type { ExtractorFacturas } from "../extractor.ts";
import { crearFacturas, descartarFactura, listarFacturas, prepararSubidasFacturas, urlPdfFactura } from "../facturas.ts";
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

  app.delete("/inmuebles/:idInmueble/facturas/:idFactura", async (c) => {
    if (!almacen) return sinAlmacen(c);
    const v = await delInmueble(c, "idFactura");
    if (!v) return noEncontrado(c);
    if (!(await descartarFactura(bd, almacen, v[0]!, v[1]!))) return noEncontrado(c);
    return c.body(null, 204);
  });
}
