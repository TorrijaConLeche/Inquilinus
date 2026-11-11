// Spec 007 · tarea 3.2: API de inmuebles, habitaciones e historial de precios.
import { PGlite } from "@electric-sql/pglite";
import { Inmueble, ListaInmuebles, VERSION_TERMINOS } from "@inquilinus/contracts";
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
/** "Hoy" para la app: 15 de noviembre de 2026 (mes actual 2026-11). */
let ahora = new Date("2026-11-15T12:00:00Z");

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
  app = crearApp({ auth, bd, registro, ahora: () => ahora }, { rutaBase: "/api" });
}, 30_000);

type Opciones = { metodo?: string; cuerpo?: unknown; cookie?: string; origen?: string };

function pedir(ruta: string, { metodo, cuerpo, cookie, origen }: Opciones = {}) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: {
      origin: origen ?? URL_BASE,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

let contador = 0;
/** Cuenta verificada con sesión abierta; devuelve su cookie. */
async function cuenta() {
  const email = `inmuebles${++contador}@ejemplo.test`;
  await pedir("/auth/sign-up/email", { cuerpo: { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS } });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

const ALTA_MINIMA = {
  nombre: "Piso Centro",
  modalidad: "habitaciones",
  habitaciones: [{ nombre: "H1", precioMensual: 50_000 }],
};

async function crear(cookie: string, alta: object = ALTA_MINIMA) {
  const r = await pedir("/inmuebles", { cuerpo: alta, cookie });
  expect(r.status).toBe(201);
  return Inmueble.parse(await r.json());
}

describe("alta del inmueble (spec 007)", () => {
  it("C1 — Alta mínima (R1): mes completo, día de cobro 1 y sin dirección", async () => {
    const cookie = await cuenta();
    const inmueble = await crear(cookie);
    expect(inmueble).toMatchObject({
      nombre: "Piso Centro",
      direccion: null,
      modalidad: "habitaciones",
      mesesParciales: "mes_completo",
      diaCobro: 1,
      archivado: false,
      bloqueado: false,
    });
    expect(inmueble.habitaciones).toEqual([
      expect.objectContaining({
        nombre: "H1",
        precioActual: 50_000,
        historialPrecios: [{ desdeMes: "2026-11", precioMensual: 50_000 }],
      }),
    ]);
  });

  it("C2 — Sin habitaciones (R1): error de validación", async () => {
    const cookie = await cuenta();
    const r = await pedir("/inmuebles", { cuerpo: { ...ALTA_MINIMA, habitaciones: [] }, cookie });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "SIN_HABITACIONES" });
    const lista = ListaInmuebles.parse(await (await pedir("/inmuebles", { cookie })).json());
    expect(lista.inmuebles).toEqual([]);
  });

  it("valida nombre, día de cobro y precios con las reglas del dominio", async () => {
    const cookie = await cuenta();
    const sinNombre = await pedir("/inmuebles", { cuerpo: { ...ALTA_MINIMA, nombre: "  " }, cookie });
    expect(await sinNombre.json()).toEqual({ error: "NOMBRE_OBLIGATORIO" });
    const dia29 = await pedir("/inmuebles", { cuerpo: { ...ALTA_MINIMA, diaCobro: 29 }, cookie });
    expect(await dia29.json()).toEqual({ error: "DIA_COBRO_INVALIDO" });
    const decimales = await pedir("/inmuebles", {
      cuerpo: { ...ALTA_MINIMA, habitaciones: [{ nombre: "H1", precioMensual: 500.5 }] },
      cookie,
    });
    expect(await decimales.json()).toEqual({ error: "DATOS_INVALIDOS" });
  });

  it("R3: el precio inicial puede empezar en un mes anterior, pero no en uno futuro", async () => {
    const cookie = await cuenta();
    const antes = await crear(cookie, {
      ...ALTA_MINIMA,
      habitaciones: [{ nombre: "H1", precioMensual: 45_000, desdeMes: "2025-09" }],
    });
    expect(antes.habitaciones[0]!.historialPrecios).toEqual([{ desdeMes: "2025-09", precioMensual: 45_000 }]);

    const futuro = await pedir("/inmuebles", {
      cuerpo: { ...ALTA_MINIMA, habitaciones: [{ nombre: "H1", precioMensual: 45_000, desdeMes: "2027-01" }] },
      cookie,
    });
    expect(await futuro.json()).toEqual({ error: "PRECIO_INICIAL_FUTURO" });
  });

  it("todo o nada: si una habitación no es válida, no se crea el inmueble", async () => {
    const cookie = await cuenta();
    const r = await pedir("/inmuebles", {
      cuerpo: { ...ALTA_MINIMA, habitaciones: [{ nombre: "H1", precioMensual: 1 }, { nombre: "", precioMensual: 1 }] },
      cookie,
    });
    expect(r.status).toBe(400);
    expect(ListaInmuebles.parse(await (await pedir("/inmuebles", { cookie })).json()).inmuebles).toEqual([]);
  });
});

describe("editar el inmueble (spec 007)", () => {
  it("R2: se edita todo menos la modalidad", async () => {
    const cookie = await cuenta();
    const { id } = await crear(cookie);
    const editado = await pedir(`/inmuebles/${id}`, {
      metodo: "PATCH",
      cuerpo: { nombre: "Piso Centro 2", direccion: "Calle Mayor 1", mesesParciales: "prorrateo", diaCobro: 5 },
      cookie,
    });
    expect(Inmueble.parse(await editado.json())).toMatchObject({
      nombre: "Piso Centro 2",
      direccion: "Calle Mayor 1",
      mesesParciales: "prorrateo",
      diaCobro: 5,
      modalidad: "habitaciones",
    });

    const modalidad = await pedir(`/inmuebles/${id}`, { metodo: "PATCH", cuerpo: { modalidad: "entero" }, cookie });
    expect(modalidad.status).toBe(400);
    expect(await modalidad.json()).toEqual({ error: "MODALIDAD_NO_EDITABLE" });
  });

  it("borrar la dirección la deja vacía", async () => {
    const cookie = await cuenta();
    const { id } = await crear(cookie, { ...ALTA_MINIMA, direccion: "Calle Mayor 1" });
    const r = await pedir(`/inmuebles/${id}`, { metodo: "PATCH", cuerpo: { direccion: "  " }, cookie });
    expect(Inmueble.parse(await r.json()).direccion).toBeNull();
  });
});

describe("habitaciones y precios (spec 007)", () => {
  it("C3 — Cambio de precio (R4): diciembre de 2026, 500 €; enero de 2027, 550 €", async () => {
    const cookie = await cuenta();
    const inmueble = await crear(cookie);
    const h1 = inmueble.habitaciones[0]!;

    const r = await pedir(`/inmuebles/${inmueble.id}/habitaciones/${h1.id}/precios`, {
      cuerpo: { desdeMes: "2027-01", precioMensual: 55_000 },
      cookie,
    });
    expect(r.status).toBe(200);
    expect(Inmueble.parse(await r.json()).habitaciones[0]!.historialPrecios).toEqual([
      { desdeMes: "2026-11", precioMensual: 50_000 },
      { desdeMes: "2027-01", precioMensual: 55_000 },
    ]);

    const precioEn = async (fecha: string) => {
      ahora = new Date(fecha);
      const detalle = Inmueble.parse(await (await pedir(`/inmuebles/${inmueble.id}`, { cookie })).json());
      return detalle.habitaciones[0]!.precioActual;
    };
    expect(await precioEn("2026-12-15T12:00:00Z")).toBe(50_000);
    expect(await precioEn("2027-01-15T12:00:00Z")).toBe(55_000);
    ahora = new Date("2026-11-15T12:00:00Z");
  });

  it("el mes se cuenta en hora de Madrid", async () => {
    const cookie = await cuenta();
    const inmueble = await crear(cookie);
    const h1 = inmueble.habitaciones[0]!;
    await pedir(`/inmuebles/${inmueble.id}/habitaciones/${h1.id}/precios`, {
      cuerpo: { desdeMes: "2027-01", precioMensual: 55_000 },
      cookie,
    });
    // 31 de diciembre a las 23:30 UTC ya es 1 de enero en Madrid.
    ahora = new Date("2026-12-31T23:30:00Z");
    const detalle = Inmueble.parse(await (await pedir(`/inmuebles/${inmueble.id}`, { cookie })).json());
    expect(detalle.habitaciones[0]!.precioActual).toBe(55_000);
    ahora = new Date("2026-11-15T12:00:00Z");
  });

  it("un segundo cambio en el mismo mes sustituye al primero", async () => {
    const cookie = await cuenta();
    const inmueble = await crear(cookie);
    const ruta = `/inmuebles/${inmueble.id}/habitaciones/${inmueble.habitaciones[0]!.id}/precios`;
    await pedir(ruta, { cuerpo: { desdeMes: "2027-01", precioMensual: 55_000 }, cookie });
    const r = await pedir(ruta, { cuerpo: { desdeMes: "2027-01", precioMensual: 56_000 }, cookie });
    expect(Inmueble.parse(await r.json()).habitaciones[0]!.historialPrecios).toEqual([
      { desdeMes: "2026-11", precioMensual: 50_000 },
      { desdeMes: "2027-01", precioMensual: 56_000 },
    ]);
  });

  it("añadir y renombrar habitaciones", async () => {
    const cookie = await cuenta();
    const inmueble = await crear(cookie);
    const nueva = await pedir(`/inmuebles/${inmueble.id}/habitaciones`, {
      cuerpo: { nombre: "H2", precioMensual: 40_000 },
      cookie,
    });
    expect(nueva.status).toBe(201);
    const conDos = Inmueble.parse(await nueva.json());
    expect(conDos.habitaciones.map((h) => [h.nombre, h.precioActual])).toEqual([
      ["H1", 50_000],
      ["H2", 40_000],
    ]);

    const h2 = conDos.habitaciones[1]!;
    const renombrada = await pedir(`/inmuebles/${inmueble.id}/habitaciones/${h2.id}`, {
      metodo: "PATCH",
      cuerpo: { nombre: "Habitación exterior" },
      cookie,
    });
    expect(Inmueble.parse(await renombrada.json()).habitaciones[1]!.nombre).toBe("Habitación exterior");

    const lista = ListaInmuebles.parse(await (await pedir("/inmuebles", { cookie })).json());
    expect(lista.inmuebles).toEqual([expect.objectContaining({ id: inmueble.id, numeroHabitaciones: 2 })]);
  });
});

describe("aislamiento entre cuentas (spec 008, R13)", () => {
  it("cada endpoint de inmuebles responde 404 con lo de otra cuenta y no lo cambia", async () => {
    const a = await cuenta();
    const b = await cuenta();
    const deA = await crear(a);
    const h1 = deA.habitaciones[0]!;

    const intentos: [string, Opciones][] = [
      [`/inmuebles/${deA.id}`, {}],
      [`/inmuebles/${deA.id}`, { metodo: "PATCH", cuerpo: { nombre: "Mío" } }],
      [`/inmuebles/${deA.id}/habitaciones`, { cuerpo: { nombre: "H9", precioMensual: 1 } }],
      [`/inmuebles/${deA.id}/habitaciones/${h1.id}`, { metodo: "PATCH", cuerpo: { nombre: "Mía" } }],
      [`/inmuebles/${deA.id}/habitaciones/${h1.id}/precios`, { cuerpo: { desdeMes: "2027-01", precioMensual: 1 } }],
    ];
    for (const [ruta, opciones] of intentos) {
      const r = await pedir(ruta, { ...opciones, cookie: b });
      expect(r.status, `${opciones.metodo ?? "GET/POST"} ${ruta}`).toBe(404);
    }

    // B no ve el inmueble de A en su lista, y el de A sigue intacto.
    expect(ListaInmuebles.parse(await (await pedir("/inmuebles", { cookie: b })).json()).inmuebles).toEqual([]);
    const intacto = Inmueble.parse(await (await pedir(`/inmuebles/${deA.id}`, { cookie: a })).json());
    expect(intacto).toEqual(deA);
  });

  it("no se puede tocar una habitación desde la URL de otro inmueble, aunque ambos sean propios", async () => {
    const a = await cuenta();
    const uno = await crear(a);
    const otro = await crear(a, { ...ALTA_MINIMA, nombre: "Otro" });
    const r = await pedir(`/inmuebles/${otro.id}/habitaciones/${uno.habitaciones[0]!.id}`, {
      metodo: "PATCH",
      cuerpo: { nombre: "Cruzada" },
      cookie: a,
    });
    expect(r.status).toBe(404);
  });
});

describe("protecciones", () => {
  it("sin sesión, 401", async () => {
    expect((await pedir("/inmuebles")).status).toBe(401);
    expect((await pedir("/inmuebles", { cuerpo: ALTA_MINIMA })).status).not.toBe(201);
  });

  it("desde otra web no se puede crear ni editar (CSRF)", async () => {
    const cookie = await cuenta();
    const r = await pedir("/inmuebles", { cuerpo: ALTA_MINIMA, cookie, origen: "https://malvado.example" });
    expect(r.status).toBe(403);
    expect(ListaInmuebles.parse(await (await pedir("/inmuebles", { cookie })).json()).inmuebles).toEqual([]);
  });

  it("un id que no es un UUID se trata como inexistente (404, no 500)", async () => {
    const cookie = await cuenta();
    expect((await pedir("/inmuebles/no-es-un-id", { cookie })).status).toBe(404);
    expect((await pedir("/inmuebles/no-es-un-id/habitaciones/tampoco", { metodo: "PATCH", cuerpo: { nombre: "x" }, cookie })).status).toBe(404);
  });

  it("un cuerpo que no es JSON válido da 400", async () => {
    const cookie = await cuenta();
    const r = await app.request(`${URL_BASE}/api/inmuebles`, {
      method: "POST",
      headers: { origin: URL_BASE, "content-type": "application/json", cookie },
      body: "{no es json",
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "DATOS_INVALIDOS" });
  });
});
