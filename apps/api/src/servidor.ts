import { serve } from "@hono/node-server";
import { crearApp } from "./app.ts";
import { dependenciasDesdeEntorno } from "./configuracion.ts";

const puerto = Number(process.env["PORT"] ?? 3001);

const dependencias = dependenciasDesdeEntorno(process.env, {
  rutaBase: "",
  urlPorDefecto: `http://localhost:${puerto}`,
});
const app = crearApp(dependencias);

serve({ fetch: app.fetch, port: puerto }, (info) => {
  console.log(`API escuchando en http://localhost:${info.port}`);
  if (!dependencias.comprobarBaseDatos) console.log("Sin DATABASE_URL: no hay base de datos.");
  if (!dependencias.auth) console.log("Sin cuentas: faltan variables de entorno (ver .env.example).");
});
