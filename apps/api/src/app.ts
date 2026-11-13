import {
  generarOpenApi,
  PeticionBorrarCuenta,
  type RespuestaError,
  type RespuestaSalud,
} from "@inquilinus/contracts";
import { ErrorValidacion } from "@inquilinus/domain";
import { Hono, type Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { matchedRoutes } from "hono/route";
import type { Almacen } from "./almacen.ts";
import type { Auth } from "./auth.ts";
import type { ConexionBd } from "./bd/cliente.ts";
import { borrarCuenta, exportarDatos } from "./cuenta.ts";
import { ErrorPeticion } from "./inmuebles.ts";
import type { Limitador } from "./limitador.ts";
import { crearRegistro, describirError, type Registro } from "./registro.ts";
import { registrarRutasCobros } from "./rutas/cobros.ts";
import { registrarRutasDocumentos } from "./rutas/documentos.ts";
import { registrarRutasInmuebles } from "./rutas/inmuebles.ts";
import { registrarRutasInquilinos } from "./rutas/inquilinos.ts";

export interface Dependencias {
  /** Reloj (por defecto, la hora real). Los tests lo fijan para controlar el mes actual. */
  ahora?: () => Date;
  /** Conexión a la base de datos (Neon en producción, PGlite en los tests). */
  bd?: ConexionBd;
  /** Limitador de intentos, para olvidar el contador de una cuenta al borrarla. */
  limitador?: Limitador;
  /**
   * Bucket privado de ficheros (spec 007, R6c). Sin él no se pueden subir
   * documentos ni borrar una cuenta que tenga ficheros.
   */
  almacen?: Almacen;
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

type Entorno = { Variables: { idPeticion: string; usuarioId: string } };

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

  const { auth, bd } = dependencias;
  if (auth) {
    // En el log queda el patrón `/auth/*`, nunca la URL con tokens.
    app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));
  }

  // Rutas con sesión: cuenta (spec 008) e inmuebles (spec 007). Para cambiar
  // datos, solo desde la propia app (cabecera Origin igual a la de la API).
  if (auth && bd) {
    const sesionDe = (c: Context) => auth.api.getSession({ headers: c.req.raw.headers });

    // Contra peticiones desde otras webs (CSRF): todo lo que no sea leer exige
    // la cabecera Origin del mismo dominio. El middleware csrf de Hono no sirve
    // aquí: solo mira formularios, y un atacante podría mandar el JSON como texto.
    const soloMismoOrigen = async (c: Context, next: () => Promise<void>) => {
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        const host = c.req.header("host") ?? new URL(c.req.url).host;
        let hostOrigen: string | null = null;
        try {
          hostOrigen = new URL(c.req.header("origin") ?? "").host;
        } catch {
          hostOrigen = null;
        }
        if (hostOrigen !== host) return c.json<RespuestaError>({ error: "origen-no-permitido" }, 403);
      }
      await next();
    };
    for (const ruta of ["/cuenta/*", "/inmuebles", "/inmuebles/*"]) app.use(ruta, soloMismoOrigen);

    const ahora = dependencias.ahora ?? (() => new Date());
    registrarRutasInmuebles(app, { auth, bd, almacen: dependencias.almacen, ahora });
    registrarRutasInquilinos(app, { bd, almacen: dependencias.almacen, ahora });
    registrarRutasDocumentos(app, { bd, almacen: dependencias.almacen, ahora });
    registrarRutasCobros(app, { bd, ahora });

    app.get("/cuenta/exportacion", async (c) => {
      const sesion = await sesionDe(c);
      if (!sesion) return c.json<RespuestaError>({ error: "sin-sesion" }, 401);
      const datos = await exportarDatos(bd, sesion.user.id);
      const fecha = datos.exportadoEn.slice(0, 10);
      c.header("content-disposition", `attachment; filename="inquilinus-datos-${fecha}.json"`);
      c.header("cache-control", "no-store");
      return c.json(datos);
    });

    app.post("/cuenta/borrar", async (c) => {
      const sesion = await sesionDe(c);
      if (!sesion) return c.json<RespuestaError>({ error: "sin-sesion" }, 401);
      const peticion = PeticionBorrarCuenta.safeParse(await c.req.json().catch(() => null));
      const email = sesion.user.email.trim().toLowerCase();
      if (!peticion.success || peticion.data.email.toLowerCase() !== email) {
        return c.json<RespuestaError>({ error: "email-no-coincide" }, 400);
      }
      await borrarCuenta(bd, sesion.user.id, {
        ...(dependencias.almacen && { borrarFicheros: dependencias.almacen.borrar }),
        ...(dependencias.limitador && { claveIntentos: dependencias.limitador.claves(email, null).cuenta }),
      });
      registro.info("cuenta_borrada", { idPeticion: c.get("idPeticion") });
      // Las sesiones ya no existen; se borra también la cookie del navegador.
      for (const nombre of ["inquilinus.session_token", "inquilinus.session_data", "inquilinus.dont_remember"]) {
        deleteCookie(c, nombre, { path: "/" });
        deleteCookie(c, `__Secure-${nombre}`, { path: "/", secure: true });
      }
      return c.body(null, 204);
    });
  }

  app.notFound((c) => c.json<RespuestaError>({ error: "no-encontrado" }, 404));

  app.onError((error, c) => {
    // Datos que no cumplen las reglas (dominio o petición): 400 con el código.
    if (error instanceof ErrorValidacion || error instanceof ErrorPeticion) {
      return c.json<RespuestaError>({ error: error.codigo }, 400);
    }
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
