// Spec 005 · tarea 4.3: cobros desactualizados (R6) y recálculo (R6b). También spec 007, C4.
import { PGlite } from "@electric-sql/pglite";
import { Cobro, Inmueble, Inquilino, ListaCobros, ResultadoGeneracion, VERSION_TERMINOS } from "@inquilinus/contracts";
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
const enviados: Correo[] = [];

beforeAll(async () => {
  const bd = drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });
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
  // Hoy es el 2026-11-15 en Madrid: octubre y noviembre ya se pueden generar.
  app = crearApp({ auth, bd, registro, ahora: () => new Date("2026-11-15T12:00:00Z") }, { rutaBase: "/api" });
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
  const email = `desactualizados${++contador}@ejemplo.test`;
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

/**
 * Por habitaciones con prorrateo: H1 500 €, H2 400 €, H3 300 €. A en H1 desde enero y B en H2
 * desde `entradaB`. Se generan los cobros de octubre.
 */
async function escenario(opciones: { entradaB?: string } = {}) {
  const cookie = await cuenta();
  const r = await pedir("/inmuebles", {
    cuerpo: {
      nombre: "Piso Centro",
      modalidad: "habitaciones",
      mesesParciales: "prorrateo",
      habitaciones: [
        { nombre: "H1", precioMensual: 50_000, desdeMes: "2026-01" },
        { nombre: "H2", precioMensual: 40_000, desdeMes: "2026-01" },
        { nombre: "H3", precioMensual: 30_000, desdeMes: "2026-01" },
      ],
    },
    cookie,
  });
  const i = Inmueble.parse(await r.json());
  const h = Object.fromEntries(i.habitaciones.map((x) => [x.nombre, x.id])) as Record<"H1" | "H2" | "H3", string>;
  const alta = async (nombre: string, ocupacion: object) =>
    Inquilino.parse(await (await pedir(`/inmuebles/${i.id}/inquilinos`, { cuerpo: { nombre, ocupacion }, cookie })).json());
  const a = await alta("A", { habitacionId: h.H1, entrada: "2026-01-01" });
  const b = await alta("B", { habitacionId: h.H2, entrada: opciones.entradaB ?? "2026-01-01" });
  const base = `/inmuebles/${i.id}`;
  const generar = async (mes: string) =>
    ResultadoGeneracion.parse(await (await pedir(`${base}/cobros/generar`, { cuerpo: { mes }, cookie })).json()).creados;
  await generar("2026-10");
  const cobros = async (mes = "2026-10", quitados = false) =>
    ListaCobros.parse(await (await pedir(`${base}/cobros?mes=${mes}${quitados ? "&quitados=true" : ""}`, { cookie })).json()).cobros;
  const de = async (inquilinoId: string, mes = "2026-10") => (await cobros(mes, true)).find((c) => c.inquilinoId === inquilinoId)!;
  const editarCobro = (id: string, cuerpo: object) => pedir(`${base}/cobros/${id}`, { metodo: "PATCH", cuerpo, cookie });
  const recalcular = (id: string, confirmar?: boolean) =>
    pedir(`${base}/cobros/${id}/recalcular`, { cuerpo: confirmar === undefined ? {} : { confirmar }, cookie });
  const estancia = (q: Inquilino, cuerpo: object) =>
    pedir(`${base}/ocupaciones/${q.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo, cookie });
  return { cookie, id: i.id, base, h, a, b, alta, generar, cobros, de, editarCobro, recalcular, estancia };
}

describe("Spec 005 · Cobros desactualizados (R6)", () => {
  it("C7 · la salida de B a mitad de mes deja su cobro desactualizado; al recalcular, 400 × 15/31", async () => {
    const e = await escenario();
    await e.estancia(e.b, { salida: "2026-10-15" });
    expect((await e.de(e.b.id)).desactualizado).toBe(true);
    // El de A no cambia su cálculo (por habitaciones): no se marca.
    expect((await e.de(e.a.id)).desactualizado).toBe(false);

    const r = await e.recalcular((await e.de(e.b.id)).id);
    expect(r.status).toBe(200);
    expect(Cobro.parse(await r.json())).toMatchObject({ importe: 19_355, desactualizado: false, editado: false });
  });

  it("C13 · un cobro editado se marca si cambia su cálculo, y recalcularlo pide confirmación", async () => {
    const e = await escenario();
    const deA = await e.de(e.a.id);
    await e.editarCobro(deA.id, { renta: 45_000 });
    // Un cambio que no le afecta no lo marca.
    await e.estancia(e.b, { salida: "2026-10-20" });
    expect((await e.de(e.a.id)).desactualizado).toBe(false);

    await e.estancia(e.a, { entrada: "2026-10-11" });
    expect(await e.de(e.a.id)).toMatchObject({ importe: 45_000, editado: true, desactualizado: true });

    const sinConfirmar = await e.recalcular(deA.id);
    expect(sinConfirmar.status).toBe(400);
    expect(await error(sinConfirmar)).toBe("CONFIRMACION_NECESARIA");
    const confirmado = Cobro.parse(await (await e.recalcular(deA.id, true)).json());
    // 500 € × 21/31.
    expect(confirmado).toMatchObject({ importe: 33_871, editado: false, desactualizado: false });
  });

  it("un cobro pagado sigue pagado al recalcular (con confirmación)", async () => {
    const e = await escenario();
    const deB = await e.de(e.b.id);
    await e.editarCobro(deB.id, { pagadoEn: "2026-10-02" });
    await e.estancia(e.b, { salida: "2026-10-15" });
    expect(await error(await e.recalcular(deB.id))).toBe("CONFIRMACION_NECESARIA");
    expect(Cobro.parse(await (await e.recalcular(deB.id, true)).json())).toMatchObject({ importe: 19_355, pagadoEn: "2026-10-02" });
  });

  it("C21 · pasar a mes completo solo marca los cobros cuyo cálculo cambia", async () => {
    const e = await escenario({ entradaB: "2026-10-11" });
    await pedir(e.base, { metodo: "PATCH", cuerpo: { mesesParciales: "mes_completo" }, cookie: e.cookie });
    expect((await e.de(e.b.id)).desactualizado).toBe(true);
    expect((await e.de(e.a.id)).desactualizado).toBe(false);
    expect(Cobro.parse(await (await e.recalcular((await e.de(e.b.id)).id)).json()).importe).toBe(40_000);
  });

  it("C22 · si el inquilino ya no vivió ese mes, no se recalcula: se propone quitarlo", async () => {
    const e = await escenario();
    await e.estancia(e.b, { entrada: "2026-11-01" });
    const deB = await e.de(e.b.id);
    expect(deB.desactualizado).toBe(true);
    const r = await e.recalcular(deB.id);
    expect(r.status).toBe(400);
    expect(await error(r)).toBe("SIN_ESTANCIA_EN_EL_MES");
    expect((await e.de(e.b.id)).importe).toBe(40_000);
  });

  it("C23 · recalcular un cobro movido conserva la fecha y sigue editado", async () => {
    const e = await escenario();
    const deA = await e.de(e.a.id);
    await e.editarCobro(deA.id, { fechaCobro: "2026-10-10" });
    await pedir(`${e.base}/habitaciones/${e.h.H1}/precios`, { cuerpo: { desdeMes: "2026-10", precioMensual: 55_000 }, cookie: e.cookie });
    expect((await e.de(e.a.id)).desactualizado).toBe(true);
    expect(await error(await e.recalcular(deA.id))).toBe("CONFIRMACION_NECESARIA");
    expect(Cobro.parse(await (await e.recalcular(deA.id, true)).json())).toMatchObject({
      importe: 55_000,
      fechaCobro: "2026-10-10",
      editado: true,
      desactualizado: false,
    });
  });

  it("los quitados no se marcan, y un cambio que falla no marca nada", async () => {
    const e = await escenario();
    const deB = await e.de(e.b.id);
    await e.editarCobro(deB.id, { quitado: true });
    await e.estancia(e.b, { salida: "2026-10-15" });
    expect((await e.de(e.b.id)).desactualizado).toBe(false);

    // Una estancia que se solapa con A en H1 da error y no toca los cobros.
    const fallido = await pedir(`${e.base}/inquilinos`, {
      cuerpo: { nombre: "C", ocupacion: { habitacionId: e.h.H1, entrada: "2026-10-01" } },
      cookie: e.cookie,
    });
    expect(fallido.status).toBe(400);
    expect((await e.de(e.a.id)).desactualizado).toBe(false);
  });

  it("en un piso entero, una habitación nueva vacía marca los recargos de sus meses", async () => {
    const cookie = await cuenta();
    const i = Inmueble.parse(
      await (
        await pedir("/inmuebles", {
          cuerpo: {
            nombre: "Casa",
            modalidad: "entero",
            mesesParciales: "prorrateo",
            habitaciones: [{ nombre: "H1", precioMensual: 50_000, desdeMes: "2026-01" }],
          },
          cookie,
        })
      ).json(),
    );
    const a = Inquilino.parse(
      await (
        await pedir(`/inmuebles/${i.id}/inquilinos`, {
          cuerpo: { nombre: "A", ocupacion: { habitacionId: i.habitaciones[0]!.id, entrada: "2026-01-01" } },
          cookie,
        })
      ).json(),
    );
    await pedir(`/inmuebles/${i.id}/cobros/generar`, { cuerpo: { mes: "2026-10" }, cookie });
    await pedir(`/inmuebles/${i.id}/cobros/generar`, { cuerpo: { mes: "2026-11" }, cookie });
    await pedir(`/inmuebles/${i.id}/habitaciones`, { cuerpo: { nombre: "H2", precioMensual: 30_000, desdeMes: "2026-11" }, cookie });
    const lista = async (mes: string) =>
      ListaCobros.parse(await (await pedir(`/inmuebles/${i.id}/cobros?mes=${mes}`, { cookie })).json()).cobros;
    expect((await lista("2026-10")).find((c) => c.inquilinoId === a.id)?.desactualizado).toBe(false);
    expect((await lista("2026-11")).find((c) => c.inquilinoId === a.id)?.desactualizado).toBe(true);
  });
});

describe("Spec 007 · Cambio de precio con cobros (R5)", () => {
  it("C4 · cambiar el precio desde noviembre deja desactualizado el cobro de noviembre, no el de octubre", async () => {
    const e = await escenario();
    await e.generar("2026-11");
    await pedir(`${e.base}/habitaciones/${e.h.H1}/precios`, { cuerpo: { desdeMes: "2026-11", precioMensual: 55_000 }, cookie: e.cookie });
    expect((await e.de(e.a.id, "2026-11")).desactualizado).toBe(true);
    expect((await e.de(e.a.id, "2026-10")).desactualizado).toBe(false);
    expect((await e.de(e.b.id, "2026-11")).desactualizado).toBe(false);
  });
});

describe("Aislamiento del recálculo", () => {
  it("otra cuenta no puede recalcular un cobro ajeno", async () => {
    const e = await escenario();
    const deA = await e.de(e.a.id);
    const ajena = await cuenta();
    const r = await pedir(`${e.base}/cobros/${deA.id}/recalcular`, { cuerpo: { confirmar: true }, cookie: ajena });
    expect(r.status).toBe(404);
  });
});
