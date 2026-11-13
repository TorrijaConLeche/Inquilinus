// Spec 009 · tarea 4.5: panel principal (R1–R5b). Hasta la fase 5 solo hay alquileres:
// los casos se prueban con los alquileres del escenario (sin la luz de B).
import { PGlite } from "@electric-sql/pglite";
import { Inmueble, Inquilino, ListaCobros, Panel, VERSION_TERMINOS } from "@inquilinus/contracts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.ts";
import { crearAuth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import type { Correo } from "../src/correo/enviador.ts";
import { crearRegistro } from "../src/registro.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";

let app: ReturnType<typeof crearApp>;
let bd: ReturnType<typeof drizzle<typeof t>>;
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
  // Hoy es el 2026-10-20, como en la spec.
  app = crearApp({ auth, bd, registro, ahora: () => new Date("2026-10-20T12:00:00Z") }, { rutaBase: "/api" });
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
  const email = `panel${++contador}@ejemplo.test`;
  await pedir("/auth/sign-up/email", { cuerpo: { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS } });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function inmueble(cookie: string, nombre: string, precio: number, inquilino: string) {
  const i = Inmueble.parse(
    await (
      await pedir("/inmuebles", {
        cuerpo: { nombre, modalidad: "entero", habitaciones: [{ nombre: "Casa", precioMensual: precio, desdeMes: "2026-01" }] },
        cookie,
      })
    ).json(),
  );
  const q = Inquilino.parse(
    await (
      await pedir(`/inmuebles/${i.id}/inquilinos`, {
        cuerpo: { nombre: inquilino, ocupacion: { habitacionId: i.habitaciones[0]!.id, entrada: "2026-01-01" } },
        cookie,
      })
    ).json(),
  );
  const generar = (mes: string) => pedir(`/inmuebles/${i.id}/cobros/generar`, { cuerpo: { mes }, cookie });
  const cobro = async (mes: string) =>
    ListaCobros.parse(await (await pedir(`/inmuebles/${i.id}/cobros?mes=${mes}`, { cookie })).json()).cobros[0]!;
  const editar = async (mes: string, cuerpo: object) =>
    pedir(`/inmuebles/${i.id}/cobros/${(await cobro(mes)).id}`, { metodo: "PATCH", cuerpo, cookie });
  return { id: i.id, inquilinoId: q.id, generar, cobro, editar };
}

/**
 * Piso Centro: A con el alquiler de septiembre (500 €) y el de octubre (500 €) pendientes.
 * Ático: todo pagado; en octubre se han cobrado 700 €.
 */
async function escenario() {
  const cookie = await cuenta();
  const centro = await inmueble(cookie, "Piso Centro", 50_000, "A");
  await centro.generar("2026-09");
  await centro.generar("2026-10");
  const atico = await inmueble(cookie, "Ático", 70_000, "C");
  await atico.generar("2026-09");
  await atico.generar("2026-10");
  await atico.editar("2026-09", { pagadoEn: "2026-09-03" });
  await atico.editar("2026-10", { pagadoEn: "2026-10-05" });
  const panel = async () => Panel.parse(await (await pedir("/panel", { cookie })).json());
  return { cookie, centro, atico, panel };
}

describe("Spec 009 · Panel principal", () => {
  it("C1 · resumen: pendiente total y cobrado este mes", async () => {
    const e = await escenario();
    const p = await e.panel();
    expect(p.totalPendiente).toBe(100_000);
    expect(p.cobradoEsteMes).toBe(70_000);
  });

  it("C2 · pendientes por inmueble e inquilino; el Ático, sin pendientes, no aparece", async () => {
    const e = await escenario();
    const p = await e.panel();
    expect(p.pendientes.map((i) => [i.nombre, i.total, i.inquilinos.map((q) => [q.nombre, q.total])])).toEqual([
      ["Piso Centro", 100_000, [["A", 100_000]]],
    ]);
    // Pero los dos tienen tarjeta, con su pendiente (R5).
    expect(p.inmuebles.map((i) => [i.nombre, i.pendiente])).toEqual([
      ["Piso Centro", 100_000],
      ["Ático", 0],
    ]);
  });

  it("C3 · el alquiler de septiembre va primero y destacado", async () => {
    const e = await escenario();
    const conceptos = (await e.panel()).pendientes[0]!.inquilinos[0]!.conceptos;
    expect(conceptos.map((c) => [c.mes, c.tipo, c.importe, c.atrasado])).toEqual([
      ["2026-09", "alquiler", 50_000, true],
      ["2026-10", "alquiler", 50_000, false],
    ]);
  });

  it("C7 · quitar el cobro de septiembre baja el pendiente total", async () => {
    const e = await escenario();
    await e.centro.editar("2026-09", { quitado: true });
    expect((await e.panel()).totalPendiente).toBe(50_000);
  });

  it("los archivados no aparecen ni cuentan; los bloqueados no cuentan y se avisa (R4, R5b)", async () => {
    const e = await escenario();
    const otro = await inmueble(e.cookie, "Casa vieja", 30_000, "D");
    await otro.generar("2026-10");
    await bd.update(t.inmueble).set({ archivado: true }).where(eq(t.inmueble.id, otro.id));
    await bd.update(t.inmueble).set({ bloqueado: true }).where(eq(t.inmueble.id, e.atico.id));
    const p = await e.panel();
    expect(p.inmuebles.map((i) => i.nombre)).toEqual(["Piso Centro"]);
    expect(p.totalPendiente).toBe(100_000);
    // Lo cobrado en el Ático (bloqueado) tampoco cuenta.
    expect(p.cobradoEsteMes).toBe(0);
    expect(p.avisos.bloqueados).toBe(1);
  });

  it("avisa de los cobros desactualizados de cada inmueble (R4, R5b)", async () => {
    const e = await escenario();
    await pedir(`/inmuebles/${e.centro.id}`, { metodo: "PATCH", cuerpo: { mesesParciales: "prorrateo" }, cookie: e.cookie });
    expect((await e.panel()).avisos.desactualizados).toEqual([]);
    const [h] = Inmueble.parse(await (await pedir(`/inmuebles/${e.centro.id}`, { cookie: e.cookie })).json()).habitaciones;
    await pedir(`/inmuebles/${e.centro.id}/habitaciones/${h!.id}/precios`, {
      cuerpo: { desdeMes: "2026-09", precioMensual: 52_000 },
      cookie: e.cookie,
    });
    expect((await e.panel()).avisos.desactualizados).toEqual([{ inmuebleId: e.centro.id, nombre: "Piso Centro", cobros: 2 }]);
  });

  it("aislamiento: otra cuenta ve su panel vacío; sin sesión, 401", async () => {
    await escenario();
    const ajena = await cuenta();
    const p = Panel.parse(await (await pedir("/panel", { cookie: ajena })).json());
    expect(p).toEqual({
      totalPendiente: 0,
      cobradoEsteMes: 0,
      pendientes: [],
      inmuebles: [],
      avisos: { desactualizados: [], bloqueados: 0 },
    });
    expect((await pedir("/panel")).status).toBe(401);
  });
});
