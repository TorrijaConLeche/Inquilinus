// Una sola instancia de la API para la ruta /api y para las páginas del servidor.
import "server-only";
import {
  cobrosDelMes,
  crearApp,
  datosTimeline,
  dependenciasDesdeEntorno,
  estadoDelPlan,
  hoyEnMadrid,
  listarHistorico,
  listarFacturas,
  listarInmuebles,
  listarInquilinos,
  listarLiquidaciones,
  listarTiposGasto,
  mesEnMadrid,
  metodoDobleFactor,
  resumenDelPanel,
  sincronizarInmuebles,
  verInmueble,
  vistaInquilino,
  type MetodoDobleFactor,
} from "@inquilinus/api";
import type { CobrosDelMes, DatosTimeline, EstadoPlan, VistaInquilino, Factura, FiltrosHistorico, Historico, Inmueble, Inquilino, Liquidacion, Panel, ResumenInmueble, TipoGasto } from "@inquilinus/contracts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const dependencias = dependenciasDesdeEntorno(process.env, {
  rutaBase: "/api",
  urlPorDefecto: "http://localhost:3000",
});

export const api = crearApp(dependencias, { rutaBase: "/api" });

/** Advanced de cortesía (spec 010, R15), leído de PLAN_CORTESIA. */
const cortesias = dependencias.cortesias ?? new Map<string, string | null>();

/**
 * Spec 010, R10–R11: recalcula los inmuebles activos con el plan de hoy, igual que la API
 * al entrar en /inmuebles. Las páginas leen la base directamente y tienen que hacerlo también.
 */
async function sincronizar(usuario: UsuarioSesion) {
  if (!dependencias.bd) return null;
  return sincronizarInmuebles(dependencias.bd, usuario.id, cortesias, hoyEnMadrid());
}

/** Plan de la cuenta, límites, lecturas con IA del mes e inmuebles bloqueados (spec 010). */
export async function planDe(usuario: UsuarioSesion): Promise<EstadoPlan | null> {
  if (!dependencias.bd) return null;
  return estadoDelPlan(dependencias.bd, usuario.id, cortesias, new Date());
}

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

/** Inmuebles del usuario; con `archivados`, también los archivados (spec 007, R11c). */
export async function inmueblesDe(usuario: UsuarioSesion, { archivados = false } = {}): Promise<ResumenInmueble[]> {
  if (!dependencias.bd) return [];
  await sincronizar(usuario);
  return listarInmuebles(dependencias.bd, usuario.id, { archivados });
}

/** Detalle de un inmueble del usuario, o null si no es suyo o no existe. */
export async function inmuebleDe(usuario: UsuarioSesion, inmuebleId: string): Promise<Inmueble | null> {
  if (!dependencias.bd || !/^[0-9a-f-]{36}$/i.test(inmuebleId)) return null;
  // Spec 010, R10b: en un inmueble bloqueado no se entra; vuelve a la lista con el aviso.
  if ((await sincronizar(usuario))?.bloqueados.includes(inmuebleId)) redirect("/inmuebles?bloqueado=1");
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

/** Spec 004: la vista del inquilino de un token, o null si el enlace no está disponible (R4). Sin sesión. */
export async function vistaDe(token: string): Promise<VistaInquilino | null> {
  if (!dependencias.bd) return null;
  return vistaInquilino(dependencias.bd, token, hoyEnMadrid());
}

/** Histórico del inmueble con filtros (spec 012), o null si no es suyo. */
export async function historicoDe(usuario: UsuarioSesion, inmuebleId: string, filtros: FiltrosHistorico = {}): Promise<Historico | null> {
  const inmueble = await inmuebleDe(usuario, inmuebleId);
  if (!inmueble || !dependencias.bd) return null;
  return listarHistorico(dependencias.bd, inmueble.id, filtros);
}

/** Lo que dibuja el timeline del inmueble (spec 006), o null si no es suyo. */
export async function timelineDe(usuario: UsuarioSesion, inmuebleId: string): Promise<DatosTimeline | null> {
  const inmueble = await inmuebleDe(usuario, inmuebleId);
  if (!inmueble || !dependencias.bd) return null;
  return datosTimeline(dependencias.bd, inmueble.id);
}

/** Pantalla de cobros de un mes del inmueble (spec 009, R6–R13), o null si no es suyo. */
export async function cobrosDe(
  usuario: UsuarioSesion,
  inmuebleId: string,
  mes: string,
): Promise<{ inmueble: Inmueble; inquilinos: Inquilino[]; cobros: CobrosDelMes; tiposGasto: TipoGasto[] } | null> {
  const inmueble = await inmuebleDe(usuario, inmuebleId);
  if (!inmueble || !dependencias.bd) return null;
  const [inquilinos, cobros, tiposGasto] = await Promise.all([
    listarInquilinos(dependencias.bd, inmueble.id),
    cobrosDelMes(dependencias.bd, inmueble.id, mes, mesEnMadrid()),
    listarTiposGasto(dependencias.bd, inmueble.id),
  ]);
  return { inmueble, inquilinos, cobros, tiposGasto };
}

/** Panel principal del usuario (spec 009, R1–R5b). */
export async function panelDe(usuario: UsuarioSesion): Promise<Panel | null> {
  if (!dependencias.bd) return null;
  await sincronizar(usuario);
  return resumenDelPanel(dependencias.bd, usuario.id, hoyEnMadrid());
}

/** Facturas del inmueble (por revisar y confirmadas) y sus tipos de gasto (spec 003), o null si no es suyo. */
export async function facturasDe(
  usuario: UsuarioSesion,
  inmuebleId: string,
): Promise<{
  inmueble: Inmueble;
  facturas: Factura[];
  tiposGasto: TipoGasto[];
  inquilinos: Inquilino[];
  liquidaciones: Liquidacion[];
} | null> {
  const inmueble = await inmuebleDe(usuario, inmuebleId);
  if (!inmueble || !dependencias.bd) return null;
  const [facturas, tiposGasto, inquilinos, liquidaciones] = await Promise.all([
    listarFacturas(dependencias.bd, inmueble.id, { porRevisar: false }),
    listarTiposGasto(dependencias.bd, inmueble.id),
    listarInquilinos(dependencias.bd, inmueble.id),
    listarLiquidaciones(dependencias.bd, inmueble.id),
  ]);
  return { inmueble, facturas, tiposGasto, inquilinos, liquidaciones };
}
