// Rutas de inmuebles, habitaciones y precios (spec 007).
import {
  AltaInmueble,
  CambioPrecio,
  EdicionHabitacion,
  EdicionInmueble,
  NuevaHabitacion,
  type Inmueble,
  type ListaInmuebles,
  type RespuestaError,
} from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { Auth } from "../auth.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import { mesEnMadrid } from "../fechas.ts";
import {
  cambiarPrecio,
  crearHabitacion,
  crearInmueble,
  editarInmueble,
  ErrorPeticion,
  listarInmuebles,
  renombrarHabitacion,
  verInmueble,
} from "../inmuebles.ts";

type Entorno = { Variables: { idPeticion: string; usuarioId: string } };

interface Opciones {
  auth: Auth;
  bd: ConexionBd;
  /** Reloj, para fijar el mes actual en los tests. */
  ahora: () => Date;
}

const Uuid = z.uuid();

/** Lee el cuerpo y lo valida; si no encaja, 400 con DATOS_INVALIDOS. */
async function leer<T extends z.ZodType>(c: Context, esquema: T): Promise<z.infer<T>> {
  const datos = esquema.safeParse(await c.req.json().catch(() => undefined));
  if (!datos.success) throw new ErrorPeticion("DATOS_INVALIDOS");
  return datos.data;
}

export function registrarRutasInmuebles(app: Hono<Entorno>, { auth, bd, ahora }: Opciones) {
  const noEncontrado = (c: Context) => c.json<RespuestaError>({ error: "no-encontrado" }, 404);
  const mesActual = () => mesEnMadrid(ahora());

  // Todas exigen sesión; el usuario sale de la sesión, nunca de la petición.
  app.use("/inmuebles", async (c, next) => sesion(c, next));
  app.use("/inmuebles/*", async (c, next) => sesion(c, next));
  async function sesion(c: Context<Entorno>, next: () => Promise<void>) {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!s) return c.json<RespuestaError>({ error: "sin-sesion" }, 401);
    c.set("usuarioId", s.user.id);
    await next();
  }

  /** Ids de la URL: si no tienen forma de UUID, el recurso no existe. */
  const ids = (c: Context, ...nombres: string[]) => {
    const valores = nombres.map((n) => c.req.param(n) ?? "");
    return valores.every((v) => Uuid.safeParse(v).success) ? valores : null;
  };

  const detalle = async (c: Context<Entorno>, inmuebleId: string, estado: 200 | 201 = 200) => {
    const inmueble = await verInmueble(bd, c.get("usuarioId"), inmuebleId, mesActual());
    return inmueble ? c.json<Inmueble>(inmueble, estado) : noEncontrado(c);
  };

  app.get("/inmuebles", async (c) => {
    const inmuebles = await listarInmuebles(bd, c.get("usuarioId"), {
      archivados: c.req.query("archivados") === "true",
    });
    return c.json<ListaInmuebles>({ inmuebles });
  });

  app.post("/inmuebles", async (c) => {
    const alta = await leer(c, AltaInmueble);
    const id = await crearInmueble(bd, c.get("usuarioId"), alta, mesActual());
    return detalle(c, id, 201);
  });

  app.get("/inmuebles/:idInmueble", async (c) => {
    const valores = ids(c, "idInmueble");
    return valores ? detalle(c, valores[0]!) : noEncontrado(c);
  });

  app.patch("/inmuebles/:idInmueble", async (c) => {
    const valores = ids(c, "idInmueble");
    if (!valores) return noEncontrado(c);
    // R2: la modalidad no se puede cambiar; se dice claramente en vez de un error genérico.
    const crudo = await c.req.raw.clone().json().catch(() => undefined);
    if (crudo && typeof crudo === "object" && "modalidad" in crudo) throw new ErrorPeticion("MODALIDAD_NO_EDITABLE");
    const edicion = await leer(c, EdicionInmueble);
    if (!(await editarInmueble(bd, c.get("usuarioId"), valores[0]!, edicion))) return noEncontrado(c);
    return detalle(c, valores[0]!);
  });

  app.post("/inmuebles/:idInmueble/habitaciones", async (c) => {
    const valores = ids(c, "idInmueble");
    if (!valores) return noEncontrado(c);
    const nueva = await leer(c, NuevaHabitacion);
    if (!(await crearHabitacion(bd, c.get("usuarioId"), valores[0]!, nueva, mesActual()))) return noEncontrado(c);
    return detalle(c, valores[0]!, 201);
  });

  app.patch("/inmuebles/:idInmueble/habitaciones/:idHabitacion", async (c) => {
    const valores = ids(c, "idInmueble", "idHabitacion");
    if (!valores) return noEncontrado(c);
    const { nombre } = await leer(c, EdicionHabitacion);
    if (!(await renombrarHabitacion(bd, c.get("usuarioId"), valores[0]!, valores[1]!, nombre))) return noEncontrado(c);
    return detalle(c, valores[0]!);
  });

  app.post("/inmuebles/:idInmueble/habitaciones/:idHabitacion/precios", async (c) => {
    const valores = ids(c, "idInmueble", "idHabitacion");
    if (!valores) return noEncontrado(c);
    const cambio = await leer(c, CambioPrecio);
    if (!(await cambiarPrecio(bd, c.get("usuarioId"), valores[0]!, valores[1]!, cambio))) return noEncontrado(c);
    return detalle(c, valores[0]!);
  });
}
