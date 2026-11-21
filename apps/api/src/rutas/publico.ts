// Rutas públicas de la vista del inquilino (spec 004). Sin sesión: el token
// del enlace es la llave. En el log queda el patrón de la ruta, nunca el token.
import type { RespuestaError, VistaInquilino } from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { EntornoSesion } from "./comunes.ts";
import type { Almacen } from "../almacen.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import { hoyEnMadrid } from "../fechas.ts";
import { pdfParaInquilino, vistaInquilino } from "../publico.ts";

/** R11: ni caché compartida, ni buscadores, ni el token en la cabecera Referer. */
function cabecerasPrivadas(c: Context) {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Robots-Tag", "noindex, nofollow");
}

// R4: el mismo mensaje sea cual sea el motivo.
const noDisponible = (c: Context) => c.json<RespuestaError>({ error: "ENLACE_NO_DISPONIBLE" }, 404);

export function registrarRutasPublico(
  app: Hono<EntornoSesion>,
  { bd, almacen, ahora }: { bd: ConexionBd; almacen: Almacen | undefined; ahora: () => Date },
) {
  app.use("/publico/*", async (c, next) => {
    await next();
    cabecerasPrivadas(c);
  });

  app.get("/publico/:token", async (c) => {
    const vista = await vistaInquilino(bd, c.req.param("token"), hoyEnMadrid(ahora()));
    return vista ? c.json<VistaInquilino>(vista) : noDisponible(c);
  });

  app.get("/publico/:token/facturas/:idFactura/pdf", async (c) => {
    const idFactura = c.req.param("idFactura");
    if (!/^[0-9a-f-]{36}$/i.test(idFactura)) return noDisponible(c);
    const url = await pdfParaInquilino(bd, almacen, c.req.param("token"), idFactura, hoyEnMadrid(ahora()));
    return url ? c.redirect(url, 302) : noDisponible(c);
  });
}
