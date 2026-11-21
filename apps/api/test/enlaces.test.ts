// Spec 004 · tarea 6.4: enlaces del inquilino.
import { PGlite } from "@electric-sql/pglite";
import {
  EnlaceGenerado,
  EnlaceInquilino,
  Historico,
  Inmueble,
  Inquilino,
  ListaInquilinos,
  VERSION_TERMINOS,
} from "@inquilinus/contracts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.ts";
import { crearAuth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import { enlacePorToken } from "../src/enlaces.ts";
import type { Correo } from "../src/correo/enviador.ts";
import { crearRegistro } from "../src/registro.ts";
import { crearAlmacenMemoria } from "./almacen-memoria.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";

let app: ReturnType<typeof crearApp>;
let bd: ReturnType<typeof drizzle<typeof t>>;
const almacen = crearAlmacenMemoria();
const enviados: Correo[] = [];

beforeAll(async () => {
  bd = drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const registro = crearRegistro(() => {});
  const auth = crearAuth({
    bd,
    correo: { enviar: async (c) => void enviados.push(c) },
    registro,
    secreto: "secreto-de-pruebas-con-mas-de-32-caracteres",
    urlBase: URL_BASE,
    rutaBase: "/api/auth",
  });
  // Hoy es el 2026-11-02 en Madrid.
  app = crearApp({ auth, bd, registro, almacen, ahora: () => new Date("2026-11-02T10:00:00Z") }, { rutaBase: "/api" });
}, 30_000);

function pedir(ruta: string, { metodo, cuerpo, cookie }: { metodo?: string; cuerpo?: unknown; cookie?: string } = {}) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: { origin: URL_BASE, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

let contador = 0;
async function cuenta() {
  const email = `enlaces${++contador}@ejemplo.test`;
  await pedir("/auth/sign-up/email", { cuerpo: { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS } });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

const error = async (r: Response) => ((await r.json()) as { error: string }).error;

/** Piso con A en H1 desde el 1 de septiembre. */
async function escenario() {
  const cookie = await cuenta();
  const i = Inmueble.parse(
    await (
      await pedir("/inmuebles", {
        cuerpo: { nombre: "Piso Centro", modalidad: "habitaciones", habitaciones: [{ nombre: "H1", precioMensual: 50_000, desdeMes: "2026-01" }] },
        cookie,
      })
    ).json(),
  );
  const base = `/inmuebles/${i.id}`;
  const a = Inquilino.parse(
    await (await pedir(`${base}/inquilinos`, { cuerpo: { nombre: "A", ocupacion: { habitacionId: i.habitaciones[0]!.id, entrada: "2026-09-01" } }, cookie })).json(),
  );
  const ruta = `${base}/inquilinos/${a.id}/enlace`;
  const generar = async () => {
    const r = await pedir(ruta, { cuerpo: {}, cookie });
    return { r, datos: r.status === 201 ? EnlaceGenerado.parse(await r.json()) : null };
  };
  const listado = async () =>
    ListaInquilinos.parse(await (await pedir(`${base}/inquilinos`, { cookie })).json()).inquilinos.find((q) => q.id === a.id)!;
  return { cookie, base, i, a, ruta, generar, listado };
}

const tipos = (h: Historico) => h.actividades.map((x) => x.tipo);

describe("Spec 004 · enlaces del inquilino", () => {
  it("C1 · generar: el token solo viene en la respuesta, se guarda su hash y funciona", async () => {
    const e = await escenario();
    const { r, datos } = await e.generar();
    expect(r.status).toBe(201);
    expect(datos!.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(datos!.enlace).toMatchObject({ permiteDescarga: true, caducaEl: null, disponible: true });
    // R1: en la base solo está el hash.
    const filas = await bd.select().from(t.enlaceInquilino).where(eq(t.enlaceInquilino.inquilinoId, e.a.id));
    expect(filas).toHaveLength(1);
    expect(filas[0]!.tokenHash).not.toContain(datos!.token);
    expect(JSON.stringify(filas)).not.toContain(datos!.token);
    expect(await enlacePorToken(bd, datos!.token, "2026-10-01")).toEqual({ inquilinoId: e.a.id, inmuebleId: e.i.id, permiteDescarga: true });
    // R2c: después, la ficha sabe que existe, pero no el token.
    const q = await e.listado();
    expect(q.enlace).toMatchObject({ permiteDescarga: true, caducaEl: null, disponible: true });
    expect(JSON.stringify(q)).not.toContain(datos!.token);
    // Uno vigente por inquilino.
    const otra = await e.generar();
    expect(otra.r.status).toBe(400);
    expect(await error(otra.r)).toBe("ENLACE_EXISTENTE");
  });

  it("C2 · revocado: deja de funcionar y la ficha ya no lo muestra", async () => {
    const e = await escenario();
    const { datos } = await e.generar();
    expect((await pedir(e.ruta, { metodo: "DELETE", cookie: e.cookie })).status).toBe(204);
    expect(await enlacePorToken(bd, datos!.token, "2026-10-01")).toBeNull();
    expect((await e.listado()).enlace).toBeNull();
    expect((await pedir(e.ruta, { metodo: "DELETE", cookie: e.cookie })).status).toBe(404);
  });

  it("C3 · caducidad: A sale el 2026-09-30; válido el 2026-12-30, caducado el 2026-12-31", async () => {
    const e = await escenario();
    const { datos } = await e.generar();
    const q = await e.listado();
    await pedir(`${e.base}/ocupaciones/${q.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-09-30" }, cookie: e.cookie });
    expect((await e.listado()).enlace!.caducaEl).toBe("2026-12-30");
    expect(await enlacePorToken(bd, datos!.token, "2026-12-30")).not.toBeNull();
    expect(await enlacePorToken(bd, datos!.token, "2026-12-31")).toBeNull();
    // R3: si cambia la salida, la caducidad se recalcula.
    await pedir(`${e.base}/ocupaciones/${q.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-10-31" }, cookie: e.cookie });
    expect((await e.listado()).enlace!.caducaEl).toBe("2027-01-31");
    expect(await enlacePorToken(bd, datos!.token, "2026-12-31")).not.toBeNull();
  });

  it("C4 · regenerar: el antiguo deja de funcionar, el nuevo sí, y conserva el permiso de descarga", async () => {
    const e = await escenario();
    const antiguo = (await e.generar()).datos!;
    await pedir(e.ruta, { metodo: "PATCH", cuerpo: { permiteDescarga: false }, cookie: e.cookie });
    const r = await pedir(`${e.ruta}/regenerar`, { cuerpo: {}, cookie: e.cookie });
    expect(r.status).toBe(201);
    const nuevo = EnlaceGenerado.parse(await r.json());
    expect(nuevo.token).not.toBe(antiguo.token);
    expect(nuevo.enlace.permiteDescarga).toBe(false);
    expect(await enlacePorToken(bd, antiguo.token, "2026-10-01")).toBeNull();
    expect(await enlacePorToken(bd, nuevo.token, "2026-10-01")).toMatchObject({ permiteDescarga: false });
    // Sin enlace, regenerar también lo crea.
    await pedir(e.ruta, { metodo: "DELETE", cookie: e.cookie });
    expect((await pedir(`${e.ruta}/regenerar`, { cuerpo: {}, cookie: e.cookie })).status).toBe(201);
  });

  it("C7b · la propietaria deshabilita y vuelve a habilitar la descarga", async () => {
    const e = await escenario();
    const { datos } = await e.generar();
    const r = await pedir(e.ruta, { metodo: "PATCH", cuerpo: { permiteDescarga: false }, cookie: e.cookie });
    expect(EnlaceInquilino.parse(await r.json()).permiteDescarga).toBe(false);
    expect(await enlacePorToken(bd, datos!.token, "2026-10-01")).toMatchObject({ permiteDescarga: false });
    await pedir(e.ruta, { metodo: "PATCH", cuerpo: { permiteDescarga: true }, cookie: e.cookie });
    expect((await e.listado()).enlace!.permiteDescarga).toBe(true);
    // Sin enlace, no hay nada que cambiar.
    await pedir(e.ruta, { metodo: "DELETE", cookie: e.cookie });
    expect((await pedir(e.ruta, { metodo: "PATCH", cuerpo: { permiteDescarga: false }, cookie: e.cookie })).status).toBe(404);
  });

  it("C9 · un token mal formado o desconocido no lleva a nada", async () => {
    expect(await enlacePorToken(bd, "abc", "2026-10-01")).toBeNull();
    expect(await enlacePorToken(bd, "A".repeat(43), "2026-10-01")).toBeNull();
  });

  it("R2e · un inquilino borrado (anonimizado) no puede tener enlace; el suyo se borra", async () => {
    const e = await escenario();
    const { datos } = await e.generar();
    const q = await e.listado();
    await pedir(`${e.base}/ocupaciones/${q.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-09-30" }, cookie: e.cookie });
    await pedir(`${e.base}/cobros/generar`, { cuerpo: { mes: "2026-09" }, cookie: e.cookie });
    expect((await pedir(`${e.base}/inquilinos/${e.a.id}`, { metodo: "DELETE", cookie: e.cookie })).status).toBe(200);
    expect(await enlacePorToken(bd, datos!.token, "2026-10-01")).toBeNull();
    const r = await e.generar();
    expect(r.r.status).toBe(400);
    expect(await error(r.r)).toBe("INQUILINO_ANONIMIZADO");
  });

  it("spec 012 · generar, cambiar la descarga, regenerar y revocar quedan en el histórico", async () => {
    const e = await escenario();
    await e.generar();
    await pedir(e.ruta, { metodo: "PATCH", cuerpo: { permiteDescarga: false }, cookie: e.cookie });
    await pedir(`${e.ruta}/regenerar`, { cuerpo: {}, cookie: e.cookie });
    await pedir(e.ruta, { metodo: "DELETE", cookie: e.cookie });
    const h = Historico.parse(await (await pedir(`${e.base}/historico?grupo=enlaces`, { cookie: e.cookie })).json());
    expect(tipos(h)).toEqual(["enlace_revocado", "enlace_regenerado", "descarga_deshabilitada", "enlace_generado"]);
    expect(h.actividades.every((x) => x.inquilinoId === e.a.id)).toBe(true);
  });
});

describe("Aislamiento de los enlaces", () => {
  it("otra cuenta no genera, regenera, cambia ni revoca enlaces ajenos", async () => {
    const e = await escenario();
    await e.generar();
    const ajena = await cuenta();
    const intentos = [
      pedir(e.ruta, { cuerpo: {}, cookie: ajena }),
      pedir(`${e.ruta}/regenerar`, { cuerpo: {}, cookie: ajena }),
      pedir(e.ruta, { metodo: "PATCH", cuerpo: { permiteDescarga: false }, cookie: ajena }),
      pedir(e.ruta, { metodo: "DELETE", cookie: ajena }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(404);
    expect((await pedir(e.ruta, { cuerpo: {} })).status).toBe(401);
    // Desde su propio inmueble con el inquilino ajeno, tampoco.
    const otra = await escenario();
    expect((await pedir(`${otra.base}/inquilinos/${e.a.id}/enlace`, { cuerpo: {}, cookie: otra.cookie })).status).toBe(404);
    expect((await e.listado()).enlace).toMatchObject({ permiteDescarga: true });
  });
});
