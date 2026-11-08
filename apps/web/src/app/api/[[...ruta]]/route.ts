// La API de apps/api, servida por la web en /api (un solo proyecto en Vercel).
import { api } from "../../../servidor/api";

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
