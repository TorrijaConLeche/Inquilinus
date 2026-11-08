// Spec 008 · tarea 2.4: inicio de sesión con Google y vinculación de cuentas.
// Se simula a Google: el intercambio del código por tokens devuelve un id_token
// con el perfil que decide cada test. El resto del flujo es el real de Better Auth.
import { PGlite } from "@electric-sql/pglite";
import { VERSION_TERMINOS } from "@inquilinus/contracts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crearApp } from "../src/app.ts";
import { crearAuth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import type { Correo } from "../src/correo/enviador.ts";
import { crearRegistro } from "../src/registro.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";

let bd: ReturnType<typeof crearBd>;
const crearBd = () => drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });
let app: ReturnType<typeof crearApp>;
let enviados: Correo[];

/** Perfil que "devuelve Google" en el siguiente intercambio de código. */
let perfilGoogle: Record<string, unknown>;

beforeAll(async () => {
  bd = crearBd();
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
}, 30_000);

beforeEach(() => {
  enviados = [];
  const fetchReal = globalThis.fetch;
  vi.stubGlobal("fetch", async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({
        access_token: "token-de-acceso-falso",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: idTokenSinFirmar(perfilGoogle),
      });
    }
    if (url.startsWith("https://")) throw new Error(`Petición externa inesperada en un test: ${url}`);
    return fetchReal(entrada, init);
  });

  const auth = crearAuth({
    bd,
    correo: { enviar: async (c) => void enviados.push(c) },
    registro: crearRegistro(() => {}),
    secreto: "secreto-de-pruebas-con-mas-de-32-caracteres",
    urlBase: URL_BASE,
    rutaBase: "/api/auth",
    google: { idCliente: "cliente-de-pruebas.apps.googleusercontent.com", secreto: "GOCSPX-pruebas" },
  });
  app = crearApp({ auth, registro: crearRegistro(() => {}) }, { rutaBase: "/api" });
});

afterEach(() => vi.unstubAllGlobals());

function idTokenSinFirmar(datos: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: "https://accounts.google.com",
    aud: "cliente-de-pruebas.apps.googleusercontent.com",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...datos,
  })}.`;
}

let contador = 0;
const emailNuevo = () => `google${++contador}@ejemplo.test`;

const cookiesDe = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

function post(ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return app.request(`/api/auth${ruta}`, {
    method: "POST",
    headers: { origin: URL_BASE, "content-type": "application/json", ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
}

/**
 * Hace el viaje completo: la web pide entrar con Google, "Google" devuelve el
 * perfil indicado y la API procesa la vuelta. Devuelve la redirección final.
 */
async function entrarConGoogle(
  perfil: { email: string; email_verified?: boolean; name?: string; sub?: string },
  opciones: { desdeRegistro: boolean },
) {
  perfilGoogle = {
    sub: perfil.sub ?? `sub-${perfil.email}`,
    email: perfil.email,
    email_verified: perfil.email_verified ?? true,
    name: perfil.name ?? "Nombre en Google",
    picture: "https://lh3.googleusercontent.com/foto.jpg",
  };
  const inicio = await post("/sign-in/social", {
    provider: "google",
    callbackURL: "/panel",
    errorCallbackURL: "/acceso",
    ...(opciones.desdeRegistro ? { additionalData: { terminosVersion: VERSION_TERMINOS } } : {}),
  });
  expect(inicio.status).toBe(200);
  const { url } = (await inicio.json()) as { url: string };
  const state = new URL(url).searchParams.get("state")!;

  const vuelta = await app.request(`/api/auth/callback/google?code=codigo-falso&state=${state}`, {
    headers: { cookie: cookiesDe(inicio) },
  });
  return { vuelta, destino: new URL(vuelta.headers.get("location") ?? "/", URL_BASE) };
}

async function usuarioPorEmail(email: string) {
  const [u] = await bd.select().from(t.usuario).where(eq(t.usuario.email, email));
  return u;
}

async function metodosDe(usuarioId: string) {
  const metodos = await bd.select().from(t.metodoAcceso).where(eq(t.metodoAcceso.usuarioId, usuarioId));
  return metodos.map((m) => m.proveedor).sort();
}

async function registrarConEmail(email: string, verificar: boolean) {
  await post("/sign-up/email", { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS });
  if (verificar) {
    const correo = [...enviados].reverse().find((c) => c.para === email)!;
    const enlace = correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, "");
    await app.request(enlace);
  }
  return (await usuarioPorEmail(email))!;
}

describe("inicio de sesión con Google (spec 008)", () => {
  it("pide a Google solo email y perfil básico (R15)", async () => {
    const inicio = await post("/sign-in/social", { provider: "google", callbackURL: "/panel" });
    const { url } = (await inicio.json()) as { url: string };
    const alcances = new URL(url).searchParams.get("scope")!.split(" ").sort();
    expect(alcances).toEqual(["email", "openid", "profile"]);
  });

  it("C5 — Google, email nuevo (R1, R2): cuenta creada y verificada", async () => {
    const email = emailNuevo();
    const { vuelta, destino } = await entrarConGoogle({ email }, { desdeRegistro: true });

    expect(vuelta.status).toBe(302);
    expect(destino.pathname).toBe("/panel");
    expect(vuelta.headers.getSetCookie().some((c) => c.startsWith("inquilinus.session_token="))).toBe(true);

    const usuario = await usuarioPorEmail(email);
    expect(usuario).toMatchObject({
      emailVerificado: true,
      nombre: "Nombre en Google",
      imagen: null,
      terminosVersion: VERSION_TERMINOS,
    });
    expect(usuario?.terminosAceptadosEn).toBeInstanceOf(Date);
    expect(await metodosDe(usuario!.id)).toEqual(["google"]);
  });

  it("C5b — Google sin aceptar los términos (R4): desde la pantalla de acceso, sin cuenta, no se crea", async () => {
    const email = emailNuevo();
    const { destino } = await entrarConGoogle({ email }, { desdeRegistro: false });

    expect(destino.pathname).toBe("/acceso");
    expect(destino.searchParams.get("error")).toBe("TERMINOS_NO_ACEPTADOS");
    expect(await usuarioPorEmail(email)).toBeUndefined();
  });

  it("con cuenta de Google ya creada, entrar desde la pantalla de acceso funciona", async () => {
    const email = emailNuevo();
    await entrarConGoogle({ email }, { desdeRegistro: true });
    const { destino } = await entrarConGoogle({ email }, { desdeRegistro: false });
    expect(destino.pathname).toBe("/panel");
  });

  it("C6 — Google, email existente (R3): se vincula a la cuenta existente", async () => {
    const email = emailNuevo();
    const existente = await registrarConEmail(email, true);

    const { destino } = await entrarConGoogle({ email }, { desdeRegistro: false });

    expect(destino.pathname).toBe("/panel");
    const usuarios = await bd.select().from(t.usuario).where(eq(t.usuario.email, email));
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0]!.id).toBe(existente.id);
    expect(await metodosDe(existente.id)).toEqual(["credential", "google"]);
  });

  it("C6b — Google, email existente sin verificar (R3): no se vincula y se pide confirmar el email", async () => {
    const email = emailNuevo();
    const existente = await registrarConEmail(email, false);

    const { destino } = await entrarConGoogle({ email }, { desdeRegistro: true });

    expect(destino.pathname).toBe("/acceso");
    expect(destino.searchParams.get("error")).toBe("account_not_linked");
    expect(await metodosDe(existente.id)).toEqual(["credential"]);
    expect((await usuarioPorEmail(email))?.emailVerificado).toBe(false);
  });

  it("si Google no confirma el email, no se vincula a una cuenta existente (R3)", async () => {
    const email = emailNuevo();
    const existente = await registrarConEmail(email, true);

    const { destino } = await entrarConGoogle({ email, email_verified: false }, { desdeRegistro: true });

    expect(destino.searchParams.get("error")).toBe("account_not_linked");
    expect(await metodosDe(existente.id)).toEqual(["credential"]);
  });

  it("dos cuentas de Google distintas no se mezclan (R13)", async () => {
    const a = emailNuevo();
    const b = emailNuevo();
    await entrarConGoogle({ email: a }, { desdeRegistro: true });
    const { vuelta } = await entrarConGoogle({ email: b }, { desdeRegistro: true });

    const sesion = await app.request("/api/auth/get-session", {
      headers: { origin: URL_BASE, cookie: cookiesDe(vuelta) },
    });
    const datos = (await sesion.json()) as { user: { email: string } };
    expect(datos.user.email).toBe(b);
  });
});
