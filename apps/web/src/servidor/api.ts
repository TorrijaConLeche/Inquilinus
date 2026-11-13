// Una sola instancia de la API para la ruta /api y para las páginas del servidor.
import "server-only";
import {
  cobrosDelMes,
  crearApp,
  dependenciasDesdeEntorno,
  hoyEnMadrid,
  listarInmuebles,
  listarInquilinos,
  listarTiposGasto,
  mesEnMadrid,
  metodoDobleFactor,
  resumenDelPanel,
  verInmueble,
  type MetodoDobleFactor,
} from "@inquilinus/api";
import type { CobrosDelMes, Inmueble, Inquilino, Panel, ResumenInmueble, TipoGasto } from "@inquilinus/contracts";
import { headers } from "next/headers";

const dependencias = dependenciasDesdeEntorno(process.env, {
  rutaBase: "/api",
  urlPorDefecto: "http://localhost:3000",
});

export const api = crearApp(dependencias, { rutaBase: "/api" });

/** ¿Funciona Google aquí? En las previsualizaciones de Vercel no (su dirección cambia). */
export const googleDisponible =
  Boolean(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]) &&
  process.env["VERCEL_ENV"] !== "preview";

export interface UsuarioSesion {
  id: string;
  email: string;
  nombre: string;
  dobleFactorActivo: boolean;
}

/** Usuario con sesión abierta en esta petición, o null. */
export async function usuarioActual(): Promise<UsuarioSesion | null> {
  const auth = dependencias.auth;
  if (!auth) return null;
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) return null;
  const u = sesion.user as typeof sesion.user & { twoFactorEnabled?: boolean | null };
  return { id: u.id, email: u.email, nombre: u.name, dobleFactorActivo: Boolean(u.twoFactorEnabled) };
}

/** ¿Puede entrar con contraseña? (las cuentas solo de Google no tienen). */
export async function tieneContrasena(): Promise<boolean> {
  const auth = dependencias.auth;
  if (!auth) return false;
  const metodos = await auth.api.listUserAccounts({ headers: await headers() });
  return metodos.some((m) => m.providerId === "credential");
}

/** Método de doble factor activo del usuario: app, email o ninguno (spec 008, R7). */
export async function metodoDobleFactorDe(usuario: UsuarioSesion): Promise<MetodoDobleFactor | null> {
  if (!dependencias.bd) return null;
  return metodoDobleFactor(dependencias.bd, usuario);
}

/** Inmuebles del usuario (spec 007), consultados directamente sin pasar por HTTP. */
/** Inmuebles del usuario; con `archivados`, también los archivados (spec 007, R11c). */
export async function inmueblesDe(usuario: UsuarioSesion, { archivados = false } = {}): Promise<ResumenInmueble[]> {
  if (!dependencias.bd) return [];
  return listarInmuebles(dependencias.bd, usuario.id, { archivados });
}

/** Detalle de un inmueble del usuario, o null si no es suyo o no existe. */
export async function inmuebleDe(usuario: UsuarioSesion, inmuebleId: string): Promise<Inmueble | null> {
  if (!dependencias.bd || !/^[0-9a-f-]{36}$/i.test(inmuebleId)) return null;
  return verInmueble(dependencias.bd, usuario.id, inmuebleId, mesEnMadrid());
}

/** Inmueble con sus inquilinos y tipos de gasto, o null si no es del usuario. */
export async function detalleDe(
  usuario: UsuarioSesion,
  inmuebleId: string,
): Promise<{ inmueble: Inmueble; inquilinos: Inquilino[]; tiposGasto: TipoGasto[] } | null> {
  const inmueble = await inmuebleDe(usuario, inmuebleId);
  if (!inmueble || !dependencias.bd) return null;
  const [inquilinos, tiposGasto] = await Promise.all([
    listarInquilinos(dependencias.bd, inmueble.id),
    listarTiposGasto(dependencias.bd, inmueble.id),
  ]);
  return { inmueble, inquilinos, tiposGasto };
}

/** Pantalla de cobros de un mes del inmueble (spec 009, R6–R13), o null si no es suyo. */
export async function cobrosDe(
  usuario: UsuarioSesion,
  inmuebleId: string,
  mes: string,
): Promise<{ inmueble: Inmueble; inquilinos: Inquilino[]; cobros: CobrosDelMes } | null> {
  const inmueble = await inmuebleDe(usuario, inmuebleId);
  if (!inmueble || !dependencias.bd) return null;
  const [inquilinos, cobros] = await Promise.all([
    listarInquilinos(dependencias.bd, inmueble.id),
    cobrosDelMes(dependencias.bd, inmueble.id, mes, mesEnMadrid()),
  ]);
  return { inmueble, inquilinos, cobros };
}

/** Panel principal del usuario (spec 009, R1–R5b). */
export async function panelDe(usuario: UsuarioSesion): Promise<Panel | null> {
  if (!dependencias.bd) return null;
  return resumenDelPanel(dependencias.bd, usuario.id, hoyEnMadrid());
}
