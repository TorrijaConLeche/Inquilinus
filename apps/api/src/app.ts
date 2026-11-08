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

  app.get("/salud", async (c) => {
    const { comprobarBaseDatos } = dependencias;
    if (!comprobarBaseDatos) {
      return c.json({ estado: "ok" });
    }
    try {
      await comprobarBaseDatos();
      return c.json({ estado: "ok", baseDatos: "ok" });
    } catch {
      // Sin detalle del error: puede incluir datos de conexión.
      return c.json({ estado: "error", baseDatos: "error" }, 503);
    }
  });

  app.notFound((c) => c.json({ error: "no-encontrado" }, 404));

  app.onError((error, c) => {
    // Solo el tipo de error, nunca el mensaje (RGPD). El registro completo
    // llega con la tarea 1.9.
    console.error(`Error no controlado: ${error.name}`);
    return c.json({ error: "interno" }, 500);
  });

  return app;
}
