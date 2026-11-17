// Rutas de liquidaciones (spec 011). Cuelgan de /inmuebles/:idInmueble: la
// sesión ya la exige el middleware de inmuebles; aquí se comprueba que el inmueble es suyo.
import {
  EdicionLiquidacion,
  NuevaLiquidacion,
  PagoLiquidacion,
  type Liquidacion,
  type ListaLiquidaciones,
  type ResultadoPagoLiquidacion,
} from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { ConexionBd } from "../bd/cliente.ts";
import { hoyEnMadrid } from "../fechas.ts";
import { esSuyo } from "../inmuebles.ts";
import { borrarLiquidacion, crearLiquidacion, editarLiquidacion, listarLiquidaciones, pagarLiquidacion } from "../liquidaciones.ts";
import { ids, leer, noEncontrado, type EntornoSesion } from "./comunes.ts";

export function registrarRutasLiquidaciones(app: Hono<EntornoSesion>, { bd, ahora }: { bd: ConexionBd; ahora: () => Date }) {
  const delInmueble = async (c: Context<EntornoSesion>, ...otros: string[]) => {
    const valores = ids(c, "idInmueble", ...otros);
    if (!valores || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return null;
    return valores;
  };

  app.get("/inmuebles/:idInmueble/liquidaciones", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    return c.json<ListaLiquidaciones>({ liquidaciones: await listarLiquidaciones(bd, v[0]!) });
  });

  app.post("/inmuebles/:idInmueble/liquidaciones", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    return c.json<Liquidacion>(await crearLiquidacion(bd, v[0]!, await leer(c, NuevaLiquidacion), ahora()), 201);
  });

  app.patch("/inmuebles/:idInmueble/liquidaciones/:idLiquidacion", async (c) => {
    const v = await delInmueble(c, "idLiquidacion");
    if (!v) return noEncontrado(c);
    const liquidacion = await editarLiquidacion(bd, v[0]!, v[1]!, await leer(c, EdicionLiquidacion));
    return liquidacion ? c.json<Liquidacion>(liquidacion) : noEncontrado(c);
  });

  app.delete("/inmuebles/:idInmueble/liquidaciones/:idLiquidacion", async (c) => {
    const v = await delInmueble(c, "idLiquidacion");
    if (!v) return noEncontrado(c);
    if (!(await borrarLiquidacion(bd, v[0]!, v[1]!))) return noEncontrado(c);
    return c.body(null, 204);
  });

  app.post("/inmuebles/:idInmueble/liquidaciones/:idLiquidacion/pagar", async (c) => {
    const v = await delInmueble(c, "idLiquidacion");
    if (!v) return noEncontrado(c);
    const partes = await pagarLiquidacion(bd, v[0]!, v[1]!, await leer(c, PagoLiquidacion), hoyEnMadrid(ahora()));
    return partes ? c.json<ResultadoPagoLiquidacion>({ partes }) : noEncontrado(c);
  });
}
