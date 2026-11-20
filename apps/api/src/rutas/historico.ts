// Ruta del histórico (spec 012). Cuelga de /inmuebles/:idInmueble: la sesión ya
// la exige el middleware de inmuebles; aquí se comprueba que el inmueble es suyo.
import { FiltrosHistorico, type Historico } from "@inquilinus/contracts";
import type { Hono } from "hono";
import { listarHistorico } from "../actividad.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import { ErrorPeticion } from "../errores.ts";
import { esSuyo } from "../inmuebles.ts";
import { ids, noEncontrado, type EntornoSesion } from "./comunes.ts";

export function registrarRutasHistorico(app: Hono<EntornoSesion>, { bd }: { bd: ConexionBd }) {
  app.get("/inmuebles/:idInmueble/historico", async (c) => {
    const valores = ids(c, "idInmueble");
    if (!valores || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return noEncontrado(c);
    // R6: los filtros de lista se repiten en la URL; los demás van una vez.
    const q = c.req.queries();
    const uno = (clave: string) => q[clave]?.[0];
    const filtros = FiltrosHistorico.safeParse({
      inquilino: q.inquilino,
      gasto: q.gasto,
      grupo: q.grupo,
      estado: uno("estado"),
      desde: uno("desde"),
      hasta: uno("hasta"),
    });
    if (!filtros.success) throw new ErrorPeticion("DATOS_INVALIDOS");
    return c.json<Historico>(await listarHistorico(bd, valores[0]!, filtros.data));
  });
}
