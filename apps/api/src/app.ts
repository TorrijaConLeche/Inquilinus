import {
  generarOpenApi,
  type RespuestaError,
  type RespuestaSalud,
} from "@inquilinus/contracts";
import { Hono } from "hono";

export interface Dependencias {
  /**
   * Lanza si la base de datos no responde. Opcional hasta que exista el
   * esquema (tarea 1.7); sin ella, el chequeo de salud no consulta la base.
   */
  comprobarBaseDatos?: () => Promise<void>;
}

export function crearApp(dependencias: Dependencias = {}) {
  const app = new Hono();
  const openapi = generarOpenApi();

  app.get("/salud", async (c) => {
    const { comprobarBaseDatos } = dependencias;
    if (!comprobarBaseDatos) {
      return c.json<RespuestaSalud>({ estado: "ok" });
    }
    try {
      await comprobarBaseDatos();
      return c.json<RespuestaSalud>({ estado: "ok", baseDatos: "ok" });
    } catch {
      // Sin detalle del error: puede incluir datos de conexión.
      return c.json<RespuestaSalud>({ estado: "error", baseDatos: "error" }, 503);
    }
  });

  app.get("/openapi.json", (c) => c.json(openapi));

  app.notFound((c) => c.json<RespuestaError>({ error: "no-encontrado" }, 404));

  app.onError((error, c) => {
    // Solo el tipo de error, nunca el mensaje (RGPD). El registro completo
    // llega con la tarea 1.9.
    console.error(`Error no controlado: ${error.name}`);
    return c.json<RespuestaError>({ error: "interno" }, 500);
  });

  return app;
}
