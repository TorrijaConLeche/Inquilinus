// Rutas de inmuebles, habitaciones y precios (spec 007).
import {
  AltaInmueble,
  BorradoInmueble,
  CambioPrecio,
  EdicionHabitacion,
  EdicionInmueble,
  NuevaHabitacion,
  type Inmueble,
  type ListaInmuebles,
  type RespuestaError,
} from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { Almacen } from "../almacen.ts";
import { borrarInmueble } from "../archivo.ts";
import type { Auth } from "../auth.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import { vigilarCobros } from "../cobros.ts";
import { hoyEnMadrid, mesEnMadrid } from "../fechas.ts";
import {
  borrarHabitacionSuya,
  cambiarPrecio,
  crearHabitacion,
  crearInmueble,
  editarHabitacion,
  editarInmueble,
  ErrorPeticion,
  esSuyo,
  listarInmuebles,
  verInmueble,
} from "../inmuebles.ts";
import { ids, leer, noEncontrado, type EntornoSesion as Entorno } from "./comunes.ts";

interface Opciones {
  auth: Auth;
  bd: ConexionBd;
  /** Bucket de ficheros, para borrar los de un inmueble (R13). */
  almacen: Almacen | undefined;
  /** Reloj, para fijar el mes actual en los tests. */
  ahora: () => Date;
}

export function registrarRutasInmuebles(app: Hono<Entorno>, { auth, bd, almacen, ahora }: Opciones) {
  const mesActual = () => mesEnMadrid(ahora());
  const hoy = () => hoyEnMadrid(ahora());

  /**
   * Spec 005, R6: un cambio que puede alterar el cálculo de meses con cobros
   * marca los que salen distintos. Primero se comprueba que el inmueble es suyo.
   */
  const vigilado = async (c: Context<Entorno>, inmuebleId: string, cambio: () => Promise<boolean>) =>
    (await esSuyo(bd, c.get("usuarioId"), inmuebleId)) ? vigilarCobros(bd, inmuebleId, cambio) : false;

  // Todas exigen sesión; el usuario sale de la sesión, nunca de la petición.
  app.use("/inmuebles", async (c, next) => sesion(c, next));
  app.use("/inmuebles/*", async (c, next) => sesion(c, next));
  async function sesion(c: Context<Entorno>, next: () => Promise<void>) {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!s) return c.json<RespuestaError>({ error: "sin-sesion" }, 401);
    c.set("usuarioId", s.user.id);
    await next();
  }

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
    const editado = await vigilado(c, valores[0]!, () => editarInmueble(bd, c.get("usuarioId"), valores[0]!, edicion, hoy()));
    if (!editado) return noEncontrado(c);
    return detalle(c, valores[0]!);
  });

  app.delete("/inmuebles/:idInmueble", async (c) => {
    const valores = ids(c, "idInmueble");
    if (!valores) return noEncontrado(c);
    const { nombre } = await leer(c, BorradoInmueble);
    if (!(await borrarInmueble(bd, almacen, c.get("usuarioId"), valores[0]!, nombre))) return noEncontrado(c);
    return c.body(null, 204);
  });

  app.post("/inmuebles/:idInmueble/habitaciones", async (c) => {
    const valores = ids(c, "idInmueble");
    if (!valores) return noEncontrado(c);
    const nueva = await leer(c, NuevaHabitacion);
    const creada = await vigilado(c, valores[0]!, () => crearHabitacion(bd, c.get("usuarioId"), valores[0]!, nueva, mesActual()));
    if (!creada) return noEncontrado(c);
    return detalle(c, valores[0]!, 201);
  });

  app.patch("/inmuebles/:idInmueble/habitaciones/:idHabitacion", async (c) => {
    const valores = ids(c, "idInmueble", "idHabitacion");
    if (!valores) return noEncontrado(c);
    const edicion = await leer(c, EdicionHabitacion);
    const editada = await vigilado(c, valores[0]!, () =>
      editarHabitacion(bd, c.get("usuarioId"), valores[0]!, valores[1]!, edicion, hoy()),
    );
    if (!editada) return noEncontrado(c);
    return detalle(c, valores[0]!);
  });

  app.delete("/inmuebles/:idInmueble/habitaciones/:idHabitacion", async (c) => {
    const valores = ids(c, "idInmueble", "idHabitacion");
    if (!valores) return noEncontrado(c);
    const borrada = await vigilado(c, valores[0]!, () => borrarHabitacionSuya(bd, c.get("usuarioId"), valores[0]!, valores[1]!));
    if (!borrada) return noEncontrado(c);
    return detalle(c, valores[0]!);
  });

  app.post("/inmuebles/:idInmueble/habitaciones/:idHabitacion/precios", async (c) => {
    const valores = ids(c, "idInmueble", "idHabitacion");
    if (!valores) return noEncontrado(c);
    const cambio = await leer(c, CambioPrecio);
    const cambiado = await vigilado(c, valores[0]!, () => cambiarPrecio(bd, c.get("usuarioId"), valores[0]!, valores[1]!, cambio));
    if (!cambiado) return noEncontrado(c);
    return detalle(c, valores[0]!);
  });
}
