// Ruta del timeline (spec 006). Cuelga de /inmuebles/:idInmueble: la sesión ya
// la exige el middleware de inmuebles; aquí se comprueba que el inmueble es suyo.
import { Mes, type DatosTimeline, type DesgloseAlquiler } from "@inquilinus/contracts";
import type { Hono } from "hono";
import type { ConexionBd } from "../bd/cliente.ts";
import { desgloseAlquiler } from "../cobros.ts";
import { esSuyo } from "../inmuebles.ts";
import { datosTimeline } from "../timeline.ts";
import { ids, noEncontrado, type EntornoSesion } from "./comunes.ts";

export function registrarRutasTimeline(app: Hono<EntornoSesion>, { bd }: { bd: ConexionBd }) {
  app.get("/inmuebles/:idInmueble/timeline", async (c) => {
    const valores = ids(c, "idInmueble");
    if (!valores || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return noEncontrado(c);
    return c.json<DatosTimeline>(await datosTimeline(bd, valores[0]!));
  });

  // R11: el desglose de un mes de alquiler.
  app.get("/inmuebles/:idInmueble/alquiler/:mes", async (c) => {
    const valores = ids(c, "idInmueble");
    const mes = Mes.safeParse(c.req.param("mes"));
    if (!valores || !mes.success || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return noEncontrado(c);
    return c.json<DesgloseAlquiler>(await desgloseAlquiler(bd, valores[0]!, mes.data));
  });
}
