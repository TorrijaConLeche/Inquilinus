// Spec 008 · tarea 2.5: límite de intentos (R11), sesión de 30 días (R8),
// cerrar la sesión en todos los dispositivos (R10) y doble factor (R7).
import { PGlite } from "@electric-sql/pglite";
import { VERSION_TERMINOS } from "@inquilinus/contracts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createHmac, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crearApp } from "../src/app.ts";
import { crearAuth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import type { Correo } from "../src/correo/enviador.ts";
import { crearRegistro } from "../src/registro.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";
const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

let bd: ReturnType<typeof crearBd>;
const crearBd = () => drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });
let app: ReturnType<typeof crearApp>;
let enviados: Correo[];
/** Cada test usa su propia IP para que los límites por IP no se crucen. */
let ip: string;

beforeAll(async () => {
  bd = crearBd();
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
}, 30_000);

beforeEach(() => {
  enviados = [];
  ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const auth = crearAuth({
    bd,
    correo: { enviar: async (c) => void enviados.push(c) },
    registro: crearRegistro(() => {}),
    secreto: "secreto-de-pruebas-con-mas-de-32-caracteres",
    urlBase: URL_BASE,
    rutaBase: "/api/auth",
  });
  app = crearApp({ auth, registro: crearRegistro(() => {}) }, { rutaBase: "/api" });
});

afterEach(() => vi.useRealTimers());

/** Avanza el reloj de la app (solo `Date`; la base de datos sigue igual). */
function viajarA(momento: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(momento);
}

let contador = 0;
const emailNuevo = () => `seguridad${++contador}@ejemplo.test`;

function pedir(ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}) {
  return app.request(`/api/auth${ruta}`, {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: { origin: URL_BASE, "content-type": "application/json", "x-forwarded-for": ip, ...cabeceras },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

const cookiesDe = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function cuentaVerificada() {
  const email = emailNuevo();
  await pedir("/sign-up/email", { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  return email;
}

const entrar = (email: string, password = CONTRASENA, extra: Record<string, unknown> = {}) =>
  pedir("/sign-in/email", { email, password, ...extra });

async function sesionDe(cookie: string) {
  return (await (await pedir("/get-session", undefined, { cookie })).json()) as { user: { email: string } } | null;
}

// --- Códigos TOTP como los de una app de autenticación (RFC 6238) ----------

function base32(texto: string): Buffer {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of texto.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}

function codigoTotp(secreto: string, momento = Date.now()): string {
  const contadorTotp = Buffer.alloc(8);
  contadorTotp.writeBigUInt64BE(BigInt(Math.floor(momento / 30_000)));
  const hmac = createHmac("sha1", base32(secreto)).update(contadorTotp).digest();
  const desplazamiento = hmac[hmac.length - 1]! & 0x0f;
  const numero = (hmac.readUInt32BE(desplazamiento) & 0x7fffffff) % 1_000_000;
  return String(numero).padStart(6, "0");
}

/** Activa el doble factor y devuelve el secreto y los códigos de recuperación. */
async function activarDobleFactor(email: string) {
  const cookie = cookiesDe(await entrar(email));
  const activar = await pedir("/two-factor/enable", { password: CONTRASENA }, { cookie });
  expect(activar.status).toBe(200);
  const { totpURI, backupCodes } = (await activar.json()) as { totpURI: string; backupCodes: string[] };
  const secreto = new URL(totpURI).searchParams.get("secret")!;
  // Se confirma con un primer código, como al escanear el QR.
  const confirmar = await pedir("/two-factor/verify-totp", { code: codigoTotp(secreto) }, { cookie });
  expect(confirmar.status).toBe(200);
  return { secreto, backupCodes };
}

// ---------------------------------------------------------------------------

describe("límite de intentos (R11)", () => {
  it("C4 — Intentos fallidos (R11): al sexto intento en 15 minutos, bloqueo de 15 minutos", async () => {
    const email = await cuentaVerificada();
    const inicio = Date.now();
    viajarA(inicio);

    for (let i = 1; i <= 5; i++) expect((await entrar(email, "contraseña equivocada")).status).toBe(401);

    // El sexto intento se bloquea aunque la contraseña sea la buena.
    const bloqueado = await entrar(email);
    expect(bloqueado.status).toBe(429);
    expect(await bloqueado.json()).toMatchObject({ code: "DEMASIADOS_INTENTOS" });

    viajarA(inicio + 14 * MINUTO);
    expect((await entrar(email)).status).toBe(429);

    viajarA(inicio + 16 * MINUTO);
    expect((await entrar(email)).status).toBe(200);
  });

  it("el error es genérico: igual si el email no existe que si la contraseña está mal", async () => {
    const email = await cuentaVerificada();
    const malaContrasena = await entrar(email, "contraseña equivocada");
    const sinCuenta = await entrar(emailNuevo(), "contraseña equivocada");
    expect(sinCuenta.status).toBe(malaContrasena.status);
    expect(await sinCuenta.json()).toEqual(await malaContrasena.json());
  });

  it("bloquea por cuenta aunque cambie la IP", async () => {
    const email = await cuentaVerificada();
    for (let i = 0; i < 5; i++) {
      ip = `10.0.0.${i + 1}`;
      await entrar(email, "contraseña equivocada");
    }
    ip = "10.0.0.99";
    expect((await entrar(email)).status).toBe(429);
  });

  it("bloquea por IP aunque cambie la cuenta, sin afectar a otras IP", async () => {
    const victima = await cuentaVerificada();
    for (let i = 0; i < 5; i++) await entrar(emailNuevo(), "contraseña equivocada");
    expect((await entrar(victima)).status).toBe(429);

    ip = "10.255.255.1";
    expect((await entrar(victima)).status).toBe(200);
  });

  it("los fallos de hace más de 15 minutos no cuentan", async () => {
    const email = await cuentaVerificada();
    const inicio = Date.now();
    viajarA(inicio);
    for (let i = 0; i < 4; i++) await entrar(email, "contraseña equivocada");
    viajarA(inicio + 16 * MINUTO);
    await entrar(email, "contraseña equivocada");
    expect((await entrar(email)).status).toBe(200);
  });

  it("un acceso correcto olvida los fallos de la cuenta", async () => {
    const email = await cuentaVerificada();
    for (let i = 0; i < 4; i++) await entrar(email, "contraseña equivocada");
    expect((await entrar(email)).status).toBe(200);
    ip = "10.254.0.1";
    for (let i = 0; i < 4; i++) await entrar(email, "contraseña equivocada");
    expect((await entrar(email)).status).toBe(200);
  });

  it("no guarda el email ni la IP en claro", async () => {
    const email = await cuentaVerificada();
    await entrar(email, "contraseña equivocada");
    const filas = JSON.stringify(await bd.select().from(t.intentoAcceso));
    expect(filas).not.toContain(email);
    expect(filas).not.toContain(ip);
  });
});

describe("sesión (R8, R10)", () => {
  it("C9 — Recordar dispositivo (R8): sesión válida el día 30; el día 31 pide acceso", async () => {
    const email = await cuentaVerificada();
    const inicio = Date.now();
    viajarA(inicio);
    const cookie = cookiesDe(await entrar(email, CONTRASENA, { rememberMe: true }));

    viajarA(inicio + 29 * DIA + 23 * 60 * MINUTO);
    expect((await sesionDe(cookie))?.user.email).toBe(email);

    viajarA(inicio + 30 * DIA + MINUTO);
    expect(await sesionDe(cookie)).toBeNull();
  });

  it("usar la sesión no la alarga más allá de los 30 días (R8)", async () => {
    const email = await cuentaVerificada();
    const inicio = Date.now();
    viajarA(inicio);
    const cookie = cookiesDe(await entrar(email, CONTRASENA, { rememberMe: true }));
    for (const dia of [5, 15, 25, 29]) {
      viajarA(inicio + dia * DIA);
      expect(await sesionDe(cookie)).not.toBeNull();
    }
    viajarA(inicio + 30 * DIA + MINUTO);
    expect(await sesionDe(cookie)).toBeNull();
  });

  it("sin «recordar este dispositivo», la cookie termina al cerrar el navegador (R8)", async () => {
    const email = await cuentaVerificada();
    const cookies = (await entrar(email, CONTRASENA, { rememberMe: false })).headers.getSetCookie();
    const sesion = cookies.find((c) => c.startsWith("inquilinus.session_token="))!;
    expect(sesion).not.toMatch(/Max-Age|Expires/i);

    const recordando = (await entrar(email, CONTRASENA, { rememberMe: true })).headers.getSetCookie();
    expect(recordando.find((c) => c.startsWith("inquilinus.session_token="))).toMatch(/Max-Age=2592000/);
  });

  it("cerrar la sesión en todos los dispositivos invalida todas (R10)", async () => {
    const email = await cuentaVerificada();
    const movil = cookiesDe(await entrar(email));
    const portatil = cookiesDe(await entrar(email));
    const otraCuenta = await cuentaVerificada();
    const ajena = cookiesDe(await entrar(otraCuenta));

    expect((await pedir("/revoke-sessions", {}, { cookie: movil })).status).toBe(200);

    expect(await sesionDe(movil)).toBeNull();
    expect(await sesionDe(portatil)).toBeNull();
    // Solo las suyas: la sesión de otra cuenta sigue abierta (R13).
    expect((await sesionDe(ajena))?.user.email).toBe(otraCuenta);
  });
});

describe("doble factor (R7)", () => {
  it("C10 — Doble factor (R7): con 2FA activo, pide el código tras la contraseña", async () => {
    const email = await cuentaVerificada();
    const { secreto } = await activarDobleFactor(email);

    const paso1 = await entrar(email);
    expect(paso1.status).toBe(200);
    expect(await paso1.json()).toMatchObject({ twoFactorRedirect: true });
    // Sin el código no hay sesión: la cookie de sesión llega vacía y caducada.
    expect(await sesionDe(cookiesDe(paso1))).toBeNull();

    const paso2 = await pedir("/two-factor/verify-totp", { code: codigoTotp(secreto) }, { cookie: cookiesDe(paso1) });
    expect(paso2.status).toBe(200);
    expect((await sesionDe(cookiesDe(paso2)))?.user.email).toBe(email);
  });

  it("guarda el secreto cifrado, nunca en claro", async () => {
    const email = await cuentaVerificada();
    const { secreto, backupCodes } = await activarDobleFactor(email);
    const [usuario] = await bd.select().from(t.usuario).where(eq(t.usuario.email, email));
    expect(usuario?.dobleFactorActivo).toBe(true);
    const [fila] = await bd.select().from(t.dobleFactor).where(eq(t.dobleFactor.usuarioId, usuario!.id));
    expect(fila?.secreto).not.toContain(secreto);
    expect(fila?.codigosRecuperacion).not.toContain(backupCodes[0]!);
  });

  it("un código de recuperación sirve una sola vez", async () => {
    const email = await cuentaVerificada();
    const { backupCodes } = await activarDobleFactor(email);
    const codigo = backupCodes[0]!;

    const primero = await entrar(email);
    const usar = await pedir("/two-factor/verify-backup-code", { code: codigo }, { cookie: cookiesDe(primero) });
    expect(usar.status).toBe(200);

    const segundo = await entrar(email);
    const repetir = await pedir("/two-factor/verify-backup-code", { code: codigo }, { cookie: cookiesDe(segundo) });
    expect(repetir.status).toBe(401);
  });

  it("tras 5 códigos fallidos seguidos, bloquea el doble factor 15 minutos (R11)", async () => {
    const email = await cuentaVerificada();
    const { secreto } = await activarDobleFactor(email);
    const paso1 = cookiesDe(await entrar(email));

    for (let i = 0; i < 5; i++) {
      await pedir("/two-factor/verify-totp", { code: "000000" }, { cookie: paso1 });
    }
    const conBueno = await pedir("/two-factor/verify-totp", { code: codigoTotp(secreto) }, { cookie: paso1 });
    expect(conBueno.status).not.toBe(200);
    expect(await sesionDe(cookiesDe(conBueno))).toBeNull();
  });
});
