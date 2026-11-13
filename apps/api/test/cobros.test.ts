// Spec 005 · tarea 4.1: API de cobros (generar a mano, añadir, editar, mover, quitar, restaurar y pagar).
import { PGlite } from "@electric-sql/pglite";
import { Cobro, CobrosDelMes, Inmueble, Inquilino, ListaCobros, ResultadoGeneracion, ResultadoPagoTodo, VERSION_TERMINOS } from "@inquilinus/contracts";
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
  // Hoy es el 2026-10-03 en Madrid.
  app = crearApp({ auth, bd, registro, ahora: () => new Date("2026-10-03T10:00:00Z") }, { rutaBase: "/api" });
}, 30_000);

function pedir(ruta: string, { metodo, cuerpo, cookie, origen }: { metodo?: string; cuerpo?: unknown; cookie?: string; origen?: string } = {}) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: { origin: origen ?? URL_BASE, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

let contador = 0;
async function cuenta() {
  const email = `cobros${++contador}@ejemplo.test`;
  await pedir("/auth/sign-up/email", { cuerpo: { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS } });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/**
 * El escenario de la spec: por habitaciones con prorrateo, H1 500 €, H2 400 € y H3 300 €.
 * A en H1 y B en H2 desde el 2026-01-01.
 */
async function escenario(opciones: { modalidad?: "entero" | "habitaciones"; diaCobro?: number } = {}) {
  const cookie = await cuenta();
  const r = await pedir("/inmuebles", {
    cuerpo: {
      nombre: "Piso Centro",
      modalidad: opciones.modalidad ?? "habitaciones",
      mesesParciales: "prorrateo",
      diaCobro: opciones.diaCobro ?? 1,
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
  const alta = async (nombre: string, ocupacion?: object) =>
    Inquilino.parse(await (await pedir(`/inmuebles/${i.id}/inquilinos`, { cuerpo: { nombre, ...(ocupacion && { ocupacion }) }, cookie })).json());
  const a = await alta("A", { habitacionId: h.H1, entrada: "2026-01-01" });
  const b = await alta("B", { habitacionId: h.H2, entrada: "2026-01-01" });
  return { cookie, id: i.id, base: `/inmuebles/${i.id}/cobros`, h, a, b, alta };
}

const generar = async (cookie: string, base: string, mes: string) =>
  pedir(`${base}/generar`, { cuerpo: { mes }, cookie });

const listar = async (cookie: string, base: string, consulta = "") =>
  ListaCobros.parse(await (await pedir(`${base}${consulta}`, { cookie })).json()).cobros;

const error = async (r: Response) => ((await r.json()) as { error: string }).error;

describe("Spec 005 · Generar a mano (R5, R5b)", () => {
  it("genera los del mes en curso con el cálculo de la spec 002, origen manual y pendientes", async () => {
    const e = await escenario();
    const r = await generar(e.cookie, e.base, "2026-10");
    expect(r.status).toBe(201);
    const { creados } = ResultadoGeneracion.parse(await r.json());
    const porNombre = (c: Cobro) => (c.inquilinoId === e.a.id ? "A" : "B");
    expect(creados.map((c) => [porNombre(c), c.importe, c.fechaCobro, c.origen, c.pagadoEn]).sort()).toEqual([
      ["A", 50_000, "2026-10-01", "manual", null],
      ["B", 40_000, "2026-10-01", "manual", null],
    ]);
  });

  it("C5 · sin cobro para quien ya se fue; prorrateo para quien entra a mitad", async () => {
    const e = await escenario();
    await pedir(`/inmuebles/${e.id}/ocupaciones/${e.a.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-08-31" }, cookie: e.cookie });
    const c = await e.alta("C", { habitacionId: e.h.H3, entrada: "2026-09-16" });
    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-09")).json());
    const importes = Object.fromEntries(creados.map((x) => [x.inquilinoId, x.importe]));
    expect(importes).toEqual({ [e.b.id]: 40_000, [c.id]: 15_000 });
  });

  it("C6 · un mes pasado: solo crea los que faltan y no toca el que ya existía", async () => {
    const e = await escenario();
    const existente = Cobro.parse(await (await pedir(e.base, { cuerpo: { inquilinoId: e.a.id, mes: "2026-09", renta: 45_000 }, cookie: e.cookie })).json());
    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-09")).json());
    expect(creados.map((c) => c.inquilinoId)).toEqual([e.b.id]);
    expect(creados[0]!.origen).toBe("manual");
    const [deA] = (await listar(e.cookie, e.base, "?mes=2026-09")).filter((c) => c.inquilinoId === e.a.id);
    expect(deA).toEqual(existente);
  });

  it("C3 · generar dos veces el mismo mes no duplica (R4)", async () => {
    const e = await escenario();
    await generar(e.cookie, e.base, "2026-10");
    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-10")).json());
    expect(creados).toEqual([]);
    expect(await listar(e.cookie, e.base, "?mes=2026-10")).toHaveLength(2);
  });

  it("C18 · no se generan meses futuros", async () => {
    const e = await escenario();
    const r = await generar(e.cookie, e.base, "2026-11");
    expect(r.status).toBe(400);
    expect(await error(r)).toBe("MES_FUTURO");
  });

  it("C15 · en un piso entero, una habitación archivada vacía no suma recargo", async () => {
    const e = await escenario({ modalidad: "entero" });
    await pedir(`/inmuebles/${e.id}/habitaciones/${e.h.H3}`, { metodo: "PATCH", cuerpo: { archivada: true }, cookie: e.cookie });
    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-10")).json());
    expect(creados.map((c) => [c.inquilinoId === e.a.id ? "A" : "B", c.renta, c.recargoVacios]).sort()).toEqual([
      ["A", 50_000, 0],
      ["B", 40_000, 0],
    ]);
  });

  it("la fecha de cobro es el día de cobro del inmueble (R1)", async () => {
    const e = await escenario({ diaCobro: 5 });
    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-09")).json());
    expect(creados.every((c) => c.fechaCobro === "2026-09-05")).toBe(true);
  });
});

describe("Spec 005 · Añadir a mano (R10, R10b)", () => {
  it("con estancia propone lo calculado; si se cambia, queda editado", async () => {
    const e = await escenario();
    const propuesto = Cobro.parse(await (await pedir(e.base, { cuerpo: { inquilinoId: e.a.id, mes: "2026-10" }, cookie: e.cookie })).json());
    expect(propuesto).toMatchObject({ importe: 50_000, origen: "manual", editado: false, fechaCobro: "2026-10-01" });
    const cambiado = Cobro.parse(
      await (await pedir(e.base, { cuerpo: { inquilinoId: e.b.id, mes: "2026-10", renta: 38_000, fechaCobro: "2026-10-07" }, cookie: e.cookie })).json(),
    );
    expect(cambiado).toMatchObject({ importe: 38_000, editado: true, fechaCobro: "2026-10-07" });
  });

  it("C16 · sin estancia ese mes la renta es obligatoria; con ella, editado", async () => {
    const e = await escenario();
    const d = await e.alta("D");
    const sinRenta = await pedir(e.base, { cuerpo: { inquilinoId: d.id, mes: "2026-11" }, cookie: e.cookie });
    expect(sinRenta.status).toBe(400);
    expect(await error(sinRenta)).toBe("RENTA_OBLIGATORIA");
    const conRenta = await pedir(e.base, { cuerpo: { inquilinoId: d.id, mes: "2026-11", renta: 30_000 }, cookie: e.cookie });
    expect(Cobro.parse(await conRenta.json())).toMatchObject({ importe: 30_000, recargoVacios: 0, origen: "manual", editado: true });
  });

  it("no se añade un cobro que ya existe, aunque esté quitado (R4, R11)", async () => {
    const e = await escenario();
    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-10")).json());
    await pedir(`${e.base}/${creados[0]!.id}`, { metodo: "PATCH", cuerpo: { quitado: true }, cookie: e.cookie });
    const r = await pedir(e.base, { cuerpo: { inquilinoId: creados[0]!.inquilinoId, mes: "2026-10" }, cookie: e.cookie });
    expect(await error(r)).toBe("COBRO_EXISTENTE");
  });

  it("a un inquilino anonimizado no se le añaden cobros", async () => {
    const e = await escenario();
    const viejo = await e.alta("Viejo", { habitacionId: e.h.H3, entrada: "2026-01-01", salida: "2026-03-31" });
    await pedir(e.base, { cuerpo: { inquilinoId: viejo.id, mes: "2026-03" }, cookie: e.cookie });
    await pedir(`/inmuebles/${e.id}/inquilinos/${viejo.id}`, { metodo: "DELETE", cookie: e.cookie });
    const r = await pedir(e.base, { cuerpo: { inquilinoId: viejo.id, mes: "2026-02", renta: 1 }, cookie: e.cookie });
    expect(await error(r)).toBe("INQUILINO_ANONIMIZADO");
  });
});

describe("Spec 005 · Editar, mover, quitar, restaurar y pagar (R7, R10, R11)", () => {
  const conOctubre = async () => {
    const e = await escenario();
    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-10")).json());
    const deA = creados.find((c) => c.inquilinoId === e.a.id)!;
    const editar = (cuerpo: object) => pedir(`${e.base}/${deA.id}`, { metodo: "PATCH", cuerpo, cookie: e.cookie });
    return { ...e, deA, editar };
  };

  it("C9 · marcar pagado y desmarcar", async () => {
    const e = await conOctubre();
    expect(Cobro.parse(await (await e.editar({ pagadoEn: "2026-10-03" })).json()).pagadoEn).toBe("2026-10-03");
    const pendiente = Cobro.parse(await (await e.editar({ pagadoEn: null })).json());
    expect(pendiente.pagadoEn).toBeNull();
    // Pagar no es editar.
    expect(pendiente.editado).toBe(false);
  });

  it("C17 · la fecha de pago no puede ser posterior a hoy", async () => {
    const e = await conOctubre();
    const r = await e.editar({ pagadoEn: "2026-10-04" });
    expect(r.status).toBe(400);
    expect(await error(r)).toBe("PAGO_FUTURO");
  });

  it("C12 · mover un cobro: cambia la fecha, no el mes, y queda editado", async () => {
    const e = await conOctubre();
    const movido = Cobro.parse(await (await e.editar({ fechaCobro: "2026-10-10" })).json());
    expect(movido).toMatchObject({ fechaCobro: "2026-10-10", mes: "2026-10", editado: true });
  });

  it("C13 · cambiar la renta: nuevo importe y editado; repetir el mismo valor no cambia nada", async () => {
    const e = await conOctubre();
    const cambiado = Cobro.parse(await (await e.editar({ renta: 45_000, recargoVacios: 500 })).json());
    expect(cambiado).toMatchObject({ renta: 45_000, recargoVacios: 500, importe: 45_500, editado: true });

    const otro = await conOctubre();
    const igual = Cobro.parse(await (await otro.editar({ renta: 50_000, fechaCobro: "2026-10-01" })).json());
    expect(igual.editado).toBe(false);
  });

  it("C11 · quitar: desaparece de la lista, la generación no lo recrea y se puede restaurar", async () => {
    const e = await conOctubre();
    const quitado = Cobro.parse(await (await e.editar({ quitado: true })).json());
    expect(quitado.quitado).toBe(true);
    expect((await listar(e.cookie, e.base, "?mes=2026-10")).map((c) => c.id)).not.toContain(e.deA.id);
    expect((await listar(e.cookie, e.base, "?mes=2026-10&quitados=true")).map((c) => c.id)).toContain(e.deA.id);

    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-10")).json());
    expect(creados).toEqual([]);

    expect(Cobro.parse(await (await e.editar({ quitado: false })).json()).quitado).toBe(false);
    expect((await listar(e.cookie, e.base, "?mes=2026-10")).map((c) => c.id)).toContain(e.deA.id);
  });

  it("importes y fechas no válidos dan error", async () => {
    const e = await conOctubre();
    expect(await error(await e.editar({ renta: -1 }))).toBe("DATOS_INVALIDOS");
    expect(await error(await e.editar({ fechaCobro: "2026-02-30" }))).toBe("FECHA_INVALIDA");
    expect((await pedir(`${e.base}?mes=2026-13`, { cookie: e.cookie })).status).toBe(400);
  });
});

describe("Aislamiento: otra cuenta no ve ni toca los cobros ajenos", () => {
  it("todo responde 404 y nada cambia", async () => {
    const e = await escenario();
    const { creados } = ResultadoGeneracion.parse(await (await generar(e.cookie, e.base, "2026-10")).json());
    const ajena = await cuenta();
    const intentos = [
      pedir(e.base, { cookie: ajena }),
      pedir(`${e.base}/generar`, { cuerpo: { mes: "2026-09" }, cookie: ajena }),
      pedir(e.base, { cuerpo: { inquilinoId: e.a.id, mes: "2026-09", renta: 1 }, cookie: ajena }),
      pedir(`${e.base}/${creados[0]!.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-01" }, cookie: ajena }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(404);

    // Tampoco con su propio inmueble y un cobro ajeno.
    const suyo = await escenario();
    const cruzado = await pedir(`${suyo.base}/${creados[0]!.id}`, { metodo: "PATCH", cuerpo: { quitado: true }, cookie: suyo.cookie });
    expect(cruzado.status).toBe(404);
    const cruzadoAlta = await pedir(suyo.base, { cuerpo: { inquilinoId: e.a.id, mes: "2026-09", renta: 1 }, cookie: suyo.cookie });
    expect(cruzadoAlta.status).toBe(404);

    const [fila] = await bd.select().from(t.cobroAlquiler).where(eq(t.cobroAlquiler.id, creados[0]!.id));
    expect(fila).toMatchObject({ pagadoEn: null, quitadoEn: null });
    expect(await listar(e.cookie, e.base, "?mes=2026-09")).toEqual([]);
  });

  it("sin sesión, 401; desde otra web, 403", async () => {
    const e = await escenario();
    expect((await pedir(e.base)).status).toBe(401);
    expect((await pedir(`${e.base}/generar`, { cuerpo: { mes: "2026-10" }, cookie: e.cookie, origen: "https://malvada.ejemplo" })).status).toBe(403);
  });
});

describe("Spec 009 · Cobros de un mes del inmueble (R6–R12)", () => {
  it("C3 · los del mes, los quitados aparte, los atrasados primero y lo que asume la propietaria", async () => {
    const e = await escenario();
    await generar(e.cookie, e.base, "2026-08");
    await generar(e.cookie, e.base, "2026-09");
    await generar(e.cookie, e.base, "2026-10");
    const agosto = await listar(e.cookie, e.base, "?mes=2026-08");
    // A pagó agosto; B no. En septiembre, A no ha pagado y B se quitó.
    await pedir(`${e.base}/${agosto.find((c) => c.inquilinoId === e.a.id)!.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-08-02" }, cookie: e.cookie });
    const septiembre = await listar(e.cookie, e.base, "?mes=2026-09");
    await pedir(`${e.base}/${septiembre.find((c) => c.inquilinoId === e.b.id)!.id}`, { metodo: "PATCH", cuerpo: { quitado: true }, cookie: e.cookie });

    const r = await pedir(`${e.base}/mes/2026-10`, { cookie: e.cookie });
    const mes = CobrosDelMes.parse(await r.json());
    expect(mes.cobros).toHaveLength(2);
    expect(mes.quitados).toEqual([]);
    // Atrasados (antes de octubre, el mes en curso): agosto de B y septiembre de A, del más antiguo al más reciente.
    expect(mes.atrasados.map((c) => [c.mes, c.inquilinoId === e.a.id ? "A" : "B"])).toEqual([
      ["2026-08", "B"],
      ["2026-09", "A"],
    ]);
    // H3 vacía todo el mes: la asume la propietaria.
    expect(mes.asumePropietario).toBe(30_000);

    const elegidoSeptiembre = CobrosDelMes.parse(await (await pedir(`${e.base}/mes/2026-09`, { cookie: e.cookie })).json());
    expect(elegidoSeptiembre.quitados.map((c) => c.inquilinoId)).toEqual([e.b.id]);
    // El de septiembre de A no se repite en atrasados al ver septiembre.
    expect(elegidoSeptiembre.atrasados.map((c) => c.mes)).toEqual(["2026-08"]);
  });

  it("C5 · «Todo pagado» marca solo ese inquilino y ese mes, y devuelve lo marcado", async () => {
    const e = await escenario();
    await generar(e.cookie, e.base, "2026-09");
    await generar(e.cookie, e.base, "2026-10");
    const r = await pedir(`${e.base}/pagar-todo`, { cuerpo: { inquilinoId: e.a.id, mes: "2026-10" }, cookie: e.cookie });
    const { marcados } = ResultadoPagoTodo.parse(await r.json());
    expect(marcados.map((c) => [c.mes, c.pagadoEn])).toEqual([["2026-10", "2026-10-03"]]);
    const septiembreA = (await listar(e.cookie, e.base, "?mes=2026-09")).find((c) => c.inquilinoId === e.a.id);
    expect(septiembreA?.pagadoEn).toBeNull();
    const octubreB = (await listar(e.cookie, e.base, "?mes=2026-10")).find((c) => c.inquilinoId === e.b.id);
    expect(octubreB?.pagadoEn).toBeNull();
    // Otra vez: ya no queda nada que marcar.
    const otra = ResultadoPagoTodo.parse(await (await pedir(`${e.base}/pagar-todo`, { cuerpo: { inquilinoId: e.a.id, mes: "2026-10" }, cookie: e.cookie })).json());
    expect(otra.marcados).toEqual([]);
  });

  it("aislamiento: otra cuenta no ve el mes ni paga por otro", async () => {
    const e = await escenario();
    const ajena = await cuenta();
    expect((await pedir(`${e.base}/mes/2026-10`, { cookie: ajena })).status).toBe(404);
    expect((await pedir(`${e.base}/pagar-todo`, { cuerpo: { inquilinoId: e.a.id, mes: "2026-10" }, cookie: ajena })).status).toBe(404);
    const suyo = await escenario();
    expect((await pedir(`${suyo.base}/pagar-todo`, { cuerpo: { inquilinoId: e.a.id, mes: "2026-10" }, cookie: suyo.cookie })).status).toBe(404);
    expect((await pedir(`${e.base}/mes/2026-13`, { cookie: e.cookie })).status).toBe(400);
  });
});
