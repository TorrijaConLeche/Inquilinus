// Rutas del plan de la cuenta (spec 010): estado del plan y elección de los inmuebles activos.
import { EleccionInmuebles, type EstadoPlan, type RespuestaError } from "@inquilinus/contracts";
import type { Cortesias } from "@inquilinus/domain";
import type { Context, Hono } from "hono";
import type { Auth } from "../auth.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import { elegirInmueblesActivos, estadoDelPlan } from "../bloqueo.ts";
import { hoyEnMadrid } from "../fechas.ts";
import { leer, type EntornoSesion as Entorno } from "./comunes.ts";

interface Opciones {
  auth: Auth;
  bd: ConexionBd;
  ahora: () => Date;
  cortesias: Cortesias;
}

export function registrarRutasPlanes(app: Hono<Entorno>, { auth, bd, ahora, cortesias }: Opciones) {
  // El usuario sale de la sesión, nunca de la petición.
  const sesion = async (c: Context<Entorno>, next: () => Promise<void>) => {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!s) return c.json<RespuestaError>({ error: "sin-sesion" }, 401);
    c.set("usuarioId", s.user.id);
    await next();
  };
  app.use("/cuenta/plan", sesion);
  app.use("/cuenta/inmuebles-activos", sesion);

  app.get("/cuenta/plan", async (c) => c.json<EstadoPlan>(await estadoDelPlan(bd, c.get("usuarioId"), cortesias, ahora())));

  app.post("/cuenta/inmuebles-activos", async (c) => {
    const { inmuebles: elegidos } = await leer(c, EleccionInmuebles);
    const instante = ahora();
    const usuarioId = c.get("usuarioId");
    const inmuebles = await elegirInmueblesActivos(bd, usuarioId, cortesias, { instante, hoy: hoyEnMadrid(instante) }, elegidos);
    return c.json<EstadoPlan>(await estadoDelPlan(bd, usuarioId, cortesias, instante, inmuebles));
  });
}
