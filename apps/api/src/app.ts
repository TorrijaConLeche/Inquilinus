import {
  generarOpenApi,
  type RespuestaError,
  type RespuestaSalud,
} from "@inquilinus/contracts";
import { Hono, type Context } from "hono";
import { matchedRoutes } from "hono/route";
import type { Auth } from "./auth.ts";
import { crearRegistro, describirError, type Registro } from "./registro.ts";

export interface Dependencias {
  /**
   * Lanza si la base de datos no responde. Sin ella (por ejemplo, sin
   * DATABASE_URL), el chequeo de salud no consulta la base.
   */
  comprobarBaseDatos?: () => Promise<void>;
  /** Cuentas y sesiones (spec 008), en `<rutaBase>/auth/*`. Sin ella, no hay cuentas. */
  auth?: Auth;
  /** Por defecto, JSON por consola (los logs de Vercel). */
  registro?: Registro;
}

export interface Opciones {
  /** Prefijo de todas las rutas. En la web, la API vive en `/api`. */
  rutaBase?: string;
}

/** Cabecera con el identificador de la petición, para cruzarla con los logs. */
export const CABECERA_ID_PETICION = "x-id-peticion";

type Entorno = { Variables: { idPeticion: string } };

/** El patrón de la ruta (`/inmuebles/:id`), nunca la URL real. */
function patronRuta(c: Context): string {
  const rutas = matchedRoutes(c).filter((r) => r.method !== "ALL");
  return rutas.at(-1)?.path ?? "sin_ruta";
}

export function crearApp(dependencias: Dependencias = {}, opciones: Opciones = {}) {
  const registro = dependencias.registro ?? crearRegistro();
  const base = new Hono<Entorno>();
  const app = opciones.rutaBase ? base.basePath(opciones.rutaBase) : base;
  const openapi = generarOpenApi();

  app.use(async (c, next) => {
    const inicio = performance.now();
    // En Vercel, el id de la petición de la plataforma; en local, uno nuevo.
    const idPeticion = c.req.header("x-vercel-id") ?? crypto.randomUUID();
    c.set("idPeticion", idPeticion);
    await next();
    c.header(CABECERA_ID_PETICION, idPeticion);
    registro.info("peticion", {
      idPeticion,
      metodo: c.req.method,
      ruta: patronRuta(c),
      estado: c.res.status,
      duracionMs: Math.round(performance.now() - inicio),
    });
  });

  app.get("/salud", async (c) => {
    const { comprobarBaseDatos } = dependencias;
    if (!comprobarBaseDatos) {
      return c.json<RespuestaSalud>({ estado: "ok" });
    }
    try {
      await comprobarBaseDatos();
      return c.json<RespuestaSalud>({ estado: "ok", baseDatos: "ok" });
    } catch (error) {
      // En la respuesta, nada; en el registro, solo el tipo y el código.
      registro.aviso("base_datos_no_responde", {
        idPeticion: c.get("idPeticion"),
        ...describirError(error),
      });
      return c.json<RespuestaSalud>({ estado: "error", baseDatos: "error" }, 503);
    }
  });

  app.get("/openapi.json", (c) => c.json(openapi));

  const { auth } = dependencias;
  if (auth) {
    // En el log queda el patrón `/auth/*`, nunca la URL con tokens.
    app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));
  }

  app.notFound((c) => c.json<RespuestaError>({ error: "no-encontrado" }, 404));

  app.onError((error, c) => {
    registro.error("error_no_controlado", {
      idPeticion: c.get("idPeticion"),
      metodo: c.req.method,
      ruta: patronRuta(c),
      ...describirError(error),
    });
    return c.json<RespuestaError>({ error: "interno" }, 500);
  });

  return app;
}
