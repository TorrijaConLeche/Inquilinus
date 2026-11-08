// Spec 008 · tarea 2.3: registro con email y contraseña, verificación y recuperación.
// PostgreSQL en memoria (PGlite) y un SES falso que guarda los emails.
import { PGlite } from "@electric-sql/pglite";
import { VERSION_TERMINOS } from "@inquilinus/contracts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.ts";
import { crearAuth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import type { Correo, EnviadorCorreo } from "../src/correo/enviador.ts";
import { crearRegistro } from "../src/registro.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";

let bd: ReturnType<typeof crearBd>;
const crearBd = () => drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });

let enviados: Correo[];
let fallarEnvio: boolean;
let lineasLog: string[];
let app: ReturnType<typeof crearApp>;

beforeAll(async () => {
  bd = crearBd();
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
}, 30_000);

beforeEach(() => {
  enviados = [];
  fallarEnvio = false;
  lineasLog = [];
  const correo: EnviadorCorreo = {
    async enviar(c) {
      if (fallarEnvio) throw Object.assign(new Error(`SES rechaza ${c.para}`), { name: "MessageRejected" });
      enviados.push(c);
    },
  };
  const registro = crearRegistro((_nivel, linea) => lineasLog.push(linea));
  const auth = crearAuth({
    bd,
    correo,
    registro,
    secreto: "secreto-de-pruebas-con-mas-de-32-caracteres",
    urlBase: URL_BASE,
    rutaBase: "/api/auth",
  });
  app = crearApp({ auth, registro }, { rutaBase: "/api" });
});

let contador = 0;
const emailNuevo = () => `prueba${++contador}@ejemplo.test`;

function pedir(ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}) {
  return app.request(`/api/auth${ruta}`, {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: { origin: URL_BASE, "content-type": "application/json", ...cabeceras },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

const registrarse = (email: string, extra: Record<string, unknown> = {}, cabeceras?: Record<string, string>) =>
  pedir(
    "/sign-up/email",
    { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS, ...extra },
    cabeceras,
  );

const entrar = (email: string, password = CONTRASENA) => pedir("/sign-in/email", { email, password });

/** La ruta (sin el dominio) del enlace del último email enviado a esa dirección. */
function enlaceDe(email: string): string {
  const correo = [...enviados].reverse().find((c) => c.para === email);
  expect(correo, `no se envió ningún email a ${email}`).toBeDefined();
  const url = correo!.texto.match(/https?:\/\/\S+/)![0];
  return url.replace(URL_BASE, "");
}

async function verificar(email: string) {
  const respuesta = await app.request(enlaceDe(email));
  expect(respuesta.status).toBeLessThan(400);
  return respuesta;
}

/** Cookie de sesión de una respuesta, lista para mandarla en otra petición. */
const cookieDe = (respuesta: Response) =>
  respuesta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function usuarioPorEmail(email: string) {
  const [u] = await bd.select().from(t.usuario).where(eq(t.usuario.email, email));
  return u;
}

describe("registro con email (spec 008)", () => {
  it("C1 — Registro con email (R2): cuenta creada pero bloqueada hasta verificar el email", async () => {
    const email = emailNuevo();
    expect((await registrarse(email)).status).toBe(200);
    expect((await usuarioPorEmail(email))?.emailVerificado).toBe(false);

    const antes = await entrar(email);
    expect(antes.status).toBe(403);
    expect(await antes.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    await verificar(email);
    expect((await usuarioPorEmail(email))?.emailVerificado).toBe(true);
    expect((await entrar(email)).status).toBe(200);
  });

  it("C2 — Contraseña corta (R5): con 10 caracteres, error de validación", async () => {
    const email = emailNuevo();
    const respuesta = await registrarse(email, { password: "0123456789" });
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect(await usuarioPorEmail(email)).toBeUndefined();
  });

  it('C3 — Contraseña larga sin reglas (R5): "password1234" se acepta, solo cuenta la longitud', async () => {
    const email = emailNuevo();
    expect((await registrarse(email, { password: "password1234" })).status).toBe(200);
    await verificar(email);
    expect((await entrar(email, "password1234")).status).toBe(200);
  });

  it("guarda solo el hash de la contraseña (R5)", async () => {
    const email = emailNuevo();
    await registrarse(email);
    const usuario = await usuarioPorEmail(email);
    const [metodo] = await bd.select().from(t.metodoAcceso).where(eq(t.metodoAcceso.usuarioId, usuario!.id));
    expect(metodo?.proveedor).toBe("credential");
    expect(metodo?.contrasenaHash).toBeTruthy();
    expect(metodo?.contrasenaHash).not.toContain(CONTRASENA);
  });

  it("exige aceptar la versión vigente de los términos y guarda cuándo (R4)", async () => {
    const sinAceptar = emailNuevo();
    const respuesta = await registrarse(sinAceptar, { terminosVersion: undefined });
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ code: "TERMINOS_NO_ACEPTADOS" });
    expect(await usuarioPorEmail(sinAceptar)).toBeUndefined();

    const antigua = emailNuevo();
    expect((await registrarse(antigua, { terminosVersion: "version-antigua" })).status).toBe(400);

    const email = emailNuevo();
    await registrarse(email);
    const usuario = await usuarioPorEmail(email);
    expect(usuario?.terminosVersion).toBe(VERSION_TERMINOS);
    expect(usuario?.terminosAceptadosEn).toBeInstanceOf(Date);
  });

  it("el nombre es opcional y nunca se guarda una foto (R15)", async () => {
    const email = emailNuevo();
    await registrarse(email, { image: "https://ejemplo.test/foto.jpg" });
    const usuario = await usuarioPorEmail(email);
    expect(usuario?.nombre).toBe("");
    expect(usuario?.imagen).toBeNull();
  });

  it("envía el email en el idioma del navegador o del ajuste guardado", async () => {
    const enIngles = emailNuevo();
    await registrarse(enIngles, {}, { "accept-language": "en-GB,en;q=0.9" });
    expect(enviados.at(-1)?.asunto).toMatch(/Confirm your email/);

    const conAjuste = emailNuevo();
    await registrarse(conAjuste, {}, { "accept-language": "en", cookie: "idioma=es" });
    expect(enviados.at(-1)?.asunto).toMatch(/Confirma tu email/);
  });

  it("si SES falla, el registro sigue y el log no lleva el email", async () => {
    fallarEnvio = true;
    const email = emailNuevo();
    expect((await registrarse(email)).status).toBe(200);
    const aviso = lineasLog.find((l) => l.includes("correo_no_enviado"));
    expect(aviso).toBeDefined();
    expect(aviso).toContain("MessageRejected");
    expect(lineasLog.join("\n")).not.toContain(email);
  });
});

describe("recuperación de contraseña (spec 008, R6)", () => {
  it("C7 — Recuperación, email inexistente (R6): mismo mensaje que con un email existente", async () => {
    const existente = emailNuevo();
    await registrarse(existente);
    await verificar(existente);
    enviados = [];

    const conCuenta = await pedir("/request-password-reset", { email: existente, redirectTo: "/restablecer" });
    const sinCuenta = await pedir("/request-password-reset", { email: emailNuevo(), redirectTo: "/restablecer" });

    expect(sinCuenta.status).toBe(conCuenta.status);
    expect(await sinCuenta.json()).toEqual(await conCuenta.json());
    expect(enviados.map((c) => c.para)).toEqual([existente]);
  });

  it("C8 — Enlace de recuperación reutilizado (R6): el segundo uso da error", async () => {
    const email = emailNuevo();
    await registrarse(email);
    await verificar(email);
    await pedir("/request-password-reset", { email, redirectTo: "/restablecer" });
    const token = enlaceDe(email).match(/reset-password\/([^?]+)/)![1];

    const nueva = "otra frase larga distinta";
    const primero = await pedir("/reset-password", { token, newPassword: nueva });
    expect(primero.status).toBe(200);
    const segundo = await pedir("/reset-password", { token, newPassword: "y otra frase más larga" });
    expect(segundo.status).toBe(400);

    expect((await entrar(email, nueva)).status).toBe(200);
    expect((await entrar(email)).status).toBe(401);
  });
});

describe("aislamiento (spec 008, R13)", () => {
  it("cada sesión solo ve su propia cuenta", async () => {
    const a = emailNuevo();
    const b = emailNuevo();
    for (const email of [a, b]) {
      await registrarse(email);
      await verificar(email);
    }
    const cookieA = cookieDe(await entrar(a));
    const cookieB = cookieDe(await entrar(b));

    type Sesion = { user: { email: string } };
    const sesionA = (await (await pedir("/get-session", undefined, { cookie: cookieA })).json()) as Sesion;
    const sesionB = (await (await pedir("/get-session", undefined, { cookie: cookieB })).json()) as Sesion;
    expect(sesionA.user.email).toBe(a);
    expect(sesionB.user.email).toBe(b);

    const sinCookie = await (await pedir("/get-session")).json();
    expect(sinCookie).toBeNull();
  });

  it("la cookie de sesión es HttpOnly y SameSite=Lax (R9)", async () => {
    const email = emailNuevo();
    await registrarse(email);
    await verificar(email);
    const cookies = (await entrar(email)).headers.getSetCookie();
    const sesion = cookies.find((c) => c.startsWith("inquilinus.session_token="));
    expect(sesion).toMatch(/HttpOnly/i);
    expect(sesion).toMatch(/SameSite=Lax/i);
  });
});
