// Spec 007 · tarea 3.3: inquilinos, ocupaciones y tipos de gasto.
import { PGlite } from "@electric-sql/pglite";
import { Inmueble, Inquilino, ListaInquilinos, ListaTiposGasto, TipoGasto, VERSION_TERMINOS } from "@inquilinus/contracts";
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
  app = crearApp({ auth, bd, registro, ahora: () => new Date("2026-11-15T12:00:00Z") }, { rutaBase: "/api" });
}, 30_000);

type Opciones = { metodo?: string; cuerpo?: unknown; cookie?: string; origen?: string };

function pedir(ruta: string, { metodo, cuerpo, cookie, origen }: Opciones = {}) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: { origin: origen ?? URL_BASE, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

let contador = 0;
async function cuenta() {
  const email = `inquilinos${++contador}@ejemplo.test`;
  await pedir("/auth/sign-up/email", { cuerpo: { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS } });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Inmueble con dos habitaciones, H1 y H2. */
async function inmueble(cookie: string, nombre = "Piso Centro") {
  const r = await pedir("/inmuebles", {
    cuerpo: {
      nombre,
      modalidad: "habitaciones",
      habitaciones: [
        { nombre: "H1", precioMensual: 50_000, desdeMes: "2026-01" },
        { nombre: "H2", precioMensual: 40_000, desdeMes: "2026-01" },
      ],
    },
    cookie,
  });
  const i = Inmueble.parse(await r.json());
  return { id: i.id, h1: i.habitaciones[0]!.id, h2: i.habitaciones[1]!.id };
}

async function alta(cookie: string, inmuebleId: string, cuerpo: object) {
  return pedir(`/inmuebles/${inmuebleId}/inquilinos`, { cuerpo, cookie });
}

async function inquilino(cookie: string, inmuebleId: string, cuerpo: object) {
  const r = await alta(cookie, inmuebleId, cuerpo);
  expect(r.status).toBe(201);
  return Inquilino.parse(await r.json());
}

const lista = async (cookie: string, inmuebleId: string) =>
  ListaInquilinos.parse(await (await pedir(`/inmuebles/${inmuebleId}/inquilinos`, { cookie })).json()).inquilinos;

describe("inquilinos (spec 007)", () => {
  it("C5 — Inquilino sin nombre (R6): error de validación", async () => {
    const cookie = await cuenta();
    const { id } = await inmueble(cookie);
    const r = await alta(cookie, id, { nombre: "   " });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "NOMBRE_OBLIGATORIO" });
    expect(await lista(cookie, id)).toEqual([]);
  });

  it("R6: solo se guarda el nombre; cualquier otro dato se rechaza", async () => {
    const cookie = await cuenta();
    const { id } = await inmueble(cookie);
    const r = await alta(cookie, id, { nombre: "Ana", dni: "12345678Z" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "DATOS_INVALIDOS" });
  });

  it("alta con su primera estancia, y cambio de nombre", async () => {
    const cookie = await cuenta();
    const { id, h1 } = await inmueble(cookie);
    const ana = await inquilino(cookie, id, { nombre: " Ana ", ocupacion: { habitacionId: h1, entrada: "2026-09-01" } });
    expect(ana).toMatchObject({
      nombre: "Ana",
      anonimizado: false,
      ocupaciones: [{ habitacionId: h1, entrada: "2026-09-01", salida: null }],
    });

    const r = await pedir(`/inmuebles/${id}/inquilinos/${ana.id}`, { metodo: "PATCH", cuerpo: { nombre: "Ana María" }, cookie });
    expect(Inquilino.parse(await r.json()).nombre).toBe("Ana María");
  });
});

describe("ocupaciones (spec 007)", () => {
  it("C6 — Solape (R7): A en H1 desde el 2026-09-01 sin salida; B entra el 2026-10-01: error", async () => {
    const cookie = await cuenta();
    const { id, h1 } = await inmueble(cookie);
    await inquilino(cookie, id, { nombre: "A", ocupacion: { habitacionId: h1, entrada: "2026-09-01" } });

    const r = await alta(cookie, id, { nombre: "B", ocupacion: { habitacionId: h1, entrada: "2026-10-01" } });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "SOLAPE_OCUPACIONES" });
    // Todo o nada: B no se ha creado.
    expect((await lista(cookie, id)).map((q) => q.nombre)).toEqual(["A"]);
  });

  it("relevo el mismo día en la misma habitación: no es solape (spec 001, R4)", async () => {
    const cookie = await cuenta();
    const { id, h1 } = await inmueble(cookie);
    await inquilino(cookie, id, { nombre: "A", ocupacion: { habitacionId: h1, entrada: "2026-09-01", salida: "2026-10-15" } });
    const b = await alta(cookie, id, { nombre: "B", ocupacion: { habitacionId: h1, entrada: "2026-10-15" } });
    expect(b.status).toBe(201);
  });

  it("C7 — Cambio de habitación (R8): A en H1 hasta el 2026-10-14 y en H2 desde el 2026-10-15", async () => {
    const cookie = await cuenta();
    const { id, h1, h2 } = await inmueble(cookie);
    const a = await inquilino(cookie, id, { nombre: "A", ocupacion: { habitacionId: h1, entrada: "2026-09-01" } });

    const r = await pedir(`/inmuebles/${id}/inquilinos/${a.id}/cambio-habitacion`, {
      cuerpo: { habitacionId: h2, fecha: "2026-10-15" },
      cookie,
    });
    expect(r.status).toBe(200);
    expect(Inquilino.parse(await r.json()).ocupaciones).toEqual([
      expect.objectContaining({ habitacionId: h1, entrada: "2026-09-01", salida: "2026-10-14" }),
      expect.objectContaining({ habitacionId: h2, entrada: "2026-10-15", salida: null }),
    ]);
  });

  it("el cambio de habitación se rechaza entero si la habitación nueva está ocupada", async () => {
    const cookie = await cuenta();
    const { id, h1, h2 } = await inmueble(cookie);
    const a = await inquilino(cookie, id, { nombre: "A", ocupacion: { habitacionId: h1, entrada: "2026-09-01" } });
    await inquilino(cookie, id, { nombre: "B", ocupacion: { habitacionId: h2, entrada: "2026-09-01" } });

    const r = await pedir(`/inmuebles/${id}/inquilinos/${a.id}/cambio-habitacion`, {
      cuerpo: { habitacionId: h2, fecha: "2026-10-15" },
      cookie,
    });
    expect(await r.json()).toEqual({ error: "SOLAPE_OCUPACIONES" });
    // La estancia de A en H1 sigue abierta: no se ha cerrado a medias.
    const deA = (await lista(cookie, id)).find((q) => q.id === a.id)!;
    expect(deA.ocupaciones).toEqual([expect.objectContaining({ habitacionId: h1, salida: null })]);
  });

  it("errores del cambio de habitación: sin estancia abierta, misma habitación o fecha anterior a la entrada", async () => {
    const cookie = await cuenta();
    const { id, h1, h2 } = await inmueble(cookie);
    const sinEstancia = await inquilino(cookie, id, { nombre: "Sin estancia" });
    const a = await inquilino(cookie, id, { nombre: "A", ocupacion: { habitacionId: h1, entrada: "2026-09-01" } });
    const cambio = async (quien: string, cuerpo: object) =>
      (await pedir(`/inmuebles/${id}/inquilinos/${quien}/cambio-habitacion`, { cuerpo, cookie })).json();

    expect(await cambio(sinEstancia.id, { habitacionId: h2, fecha: "2026-10-15" })).toEqual({ error: "SIN_ESTANCIA_ABIERTA" });
    expect(await cambio(a.id, { habitacionId: h1, fecha: "2026-10-15" })).toEqual({ error: "MISMA_HABITACION" });
    expect(await cambio(a.id, { habitacionId: h2, fecha: "2026-09-01" })).toEqual({ error: "CAMBIO_ANTES_DE_LA_ENTRADA" });
  });

  it("R9: poner la salida; y las fechas se validan (salida antes de entrada, día inexistente)", async () => {
    const cookie = await cuenta();
    const { id, h1 } = await inmueble(cookie);
    const a = await inquilino(cookie, id, { nombre: "A", ocupacion: { habitacionId: h1, entrada: "2026-09-01" } });
    const ocupacion = a.ocupaciones[0]!.id;
    const editar = (cuerpo: object) => pedir(`/inmuebles/${id}/ocupaciones/${ocupacion}`, { metodo: "PATCH", cuerpo, cookie });

    const conSalida = await editar({ salida: "2026-12-31" });
    expect(Inquilino.parse(await conSalida.json()).ocupaciones[0]!.salida).toBe("2026-12-31");

    expect(await (await editar({ salida: "2026-08-31" })).json()).toEqual({ error: "OCUPACION_INVALIDA" });
    expect(await (await editar({ salida: "2027-02-30" })).json()).toEqual({ error: "FECHA_INVALIDA" });

    const sinSalida = await editar({ salida: null });
    expect(Inquilino.parse(await sinSalida.json()).ocupaciones[0]!.salida).toBeNull();
  });

  it("editar una estancia para que se solape con otra se rechaza y no cambia nada", async () => {
    const cookie = await cuenta();
    const { id, h1 } = await inmueble(cookie);
    const a = await inquilino(cookie, id, { nombre: "A", ocupacion: { habitacionId: h1, entrada: "2026-01-01", salida: "2026-05-31" } });
    await inquilino(cookie, id, { nombre: "B", ocupacion: { habitacionId: h1, entrada: "2026-06-01" } });

    const r = await pedir(`/inmuebles/${id}/ocupaciones/${a.ocupaciones[0]!.id}`, {
      metodo: "PATCH",
      cuerpo: { salida: "2026-06-10" },
      cookie,
    });
    expect(await r.json()).toEqual({ error: "SOLAPE_OCUPACIONES" });
    const deA = (await lista(cookie, id)).find((q) => q.id === a.id)!;
    expect(deA.ocupaciones[0]!.salida).toBe("2026-05-31");
  });

  it("solo se puede ocupar una habitación del mismo inmueble", async () => {
    const cookie = await cuenta();
    const uno = await inmueble(cookie);
    const otro = await inmueble(cookie, "Otro piso");
    const r = await alta(cookie, uno.id, { nombre: "A", ocupacion: { habitacionId: otro.h1, entrada: "2026-09-01" } });
    expect(await r.json()).toEqual({ error: "HABITACION_DESCONOCIDA" });
  });

  it("varias estancias del mismo inquilino, ordenadas por entrada", async () => {
    const cookie = await cuenta();
    const { id, h1, h2 } = await inmueble(cookie);
    const a = await inquilino(cookie, id, { nombre: "A", ocupacion: { habitacionId: h2, entrada: "2026-06-01" } });
    const r = await pedir(`/inmuebles/${id}/inquilinos/${a.id}/ocupaciones`, {
      cuerpo: { habitacionId: h1, entrada: "2026-01-01", salida: "2026-05-31" },
      cookie,
    });
    expect(r.status).toBe(201);
    expect(Inquilino.parse(await r.json()).ocupaciones.map((o) => o.entrada)).toEqual(["2026-01-01", "2026-06-01"]);
  });
});

describe("tipos de gasto (spec 007, R10; spec 006, R7)", () => {
  it("sin color, cada tipo recibe el primer color libre; con color, el elegido", async () => {
    const cookie = await cuenta();
    const { id } = await inmueble(cookie);
    const crear = async (cuerpo: object) => {
      const r = await pedir(`/inmuebles/${id}/tipos-gasto`, { cuerpo, cookie });
      expect(r.status).toBe(201);
      return TipoGasto.parse(await r.json());
    };
    expect((await crear({ nombre: "Luz" })).color).toBe("ambar");
    expect((await crear({ nombre: "Agua", color: "violeta" })).color).toBe("violeta");
    expect((await crear({ nombre: "Gas" })).color).toBe("azul");
    const tipos = ListaTiposGasto.parse(await (await pedir(`/inmuebles/${id}/tipos-gasto`, { cookie })).json()).tiposGasto;
    expect(tipos.map((tg) => [tg.nombre, tg.color])).toEqual([
      ["Luz", "ambar"],
      ["Agua", "violeta"],
      ["Gas", "azul"],
    ]);
  });

  it("R10: renombrar y cambiar de color; color fuera de la paleta o nombre vacío, error", async () => {
    const cookie = await cuenta();
    const { id } = await inmueble(cookie);
    const luz = TipoGasto.parse(await (await pedir(`/inmuebles/${id}/tipos-gasto`, { cuerpo: { nombre: "Luz" }, cookie })).json());
    const editar = (cuerpo: object) => pedir(`/inmuebles/${id}/tipos-gasto/${luz.id}`, { metodo: "PATCH", cuerpo, cookie });

    expect(TipoGasto.parse(await (await editar({ nombre: "Electricidad", color: "coral" })).json())).toMatchObject({
      nombre: "Electricidad",
      color: "coral",
    });
    expect(await (await editar({ color: "rojo-alquiler" })).json()).toEqual({ error: "DATOS_INVALIDOS" });
    expect(await (await editar({ nombre: "" })).json()).toEqual({ error: "NOMBRE_OBLIGATORIO" });
  });
});

describe("aislamiento entre cuentas (spec 008, R13)", () => {
  it("cada endpoint responde 404 con lo de otra cuenta y no lo cambia", async () => {
    const a = await cuenta();
    const b = await cuenta();
    const deA = await inmueble(a);
    const ana = await inquilino(a, deA.id, { nombre: "Ana", ocupacion: { habitacionId: deA.h1, entrada: "2026-09-01" } });
    const luz = TipoGasto.parse(await (await pedir(`/inmuebles/${deA.id}/tipos-gasto`, { cuerpo: { nombre: "Luz" }, cookie: a })).json());

    const intentos: [string, Opciones][] = [
      [`/inmuebles/${deA.id}/inquilinos`, {}],
      [`/inmuebles/${deA.id}/inquilinos`, { cuerpo: { nombre: "Intruso" } }],
      [`/inmuebles/${deA.id}/inquilinos/${ana.id}`, { metodo: "PATCH", cuerpo: { nombre: "Cambiado" } }],
      [`/inmuebles/${deA.id}/inquilinos/${ana.id}/ocupaciones`, { cuerpo: { habitacionId: deA.h2, entrada: "2027-01-01" } }],
      [`/inmuebles/${deA.id}/inquilinos/${ana.id}/cambio-habitacion`, { cuerpo: { habitacionId: deA.h2, fecha: "2027-01-01" } }],
      [`/inmuebles/${deA.id}/ocupaciones/${ana.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-12-31" } }],
      [`/inmuebles/${deA.id}/tipos-gasto`, {}],
      [`/inmuebles/${deA.id}/tipos-gasto`, { cuerpo: { nombre: "Intruso" } }],
      [`/inmuebles/${deA.id}/tipos-gasto/${luz.id}`, { metodo: "PATCH", cuerpo: { nombre: "Cambiado" } }],
    ];
    for (const [ruta, opciones] of intentos) {
      const r = await pedir(ruta, { ...opciones, cookie: b });
      expect(r.status, `${opciones.metodo ?? (opciones.cuerpo ? "POST" : "GET")} ${ruta}`).toBe(404);
    }

    // Con su propio inmueble en la URL y los ids de A, tampoco.
    const deB = await inmueble(b, "Piso de B");
    const cruzados: [string, Opciones][] = [
      [`/inmuebles/${deB.id}/inquilinos/${ana.id}`, { metodo: "PATCH", cuerpo: { nombre: "Cambiado" } }],
      [`/inmuebles/${deB.id}/ocupaciones/${ana.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-12-31" } }],
      [`/inmuebles/${deB.id}/tipos-gasto/${luz.id}`, { metodo: "PATCH", cuerpo: { nombre: "Cambiado" } }],
    ];
    for (const [ruta, opciones] of cruzados) expect((await pedir(ruta, { ...opciones, cookie: b })).status, ruta).toBe(404);
    // Ni meter a su inquilino en una habitación de A.
    const enHabitacionAjena = await alta(b, deB.id, { nombre: "X", ocupacion: { habitacionId: deA.h2, entrada: "2027-01-01" } });
    expect(await enHabitacionAjena.json()).toEqual({ error: "HABITACION_DESCONOCIDA" });

    // Lo de A sigue igual.
    expect(await lista(a, deA.id)).toEqual([ana]);
    const tiposA = ListaTiposGasto.parse(await (await pedir(`/inmuebles/${deA.id}/tipos-gasto`, { cookie: a })).json());
    expect(tiposA.tiposGasto).toEqual([luz]);
  });

  it("desde otra web no se puede dar de alta un inquilino (CSRF)", async () => {
    const cookie = await cuenta();
    const { id } = await inmueble(cookie);
    const r = await pedir(`/inmuebles/${id}/inquilinos`, { cuerpo: { nombre: "Ana" }, cookie, origen: "https://malvado.example" });
    expect(r.status).toBe(403);
    expect(await lista(cookie, id)).toEqual([]);
  });
});
