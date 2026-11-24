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
  type Panel,
  type RespuestaError,
  type RespuestaLimiteInmuebles,
} from "@inquilinus/contracts";
import { altaDeInmueble, LIMITES, planesSuperiores, type Cortesias } from "@inquilinus/domain";
import type { Context, Hono } from "hono";
import type { Almacen } from "../almacen.ts";
import { borrarInmueble } from "../archivo.ts";
import type { Auth } from "../auth.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import { vigilarCalculos } from "../cobros.ts";
import { resumenDelPanel } from "../panel.ts";
import { hoyEnMadrid, mesEnMadrid } from "../fechas.ts";
import { inmueblesSinArchivar, planDeCuenta } from "../planes.ts";
import { sincronizarInmuebles } from "../bloqueo.ts";
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
  /** Spec 010, R15: Advanced de cortesía. */
  cortesias: Cortesias;
}

export function registrarRutasInmuebles(app: Hono<Entorno>, { auth, bd, almacen, ahora, cortesias }: Opciones) {
  const mesActual = () => mesEnMadrid(ahora());
  const hoy = () => hoyEnMadrid(ahora());

  /**
   * Spec 005, R6: un cambio que puede alterar el cálculo de meses con cobros
   * marca los que salen distintos. Primero se comprueba que el inmueble es suyo.
   */
  const vigilado = async (c: Context<Entorno>, inmuebleId: string, cambio: () => Promise<boolean>) =>
    (await esSuyo(bd, c.get("usuarioId"), inmuebleId)) ? vigilarCalculos(bd, inmuebleId, cambio) : false;

  // Todas exigen sesión; el usuario sale de la sesión, nunca de la petición.
  app.use("/inmuebles", async (c, next) => sesion(c, next));
  app.use("/inmuebles/*", async (c, next) => sesion(c, next));
  app.use("/panel", async (c, next) => sesion(c, next));

  // Panel principal (spec 009): solo lectura, de todos los inmuebles del usuario.
  app.get("/panel", async (c) => c.json<Panel>(await resumenDelPanel(bd, c.get("usuarioId"), hoy())));
  async function sesion(c: Context<Entorno>, next: () => Promise<void>) {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!s) return c.json<RespuestaError>({ error: "sin-sesion" }, 401);
    c.set("usuarioId", s.user.id);
    // Spec 010, R10–R11: antes de nada, los inmuebles activos con el plan de hoy.
    // R10b: en un inmueble bloqueado no se puede entrar (ni verlo, ni editarlo, ni marcar pagos).
    const { bloqueados } = await sincronizarInmuebles(bd, s.user.id, cortesias, hoy());
    const inmuebleId = /\/inmuebles\/([^/]+)/.exec(c.req.path)?.[1];
    if (inmuebleId && bloqueados.includes(inmuebleId)) {
      return c.json<RespuestaError>({ error: "INMUEBLE_BLOQUEADO" }, 403);
    }
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
    // Spec 010, R1: por encima del límite del plan no se crea; se dice el paso siguiente.
    // (Dos altas a la vez podrían pasarlo por uno; la web no deja pulsar dos veces.)
    const usuarioId = c.get("usuarioId");
    const plan = await planDeCuenta(bd, usuarioId, cortesias, hoy());
    const paso = altaDeInmueble(plan, await inmueblesSinArchivar(bd, usuarioId));
    if (paso !== "permitida") {
      return c.json<RespuestaLimiteInmuebles>(
        { error: "LIMITE_INMUEBLES", plan, limite: LIMITES[plan].inmueblesActivos, siguiente: paso, planes: planesSuperiores(plan) },
        403,
      );
    }
    const id = await crearInmueble(bd, usuarioId, alta, mesActual());
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
