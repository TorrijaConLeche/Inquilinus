// Spec 008 · tarea 2.7: exportar y borrar la cuenta (R14).
import { PGlite } from "@electric-sql/pglite";
import { ExportacionCuenta, VERSION_TERMINOS } from "@inquilinus/contracts";
import { eq, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { crearApp, type Dependencias } from "../src/app.ts";
import { crearAuth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import type { Correo } from "../src/correo/enviador.ts";
import { TABLAS_NO_EXPORTADAS } from "../src/cuenta.ts";
import { crearLimitador } from "../src/limitador.ts";
import { crearRegistro } from "../src/registro.ts";

const URL_BASE = "http://localhost:3000";
const SECRETO = "secreto-de-pruebas-con-mas-de-32-caracteres";
const CONTRASENA = "una frase larga y segura";

type Bd = ReturnType<typeof crearBd>;
const crearBd = () => drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });

let bd: Bd;
let enviados: Correo[];
let ficherosBorrados: string[][];
let app: ReturnType<typeof crearApp>;

/** Cómo se comporta el bucket de ficheros en cada test. */
type Bucket = "funciona" | "falla" | "sin-configurar";

/** Cada test tiene su base de datos, para poder comprobar que no queda nada. */
async function montar(bucket: Bucket = "funciona") {
  bd = crearBd();
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  enviados = [];
  ficherosBorrados = [];
  const registro = crearRegistro(() => {});
  const limitador = crearLimitador(bd, SECRETO);
  const auth = crearAuth({
    bd,
    limitador,
    correo: { enviar: async (c) => void enviados.push(c) },
    registro,
    secreto: SECRETO,
    urlBase: URL_BASE,
    rutaBase: "/api/auth",
  });
  const dependencias: Dependencias = { auth, bd, limitador, registro };
  if (bucket === "funciona") dependencias.borrarFicheros = async (claves) => void ficherosBorrados.push(claves);
  if (bucket === "falla") {
    dependencias.borrarFicheros = async () => {
      throw new Error("S3 no responde");
    };
  }
  app = crearApp(dependencias, { rutaBase: "/api" });
}

beforeEach(() => montar(), 30_000);

/** Como el navegador: URL completa y cabecera Origin de la propia app. */
function pedir(ruta: string, opciones: { cuerpo?: unknown; cookie?: string; origen?: string } = {}) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: opciones.cuerpo === undefined ? "GET" : "POST",
    headers: {
      origin: opciones.origen ?? URL_BASE,
      "content-type": "application/json",
      ...(opciones.cookie ? { cookie: opciones.cookie } : {}),
    },
    ...(opciones.cuerpo === undefined ? {} : { body: JSON.stringify(opciones.cuerpo) }),
  });
}

const cookiesDe = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/** Crea una cuenta verificada, entra y devuelve su id y su cookie de sesión. */
async function cuenta(email: string) {
  await pedir("/auth/sign-up/email", {
    cuerpo: { email, password: CONTRASENA, name: "Ana", terminosVersion: VERSION_TERMINOS },
  });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const cookie = cookiesDe(await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } }));
  const [u] = await bd.select().from(t.usuario).where(eq(t.usuario.email, email));
  return { id: u!.id, email, cookie };
}

/** Una fila en cada tabla de negocio, colgando de la cuenta. Devuelve los ids creados. */
async function sembrar(usuarioId: string, etiqueta: string) {
  const uno = async <T>(promesa: Promise<T[]>) => (await promesa)[0]!;
  const fichero = await uno(
    bd.insert(t.fichero).values({ usuarioId, claveS3: `privado/${etiqueta}.pdf`, nombreOriginal: `${etiqueta}.pdf`, mime: "application/pdf", tamanoBytes: 10, sha256: "x" }).returning(),
  );
  const inmueble = await uno(bd.insert(t.inmueble).values({ usuarioId, nombre: `Piso de ${etiqueta}`, modalidad: "habitaciones" }).returning());
  const habitacion = await uno(bd.insert(t.habitacion).values({ inmuebleId: inmueble.id, nombre: "Hab. 1" }).returning());
  await bd.insert(t.precioHabitacion).values({ habitacionId: habitacion.id, desdeMes: "2026-01", precioMensual: 45_000 });
  const inquilino = await uno(bd.insert(t.inquilino).values({ inmuebleId: inmueble.id, nombre: `Inquilino de ${etiqueta}` }).returning());
  await bd.insert(t.ocupacion).values({ inmuebleId: inmueble.id, habitacionId: habitacion.id, inquilinoId: inquilino.id, entrada: "2026-01-01" });
  const tipo = await uno(bd.insert(t.tipoGasto).values({ inmuebleId: inmueble.id, nombre: "Luz", color: "amarillo" }).returning());
  const liquidacion = await uno(bd.insert(t.liquidacion).values({ inmuebleId: inmueble.id, numero: 1, nombre: "Enero", mes: "2026-01" }).returning());
  const factura = await uno(
    bd.insert(t.factura).values({ tipoGastoId: tipo.id, ficheroId: fichero.id, lote: crypto.randomUUID(), liquidacionId: liquidacion.id }).returning(),
  );
  const reparto = await uno(bd.insert(t.reparto).values({ facturaId: factura.id, detalle: {} }).returning());
  await bd.insert(t.repartoLinea).values({ repartoId: reparto.id, inquilinoId: inquilino.id, dias: 31, importe: 1_000 });
  await bd.insert(t.cobroAlquiler).values({ inquilinoId: inquilino.id, mes: "2026-01", renta: 45_000, importe: 45_000, fechaCobro: "2026-01-01", origen: "auto" });
  await bd.insert(t.fianza).values({ inquilinoId: inquilino.id, importe: 90_000, ficheroId: fichero.id });
  await bd.insert(t.documento).values({ inquilinoId: inquilino.id, tipo: "contrato", ficheroId: fichero.id });
  await bd.insert(t.enlaceInquilino).values({ inquilinoId: inquilino.id, tokenHash: `hash-secreto-${etiqueta}` });
  await bd.insert(t.actividad).values({ inmuebleId: inmueble.id, inquilinoId: inquilino.id, tipo: "alta", detalle: {} });
  await bd.insert(t.suscripcion).values({ usuarioId, plan: "starter", periodicidad: "mensual", estado: "active" });
  await bd.insert(t.usoIa).values({ usuarioId, mes: "2026-01", facturasLeidas: 1 });
  return { inmueble: inmueble.id, inquilino: inquilino.id, fichero: fichero.id };
}

/** Todas las filas de todas las tablas, como texto, para buscar restos. */
async function volcado() {
  const tablas = Object.values(t).filter((v) => is(v, PgTable)) as PgTable[];
  const partes = await Promise.all(tablas.map(async (tabla) => JSON.stringify(await bd.select().from(tabla))));
  return partes.join("\n");
}

describe("exportar los datos (spec 008, R14)", () => {
  it("C12b — Exportar datos (R14): trae la cuenta y sus inmuebles, nada de otra cuenta y ningún secreto", async () => {
    const a = await cuenta("a@ejemplo.test");
    const b = await cuenta("b@ejemplo.test");
    await sembrar(a.id, "A");
    await sembrar(b.id, "B");

    const respuesta = await pedir("/cuenta/exportacion", { cookie: a.cookie });
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-disposition")).toMatch(/attachment; filename="inquilinus-datos-\d{4}-\d{2}-\d{2}\.json"/);
    const datos = ExportacionCuenta.parse(await respuesta.json());
    const texto = JSON.stringify(datos);

    expect(datos.tablas["usuario"]).toEqual([expect.objectContaining({ email: a.email, dobleFactorMetodo: null })]);
    expect(datos.tablas["inmueble"]).toEqual([expect.objectContaining({ nombre: "Piso de A" })]);
    expect(datos.tablas["inquilino"]).toEqual([expect.objectContaining({ nombre: "Inquilino de A" })]);
    expect(datos.tablas["metodo_acceso"]).toEqual([expect.objectContaining({ proveedor: "credential" })]);

    // Nada de la otra cuenta.
    expect(texto).not.toContain(b.email);
    expect(texto).not.toContain("de B");

    // Ningún secreto.
    const [metodo] = await bd.select().from(t.metodoAcceso).where(eq(t.metodoAcceso.usuarioId, a.id));
    const sesiones = await bd.select().from(t.sesion).where(eq(t.sesion.usuarioId, a.id));
    expect(texto).not.toContain(metodo!.contrasenaHash!);
    for (const s of sesiones) expect(texto).not.toContain(s.token);
    expect(texto).not.toContain("hash-secreto-A");
    expect(texto).not.toContain("privado/A.pdf");
    expect(texto).not.toMatch(/contrasenaHash|tokenHash|"token"/);
  });

  it("toda tabla del esquema se exporta o está en la lista de excluidas, con motivo", async () => {
    const a = await cuenta("a@ejemplo.test");
    const datos = ExportacionCuenta.parse(await (await pedir("/cuenta/exportacion", { cookie: a.cookie })).json());
    const todas = Object.values(t)
      .filter((v) => is(v, PgTable))
      .map((tabla) => getTableName(tabla as PgTable))
      .sort();
    const cubiertas = [...Object.keys(datos.tablas), ...Object.keys(TABLAS_NO_EXPORTADAS)].sort();
    expect(cubiertas).toEqual(todas);
  });

  it("sin sesión no exporta nada", async () => {
    expect((await pedir("/cuenta/exportacion")).status).toBe(401);
  });
});

describe("borrar la cuenta (spec 008, R14)", () => {
  it("C12 — Borrar cuenta (R14): no queda ningún dato ni fichero de la cuenta", async () => {
    const a = await cuenta("a@ejemplo.test");
    const b = await cuenta("b@ejemplo.test");
    const idsA = await sembrar(a.id, "A");
    await sembrar(b.id, "B");
    // Un fallo de acceso deja un contador para A (y otro para B).
    await pedir("/auth/sign-in/email", { cuerpo: { email: a.email, password: "equivocada del todo" } });
    await pedir("/auth/sign-in/email", { cuerpo: { email: b.email, password: "equivocada del todo" } });
    const exportacionB = (await (await pedir("/cuenta/exportacion", { cookie: b.cookie })).json()) as object;

    const respuesta = await pedir("/cuenta/borrar", { cuerpo: { email: "A@Ejemplo.test " }, cookie: a.cookie });
    expect(respuesta.status).toBe(204);

    // Ni rastro de A en ninguna tabla.
    const todo = await volcado();
    for (const resto of [a.id, a.email, idsA.inmueble, idsA.inquilino, idsA.fichero, "Piso de A", "Inquilino de A"]) {
      expect(todo).not.toContain(resto);
    }
    // El contador de intentos de A desaparece; el de B (y el de la IP, compartida) siguen.
    const contadores = (await bd.select().from(t.intentoAcceso)).map((f) => f.clave);
    const huellas = crearLimitador(bd, SECRETO);
    expect(contadores).not.toContain(huellas.claves(a.email, null).cuenta);
    expect(contadores).toContain(huellas.claves(b.email, null).cuenta);

    // Los ficheros se mandaron borrar del bucket.
    expect(ficherosBorrados).toEqual([["privado/A.pdf"]]);

    // Su sesión ya no vale y la cookie se borra en el navegador.
    expect(await (await pedir("/auth/get-session", { cookie: a.cookie })).json()).toBeNull();
    expect(respuesta.headers.getSetCookie().some((c) => /^inquilinus\.session_token=;/.test(c))).toBe(true);

    // B sigue exactamente igual (salvo la hora de la exportación).
    const despuesB = (await (await pedir("/cuenta/exportacion", { cookie: b.cookie })).json()) as object;
    expect({ ...despuesB, exportadoEn: null }).toEqual({ ...exportacionB, exportadoEn: null });
  });

  it("si el email no coincide, no borra nada", async () => {
    const a = await cuenta("a@ejemplo.test");
    await sembrar(a.id, "A");
    const respuesta = await pedir("/cuenta/borrar", { cuerpo: { email: "otro@ejemplo.test" }, cookie: a.cookie });
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toEqual({ error: "email-no-coincide" });
    expect(await bd.select().from(t.inmueble)).toHaveLength(1);
  });

  it("sin sesión no borra nada", async () => {
    const a = await cuenta("a@ejemplo.test");
    expect((await pedir("/cuenta/borrar", { cuerpo: { email: a.email } })).status).toBe(401);
    expect(await bd.select().from(t.usuario)).toHaveLength(1);
  });

  it("una petición desde otra web no puede borrar la cuenta", async () => {
    const a = await cuenta("a@ejemplo.test");
    const respuesta = await pedir("/cuenta/borrar", { cuerpo: { email: a.email }, cookie: a.cookie, origen: "https://malvado.example" });
    expect(respuesta.status).toBe(403);
    // Tampoco sin cabecera Origin, ni mandando el JSON como texto plano.
    const sinOrigen = await app.request(`${URL_BASE}/api/cuenta/borrar`, {
      method: "POST",
      headers: { "content-type": "text/plain", cookie: a.cookie },
      body: JSON.stringify({ email: a.email }),
    });
    expect(sinOrigen.status).toBe(403);
    expect(await bd.select().from(t.usuario)).toHaveLength(1);
  });

  it("una cuenta solo puede borrarse a sí misma (aislamiento)", async () => {
    const a = await cuenta("a@ejemplo.test");
    const b = await cuenta("b@ejemplo.test");
    // A escribe el email de B: no coincide con su sesión y no se borra nadie.
    expect((await pedir("/cuenta/borrar", { cuerpo: { email: b.email }, cookie: a.cookie })).status).toBe(400);
    expect(await bd.select().from(t.usuario)).toHaveLength(2);
  });

  it("si el bucket falla, no se borra nada de la base de datos", async () => {
    await montar("falla");
    const a = await cuenta("a@ejemplo.test");
    await sembrar(a.id, "A");
    const respuesta = await pedir("/cuenta/borrar", { cuerpo: { email: a.email }, cookie: a.cookie });
    expect(respuesta.status).toBe(500);
    expect(await bd.select().from(t.usuario)).toHaveLength(1);
    expect(await bd.select().from(t.inmueble)).toHaveLength(1);
  });

  it("con ficheros y sin bucket configurado, no se borra nada", async () => {
    await montar("sin-configurar");
    const a = await cuenta("a@ejemplo.test");
    await sembrar(a.id, "A");
    expect((await pedir("/cuenta/borrar", { cuerpo: { email: a.email }, cookie: a.cookie })).status).toBe(500);
    expect(await bd.select().from(t.usuario)).toHaveLength(1);
  });
});
