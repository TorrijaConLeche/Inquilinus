// Spec 008, R1b: registro por invitación durante la beta cerrada.
// Con email y con Google (simulado como en google.test.ts: el intercambio del
// código devuelve un id_token con el perfil que decide cada test).
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
import { listaInvitados } from "../src/invitados.ts";
import { crearRegistro } from "../src/registro.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";

const crearBd = () => drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });
let bd: ReturnType<typeof crearBd>;
let app: ReturnType<typeof crearApp>;
let enviados: Correo[];
let lineasLog: string[];
let perfilGoogle: Record<string, unknown>;

beforeAll(async () => {
  bd = crearBd();
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
}, 30_000);

beforeEach(() => {
  enviados = [];
  lineasLog = [];
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
});

afterEach(() => vi.unstubAllGlobals());

/** Monta la app con la lista de invitados tal como llega de REGISTRO_INVITADOS. */
function montar(variable: string | undefined) {
  const registro = crearRegistro((_nivel, linea) => lineasLog.push(linea));
  const auth = crearAuth({
    bd,
    correo: { enviar: async (c) => void enviados.push(c) },
    registro,
    secreto: "secreto-de-pruebas-con-mas-de-32-caracteres",
    urlBase: URL_BASE,
    rutaBase: "/api/auth",
    google: { idCliente: "cliente-de-pruebas.apps.googleusercontent.com", secreto: "GOCSPX-pruebas" },
    invitados: listaInvitados(variable),
  });
  app = crearApp({ auth, registro }, { rutaBase: "/api" });
}

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
const emailNuevo = () => `invitacion${++contador}@ejemplo.test`;

const cookiesDe = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

function post(ruta: string, cuerpo: unknown) {
  return app.request(`/api/auth${ruta}`, {
    method: "POST",
    headers: { origin: URL_BASE, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

const registrarse = (email: string) =>
  post("/sign-up/email", { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS });

async function usuarioPorEmail(email: string) {
  const [u] = await bd.select().from(t.usuario).where(eq(t.usuario.email, email.toLowerCase()));
  return u;
}

/** Viaje completo con Google desde el registro (con términos) o desde el acceso. */
async function entrarConGoogle(email: string, opciones: { desdeRegistro: boolean }) {
  perfilGoogle = { sub: `sub-${email}`, email, email_verified: true, name: "Nombre en Google" };
  const inicio = await post("/sign-in/social", {
    provider: "google",
    callbackURL: "/panel",
    errorCallbackURL: opciones.desdeRegistro ? "/registro" : "/acceso",
    ...(opciones.desdeRegistro ? { additionalData: { terminosVersion: VERSION_TERMINOS } } : {}),
  });
  expect(inicio.status).toBe(200);
  const { url } = (await inicio.json()) as { url: string };
  const state = new URL(url).searchParams.get("state")!;
  const vuelta = await app.request(`/api/auth/callback/google?code=codigo-falso&state=${state}`, {
    headers: { cookie: cookiesDe(inicio) },
  });
  return new URL(vuelta.headers.get("location") ?? "/", URL_BASE);
}

describe("registro por invitación (R1b)", () => {
  it("C14 · registro con email no invitado: REGISTRO_CERRADO, sin cuenta ni email", async () => {
    montar("ana@ejemplo.test");
    const respuesta = await registrarse("luis@ejemplo.test");

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ code: "REGISTRO_CERRADO" });
    expect(await usuarioPorEmail("luis@ejemplo.test")).toBeUndefined();
    expect(enviados).toEqual([]);
    // La lista y el email no van al log.
    expect(lineasLog.join("\n")).not.toMatch(/ejemplo\.test/);
  });

  it("C14b · registro con email invitado, sin distinguir mayúsculas ni espacios", async () => {
    montar(" Ana@Ejemplo.test , otra@ejemplo.test");
    const respuesta = await registrarse("ana@ejemplo.test");

    expect(respuesta.status).toBe(200);
    expect(await usuarioPorEmail("ana@ejemplo.test")).toBeDefined();
    expect(enviados.map((c) => c.para)).toEqual(["ana@ejemplo.test"]);
  });

  it("C14c · Google no invitado: no se crea la cuenta y vuelve al registro con REGISTRO_CERRADO", async () => {
    montar("ana@ejemplo.test");
    const email = emailNuevo();
    const destino = await entrarConGoogle(email, { desdeRegistro: true });

    expect(destino.pathname).toBe("/registro");
    expect(destino.searchParams.get("error")).toBe("REGISTRO_CERRADO");
    expect(await usuarioPorEmail(email)).toBeUndefined();
  });

  it("C14d · una cuenta existente entra con contraseña y con Google aunque no esté en la lista", async () => {
    const conContrasena = emailNuevo();
    const conGoogle = emailNuevo();
    montar("*");
    await registrarse(conContrasena);
    const enlace = enviados.at(-1)!.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, "");
    await app.request(enlace);
    await entrarConGoogle(conGoogle, { desdeRegistro: true });

    montar("otra@ejemplo.test");
    const acceso = await post("/sign-in/email", { email: conContrasena, password: CONTRASENA });
    expect(acceso.status).toBe(200);
    expect((await entrarConGoogle(conGoogle, { desdeRegistro: false })).pathname).toBe("/panel");
  });

  it("C14e · lista vacía o `*`: sin la variable nadie se registra; con `*`, cualquiera", async () => {
    for (const variable of [undefined, "", " , "]) {
      montar(variable);
      const email = emailNuevo();
      const respuesta = await registrarse(email);
      expect(respuesta.status).toBe(400);
      expect(await usuarioPorEmail(email)).toBeUndefined();
    }

    montar("*");
    const email = emailNuevo();
    expect((await registrarse(email)).status).toBe(200);
    expect(await usuarioPorEmail(email)).toBeDefined();
  });
});
