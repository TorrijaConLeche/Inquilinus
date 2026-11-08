// La API de apps/api, servida por la web en /api (un solo proyecto en Vercel).
import { crearApp, dependenciasDesdeEntorno } from "@inquilinus/api";

const api = crearApp(
  dependenciasDesdeEntorno(process.env, { rutaBase: "/api", urlPorDefecto: "http://localhost:3000" }),
  { rutaBase: "/api" },
);

const atender = (peticion: Request) => api.fetch(peticion);

export const dynamic = "force-dynamic";
export {
  atender as DELETE,
  atender as GET,
  atender as HEAD,
  atender as OPTIONS,
  atender as PATCH,
  atender as POST,
  atender as PUT,
};
