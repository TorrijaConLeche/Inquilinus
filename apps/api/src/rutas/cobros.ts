// Rutas de cobros de alquiler (spec 005). Cuelgan de /inmuebles/:idInmueble:
// la sesión ya la exige el middleware de inmuebles; aquí se comprueba que el
// inmueble es del usuario.
import {
  EdicionCobro,
  GeneracionCobros,
  Mes,
  NuevoCobro,
  PagoTodo,
  Recalculo,
  type Cobro,
  type CobrosDelMes,
  type ListaCobros,
  type ResultadoGeneracion,
  type ResultadoPagoTodo,
} from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { ConexionBd } from "../bd/cliente.ts";
import { cobrosDelMes, crearCobro, editarCobro, generarCobros, listarCobros, pagarTodo, recalcularCobro } from "../cobros.ts";
import { ErrorPeticion } from "../errores.ts";
import { hoyEnMadrid, mesEnMadrid } from "../fechas.ts";
import { esSuyo } from "../inmuebles.ts";
import { ids, leer, noEncontrado, type EntornoSesion } from "./comunes.ts";

export function registrarRutasCobros(app: Hono<EntornoSesion>, { bd, ahora }: { bd: ConexionBd; ahora: () => Date }) {
  /** Ids de la URL ya validados y con el inmueble comprobado como propio; null si no. */
  const delInmueble = async (c: Context<EntornoSesion>, ...otros: string[]) => {
    const valores = ids(c, "idInmueble", ...otros);
    if (!valores || !(await esSuyo(bd, c.get("usuarioId"), valores[0]!))) return null;
    return valores;
  };

  app.get("/inmuebles/:idInmueble/cobros", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const mes = c.req.query("mes");
    if (mes !== undefined && !Mes.safeParse(mes).success) throw new ErrorPeticion("DATOS_INVALIDOS");
    const cobros = await listarCobros(bd, v[0]!, { mes, quitados: c.req.query("quitados") === "true" });
    return c.json<ListaCobros>({ cobros });
  });

  app.post("/inmuebles/:idInmueble/cobros", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const cobro = await crearCobro(bd, v[0]!, await leer(c, NuevoCobro));
    return cobro ? c.json<Cobro>(cobro, 201) : noEncontrado(c);
  });

  app.get("/inmuebles/:idInmueble/cobros/mes/:mes", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const mes = Mes.safeParse(c.req.param("mes"));
    if (!mes.success) throw new ErrorPeticion("DATOS_INVALIDOS");
    return c.json<CobrosDelMes>(await cobrosDelMes(bd, v[0]!, mes.data, mesEnMadrid(ahora())));
  });

  app.post("/inmuebles/:idInmueble/cobros/pagar-todo", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const marcados = await pagarTodo(bd, v[0]!, await leer(c, PagoTodo), hoyEnMadrid(ahora()));
    return marcados ? c.json<ResultadoPagoTodo>({ marcados }) : noEncontrado(c);
  });

  app.post("/inmuebles/:idInmueble/cobros/generar", async (c) => {
    const v = await delInmueble(c);
    if (!v) return noEncontrado(c);
    const { mes } = await leer(c, GeneracionCobros);
    const creados = await generarCobros(bd, v[0]!, mes, mesEnMadrid(ahora()));
    return c.json<ResultadoGeneracion>({ creados }, 201);
  });

  app.patch("/inmuebles/:idInmueble/cobros/:idCobro", async (c) => {
    const v = await delInmueble(c, "idCobro");
    if (!v) return noEncontrado(c);
    const cobro = await editarCobro(bd, v[0]!, v[1]!, await leer(c, EdicionCobro), hoyEnMadrid(ahora()));
    return cobro ? c.json<Cobro>(cobro) : noEncontrado(c);
  });

  app.post("/inmuebles/:idInmueble/cobros/:idCobro/recalcular", async (c) => {
    const v = await delInmueble(c, "idCobro");
    if (!v) return noEncontrado(c);
    const { confirmar } = await leer(c, Recalculo);
    const cobro = await recalcularCobro(bd, v[0]!, v[1]!, confirmar === true);
    return cobro ? c.json<Cobro>(cobro) : noEncontrado(c);
  });
}
