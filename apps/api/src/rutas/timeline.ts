// Ruta del timeline (spec 006). Cuelga de /inmuebles/:idInmueble: la sesión ya
// la exige el middleware de inmuebles; aquí se comprueba que el inmueble es suyo.
import type { DatosTimeline } from "@inquilinus/contracts";
import type { Hono } from "hono";
import type { ConexionBd } from "../bd/cliente.ts";
import { esSuyo } from "../inmuebles.ts";
import { datosTimeline } from "../timeline.ts";
import { ids, noEncontrado, type EntornoSesion } from "./comunes.ts";

export function registrarRutasTimeline(app: Hono<EntornoSesion>, { bd }: { bd: ConexionBd }) {
  app.get("/inmuebles/:idInmueble/timeline", async (c) => {
    const valores = ids(c, "idInmueble");
    if (!valores || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return noEncontrado(c);
    return c.json<DatosTimeline>(await datosTimeline(bd, valores[0]!));
  });
}
