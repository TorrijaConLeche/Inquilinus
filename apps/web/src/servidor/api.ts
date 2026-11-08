// Una sola instancia de la API para la ruta /api y para las páginas del servidor.
import "server-only";
import { crearApp, dependenciasDesdeEntorno, metodoDobleFactor, type MetodoDobleFactor } from "@inquilinus/api";
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
