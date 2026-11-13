// Rutas de documentos y fianza del inquilino (spec 007, R6b–R6e).
// Cuelgan de /inmuebles/:idInmueble/inquilinos/:idInquilino: la sesión ya la
// exige el middleware de inmuebles; aquí se comprueba que el inquilino es suyo.
import {
  ConfirmacionDocumento,
  PeticionFianza,
  TipoDocumento,
  type Documento,
  type Fianza,
  type PermisoSubida,
  type RespuestaError,
} from "@inquilinus/contracts";
import type { Context, Hono } from "hono";
import type { Almacen } from "../almacen.ts";
import { exigirEditable } from "../archivo.ts";
import type { ConexionBd } from "../bd/cliente.ts";
import {
  borrarDocumento,
  borrarFianza,
  guardarDocumento,
  guardarFianza,
  inquilinoSuyo,
  prepararSubida,
  urlDocumento,
} from "../documentos.ts";
import { ids, leer, noEncontrado, type EntornoSesion } from "./comunes.ts";

const BASE = "/inmuebles/:idInmueble/inquilinos/:idInquilino";

export function registrarRutasDocumentos(
  app: Hono<EntornoSesion>,
  { bd, almacen, ahora }: { bd: ConexionBd; almacen: Almacen | undefined; ahora: () => Date },
) {
  /** Id del inquilino si es del usuario (a través de su inmueble); null si no existe o es ajeno. */
  const delUsuario = async (c: Context<EntornoSesion>) => {
    const valores = ids(c, "idInmueble", "idInquilino");
    if (!valores) return null;
    const [inmuebleId, inquilinoId] = valores as [string, string];
    if (!(await inquilinoSuyo(bd, c.get("usuarioId"), inmuebleId, inquilinoId))) return null;
    // R12: de un inquilino anonimizado ya no se guarda nada.
    await exigirEditable(bd, inquilinoId);
    return inquilinoId;
  };

  const tipoDe = (c: Context) => {
    const tipo = TipoDocumento.safeParse(c.req.param("tipo"));
    return tipo.success ? tipo.data : null;
  };

  const sinAlmacen = (c: Context) => c.json<RespuestaError>({ error: "almacen-no-configurado" }, 503);

  // --- Documentos -----------------------------------------------------------

  app.post(`${BASE}/subidas`, async (c) => {
    if (!almacen) return sinAlmacen(c);
    if (!(await delUsuario(c))) return noEncontrado(c);
    return c.json<PermisoSubida>(await prepararSubida(almacen, c.get("usuarioId"), ahora()), 201);
  });

  app.get(`${BASE}/documentos/:tipo`, async (c) => {
    if (!almacen) return sinAlmacen(c);
    const inquilinoId = await delUsuario(c);
    const tipo = tipoDe(c);
    if (!inquilinoId || !tipo) return noEncontrado(c);
    const url = await urlDocumento(bd, almacen, inquilinoId, tipo);
    if (!url) return noEncontrado(c);
    c.header("cache-control", "no-store");
    return c.redirect(url, 302);
  });

  app.put(`${BASE}/documentos/:tipo`, async (c) => {
    if (!almacen) return sinAlmacen(c);
    const inquilinoId = await delUsuario(c);
    const tipo = tipoDe(c);
    if (!inquilinoId || !tipo) return noEncontrado(c);
    const { subidaId, nombre } = await leer(c, ConfirmacionDocumento);
    const documento = await guardarDocumento(bd, almacen, {
      usuarioId: c.get("usuarioId"),
      inquilinoId,
      tipo,
      subidaId,
      nombre,
    });
    return c.json<Documento>(documento);
  });

  app.delete(`${BASE}/documentos/:tipo`, async (c) => {
    if (!almacen) return sinAlmacen(c);
    const inquilinoId = await delUsuario(c);
    const tipo = tipoDe(c);
    if (!inquilinoId || !tipo) return noEncontrado(c);
    if (!(await borrarDocumento(bd, almacen, inquilinoId, tipo))) return noEncontrado(c);
    return c.body(null, 204);
  });

  // --- Fianza ---------------------------------------------------------------

  app.put(`${BASE}/fianza`, async (c) => {
    const inquilinoId = await delUsuario(c);
    if (!inquilinoId) return noEncontrado(c);
    return c.json<Fianza>(await guardarFianza(bd, inquilinoId, await leer(c, PeticionFianza)));
  });

  app.delete(`${BASE}/fianza`, async (c) => {
    const inquilinoId = await delUsuario(c);
    if (!inquilinoId) return noEncontrado(c);
    if (!(await borrarFianza(bd, inquilinoId))) return noEncontrado(c);
    return c.body(null, 204);
  });
}
