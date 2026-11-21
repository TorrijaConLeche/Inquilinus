// Rutas de los enlaces del inquilino (spec 004, R1–R2e). Cuelgan de
// /inmuebles/:idInmueble: la sesión ya la exige el middleware de inmuebles;
// aquí se comprueba que el inmueble es suyo.
import { EdicionEnlace, type EnlaceGenerado, type EnlaceInquilino } from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { ConexionBd } from "../bd/cliente.ts";
import { cambiarDescarga, generarEnlace, regenerarEnlace, revocarEnlace } from "../enlaces.ts";
import { esSuyo } from "../inmuebles.ts";
import { ids, leer, noEncontrado, type EntornoSesion } from "./comunes.ts";

export function registrarRutasEnlaces(app: Hono<EntornoSesion>, { bd }: { bd: ConexionBd }) {
  const delInmueble = async (c: Context<EntornoSesion>) => {
    const valores = ids(c, "idInmueble", "idInquilino");
    if (!valores || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return null;
    return valores as [string, string];
  };
  const base = "/inmuebles/:idInmueble/inquilinos/:idInquilino/enlace";

  app.post(base, async (c) => {
    const v = await delInmueble(c);
    const generado = v && (await generarEnlace(bd, v[0], v[1]));
    return generado ? c.json<EnlaceGenerado>(generado, 201) : noEncontrado(c);
  });

  app.post(`${base}/regenerar`, async (c) => {
    const v = await delInmueble(c);
    const generado = v && (await regenerarEnlace(bd, v[0], v[1]));
    return generado ? c.json<EnlaceGenerado>(generado, 201) : noEncontrado(c);
  });

  app.patch(base, async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const enlace = await cambiarDescarga(bd, v[0], v[1], (await leer(c, EdicionEnlace)).permiteDescarga);
    return enlace ? c.json<EnlaceInquilino>(enlace) : noEncontrado(c);
  });

  app.delete(base, async (c) => {
    const v = await delInmueble(c);
    if (!v || !(await revocarEnlace(bd, v[0], v[1]))) return noEncontrado(c);
    return c.body(null, 204);
  });
}
