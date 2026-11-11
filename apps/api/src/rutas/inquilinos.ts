// Rutas de inquilinos, ocupaciones y tipos de gasto (spec 007).
// Cuelgan de /inmuebles/:idInmueble: la sesión ya la exige el middleware de
// inmuebles; aquí se comprueba primero que el inmueble es del usuario.
import {
  CambioHabitacion,
  EdicionInquilino,
  EdicionOcupacion,
  EdicionTipoGasto,
  NuevaOcupacion,
  NuevoInquilino,
  NuevoTipoGasto,
  type Inquilino,
  type ListaInquilinos,
  type ListaTiposGasto,
  type TipoGasto,
} from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { ConexionBd } from "../bd/cliente.ts";
import { esSuyo } from "../inmuebles.ts";
import {
  cambiarHabitacion,
  crearInquilino,
  crearOcupacion,
  crearTipoGasto,
  editarOcupacion,
  editarTipoGasto,
  listarInquilinos,
  listarTiposGasto,
  renombrarInquilino,
  verInquilino,
} from "../inquilinos.ts";
import { ids, leer, noEncontrado, type EntornoSesion } from "./comunes.ts";

export function registrarRutasInquilinos(app: Hono<EntornoSesion>, { bd }: { bd: ConexionBd }) {
  /**
   * Ids de la URL ya validados y con el inmueble comprobado como propio;
   * null si algo no existe o es de otra cuenta.
   */
  const delInmueble = async (c: Context<EntornoSesion>, ...otros: string[]) => {
    const valores = ids(c, "idInmueble", ...otros);
    if (!valores || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return null;
    return valores;
  };

  const responderInquilino = async (c: Context<EntornoSesion>, inmuebleId: string, inquilinoId: string, estado: 200 | 201 = 200) => {
    const inquilino = await verInquilino(bd, inmuebleId, inquilinoId);
    return inquilino ? c.json<Inquilino>(inquilino, estado) : noEncontrado(c);
  };

  // --- Inquilinos -----------------------------------------------------------

  app.get("/inmuebles/:idInmueble/inquilinos", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    return c.json<ListaInquilinos>({ inquilinos: await listarInquilinos(bd, v[0]!) });
  });

  app.post("/inmuebles/:idInmueble/inquilinos", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const id = await crearInquilino(bd, v[0]!, await leer(c, NuevoInquilino));
    return responderInquilino(c, v[0]!, id, 201);
  });

  app.patch("/inmuebles/:idInmueble/inquilinos/:idInquilino", async (c) => {
    const v = await delInmueble(c, "idInquilino");
    if (!v) return noEncontrado(c);
    const { nombre } = await leer(c, EdicionInquilino);
    if (!(await renombrarInquilino(bd, v[0]!, v[1]!, nombre))) return noEncontrado(c);
    return responderInquilino(c, v[0]!, v[1]!);
  });

  // --- Ocupaciones ----------------------------------------------------------

  app.post("/inmuebles/:idInmueble/inquilinos/:idInquilino/ocupaciones", async (c) => {
    const v = await delInmueble(c, "idInquilino");
    if (!v) return noEncontrado(c);
    const nueva = await leer(c, NuevaOcupacion);
    if (!(await crearOcupacion(bd, v[0]!, v[1]!, nueva))) return noEncontrado(c);
    return responderInquilino(c, v[0]!, v[1]!, 201);
  });

  app.post("/inmuebles/:idInmueble/inquilinos/:idInquilino/cambio-habitacion", async (c) => {
    const v = await delInmueble(c, "idInquilino");
    if (!v) return noEncontrado(c);
    const cambio = await leer(c, CambioHabitacion);
    if (!(await cambiarHabitacion(bd, v[0]!, v[1]!, cambio))) return noEncontrado(c);
    return responderInquilino(c, v[0]!, v[1]!);
  });

  app.patch("/inmuebles/:idInmueble/ocupaciones/:idOcupacion", async (c) => {
    const v = await delInmueble(c, "idOcupacion");
    if (!v) return noEncontrado(c);
    const inquilinoId = await editarOcupacion(bd, v[0]!, v[1]!, await leer(c, EdicionOcupacion));
    if (!inquilinoId) return noEncontrado(c);
    return responderInquilino(c, v[0]!, inquilinoId);
  });

  // --- Tipos de gasto -------------------------------------------------------

  app.get("/inmuebles/:idInmueble/tipos-gasto", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    return c.json<ListaTiposGasto>({ tiposGasto: await listarTiposGasto(bd, v[0]!) });
  });

  app.post("/inmuebles/:idInmueble/tipos-gasto", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    return c.json<TipoGasto>(await crearTipoGasto(bd, v[0]!, await leer(c, NuevoTipoGasto)), 201);
  });

  app.patch("/inmuebles/:idInmueble/tipos-gasto/:idTipoGasto", async (c) => {
    const v = await delInmueble(c, "idTipoGasto");
    if (!v) return noEncontrado(c);
    const tipo = await editarTipoGasto(bd, v[0]!, v[1]!, await leer(c, EdicionTipoGasto));
    return tipo ? c.json<TipoGasto>(tipo) : noEncontrado(c);
  });
}
