// Rutas del plan de la cuenta (spec 010): estado del plan y elección de los inmuebles activos.
import { EleccionInmuebles, type EstadoPlan, type RespuestaError } from "@inquilinus/contracts";
import { avisarFinDeCortesia, LIMITES, lecturasIaDisponibles, mesDeUsoIa, type Cortesias } from "@inquilinus/domain";
import type { Context, Hono } from "hono";
import type { Auth } from "../auth.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import { elegirInmueblesActivos, sincronizarInmuebles, type EstadoInmuebles } from "../bloqueo.ts";
import { hoyEnMadrid } from "../fechas.ts";
import { facturasLeidasEnElMes, planYCortesia } from "../planes.ts";
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

  /** Lo que se responde: el plan con su cortesía, los límites y lo usado este mes. */
  const responder = async (c: Context<Entorno>, inmuebles: EstadoInmuebles, instante: Date) => {
    const usuarioId = c.get("usuarioId");
    const hoy = hoyEnMadrid(instante);
    const [{ plan, cortesiaHasta }, usadas] = await Promise.all([
      planYCortesia(bd, usuarioId, cortesias, hoy),
      facturasLeidasEnElMes(bd, usuarioId, mesDeUsoIa(instante)),
    ]);
    return c.json<EstadoPlan>({
      plan,
      cortesia:
        cortesiaHasta === undefined ? null : { hasta: cortesiaHasta, avisarFin: avisarFinDeCortesia(cortesiaHasta, hoy) },
      limites: { inmuebles: LIMITES[plan].inmueblesActivos, facturasIaAlMes: LIMITES[plan].facturasIaAlMes },
      lecturasIa: { usadas, disponibles: lecturasIaDisponibles(plan, usadas) },
      inmuebles: { activos: inmuebles.activos, bloqueados: inmuebles.bloqueados },
      puedeElegir: inmuebles.puedeElegir,
    });
  };

  app.get("/cuenta/plan", async (c) => {
    const instante = ahora();
    const inmuebles = await sincronizarInmuebles(bd, c.get("usuarioId"), cortesias, hoyEnMadrid(instante));
    return responder(c, inmuebles, instante);
  });

  app.post("/cuenta/inmuebles-activos", async (c) => {
    const { inmuebles: elegidos } = await leer(c, EleccionInmuebles);
    const instante = ahora();
    const inmuebles = await elegirInmueblesActivos(
      bd,
      c.get("usuarioId"),
      cortesias,
      { instante, hoy: hoyEnMadrid(instante) },
      elegidos,
    );
    return responder(c, inmuebles, instante);
  });
}
