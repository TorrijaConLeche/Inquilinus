import { serve } from "@hono/node-server";
import { crearApp } from "./app.ts";

const puerto = Number(process.env["PORT"] ?? 3001);

serve({ fetch: crearApp().fetch, port: puerto }, (info) => {
  console.log(`API escuchando en http://localhost:${info.port}`);
});
