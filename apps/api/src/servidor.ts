import { serve } from "@hono/node-server";
import { crearApp } from "./app.ts";
import { comprobadorBaseDatos, crearBaseDatos } from "./bd/cliente.ts";

const puerto = Number(process.env["PORT"] ?? 3001);
const urlBaseDatos = process.env["DATABASE_URL"];

const app = crearApp(
  urlBaseDatos ? { comprobarBaseDatos: comprobadorBaseDatos(crearBaseDatos(urlBaseDatos)) } : {},
);

serve({ fetch: app.fetch, port: puerto }, (info) => {
  console.log(`API escuchando en http://localhost:${info.port}`);
  if (!urlBaseDatos) console.log("Sin DATABASE_URL: el chequeo de salud no consulta la base de datos.");
});
