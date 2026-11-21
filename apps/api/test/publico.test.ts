// Spec 004 · tarea 6.5: vista del inquilino con su enlace.
import { PGlite } from "@electric-sql/pglite";
import {
  EnlaceGenerado,
  Factura,
  Inmueble,
  Inquilino,
  ListaInquilinos,
  PermisosSubida,
  RepartoFactura,
  ResultadoSubidaFacturas,
  TipoGasto,
  VERSION_TERMINOS,
  VistaInquilino,
} from "@inquilinus/contracts";
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
import { crearAlmacenMemoria } from "./almacen-memoria.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";
const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF");

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
  const email = `publico${++contador}@ejemplo.test`;
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
 * Caso C1 de la spec 001: A y B todo septiembre, C desde el 21; luz del 1 al
 * 30 de septiembre, 90 €. A paga 30 € (1–20, con B) + 10 € (21–30, con B y C).
 */
async function escenario() {
  const cookie = await cuenta();
  const i = Inmueble.parse(
    await (
      await pedir("/inmuebles", {
        cuerpo: {
          nombre: "Piso Centro",
          modalidad: "habitaciones",
          habitaciones: [
            { nombre: "H1", precioMensual: 50_000, desdeMes: "2026-01" },
            { nombre: "H2", precioMensual: 40_000, desdeMes: "2026-01" },
            { nombre: "H3", precioMensual: 30_000, desdeMes: "2026-01" },
          ],
        },
        cookie,
      })
    ).json(),
  );
  const base = `/inmuebles/${i.id}`;
  const alta = async (nombre: string, habitacionId: string, entrada: string) =>
    Inquilino.parse(await (await pedir(`${base}/inquilinos`, { cuerpo: { nombre, ocupacion: { habitacionId, entrada } }, cookie })).json());
  const a = await alta("Ana García", i.habitaciones[0]!.id, "2026-09-01");
  const b = await alta("Bruno Pérez", i.habitaciones[1]!.id, "2026-09-01");
  const c = await alta("Carla", i.habitaciones[2]!.id, "2026-09-21");
  const tipo = async (nombre: string) => TipoGasto.parse(await (await pedir(`${base}/tipos-gasto`, { cuerpo: { nombre }, cookie })).json());
  const luz = await tipo("Luz");
  const agua = await tipo("Agua");

  const factura = async (tipoGastoId: string, inicio: string, fin: string, importe: number) => {
    const p = PermisosSubida.parse(await (await pedir(`${base}/facturas/subidas`, { cuerpo: { cantidad: 1 }, cookie })).json());
    almacen.subir(p.permisos[0]!.campos, PDF);
    const lote = ResultadoSubidaFacturas.parse(
      await (await pedir(`${base}/facturas`, { cuerpo: { subidas: [{ subidaId: p.permisos[0]!.subidaId, nombre: `${inicio}.pdf` }] }, cookie })).json(),
    );
    const id = lote.facturas[0]!.id;
    await pedir(`${base}/facturas/${id}`, { metodo: "PATCH", cuerpo: { tipoGastoId, periodoInicio: inicio, periodoFin: fin, importeTotal: importe }, cookie });
    Factura.parse(await (await pedir(`${base}/facturas/${id}/confirmar`, { cuerpo: { continuarConSolapes: true }, cookie })).json());
    return id;
  };
  const parteDe = async (facturaId: string, q: Inquilino) =>
    RepartoFactura.parse(await (await pedir(`${base}/facturas/${facturaId}/reparto`, { cookie })).json()).partes.find((p) => p.inquilinoId === q.id)!;
  const enlace = async (q: Inquilino) =>
    EnlaceGenerado.parse(await (await pedir(`${base}/inquilinos/${q.id}/enlace`, { cuerpo: {}, cookie })).json()).token;
  const vista = (token: string) => pedir(`/publico/${token}`);
  return { cookie, base, i, a, b, c, luz, agua, factura, parteDe, enlace, vista };
}

const leerVista = async (r: Response) => {
  expect(r.status).toBe(200);
  return VistaInquilino.parse(await r.json());
};

describe("Spec 004 · vista del inquilino", () => {
  it("C1 · enlace válido: la vista con los datos de A y nada de los demás", async () => {
    const e = await escenario();
    await pedir(`${e.base}/cobros/generar`, { cuerpo: { mes: "2026-09" }, cookie: e.cookie });
    const luz = await e.factura(e.luz.id, "2026-09-01", "2026-09-30", 9_000);
    const parteB = await e.parteDe(luz, e.b);
    await pedir(`${e.base}/partes/${parteB.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-01" }, cookie: e.cookie });
    const v = await leerVista(await e.vista(await e.enlace(e.a)));
    expect(v.inquilino).toEqual({ id: e.a.id, nombre: "Ana García" });
    expect(v.inmueble).toEqual({ nombre: "Piso Centro", bloqueado: false });
    expect(v.cobros.map((c) => c.mes)).toEqual(["2026-09"]);
    expect(v.gastos).toHaveLength(1);
    // R7b y R9: nada de B ni de C: ni sus cobros, ni sus partes, ni sus pagos.
    const texto = JSON.stringify(v);
    expect(texto).not.toContain(parteB.id);
    expect(texto).not.toContain("2026-10-01");
    expect(texto).not.toContain("Pérez");
    expect(v.timeline.cobros.every((c) => c.inquilinoId === e.a.id)).toBe(true);
    expect(v.timeline.facturas.flatMap((f) => f.partes).every((p) => p.inquilinoId === e.a.id)).toBe(true);
    // R6c: las estancias de todos, los demás por su nombre de pila.
    expect(v.timeline.inquilinos.map((q) => q.nombre)).toEqual(["Ana García", "Bruno", "Carla"]);
  });

  it("C2 y C9 · revocado, inexistente o mal formado: el mismo 404, sin ningún dato", async () => {
    const e = await escenario();
    const token = await e.enlace(e.a);
    await pedir(`${e.base}/inquilinos/${e.a.id}/enlace`, { metodo: "DELETE", cookie: e.cookie });
    const respuestas = await Promise.all([e.vista(token), e.vista("abc"), e.vista("A".repeat(43))]);
    for (const r of respuestas) {
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "ENLACE_NO_DISPONIBLE" });
    }
  });

  it("C4 · regenerar: el antiguo da el mismo 404 y el nuevo funciona", async () => {
    const e = await escenario();
    const antiguo = await e.enlace(e.a);
    const nuevo = EnlaceGenerado.parse(
      await (await pedir(`${e.base}/inquilinos/${e.a.id}/enlace/regenerar`, { cuerpo: {}, cookie: e.cookie })).json(),
    ).token;
    expect((await e.vista(antiguo)).status).toBe(404);
    expect((await leerVista(await e.vista(nuevo))).inquilino.id).toBe(e.a.id);
  });

  it("C5 · total pendiente: alquiler de septiembre 500 € y luz 40 € pendientes; agua 10 € pagada → 540 €", async () => {
    const e = await escenario();
    // B y C, fuera del inmueble antes de septiembre: la luz y el agua son enteras de A.
    for (const q of [e.b, e.c]) {
      const estancias = ListaInquilinos.parse(await (await pedir(`${e.base}/inquilinos`, { cookie: e.cookie })).json()).inquilinos.find((x) => x.id === q.id)!.ocupaciones;
      await pedir(`${e.base}/ocupaciones/${estancias[0]!.id}`, { metodo: "PATCH", cuerpo: { entrada: "2026-07-01", salida: "2026-07-31" }, cookie: e.cookie });
    }
    await pedir(`${e.base}/cobros/generar`, { cuerpo: { mes: "2026-09" }, cookie: e.cookie });
    await e.factura(e.luz.id, "2026-09-01", "2026-09-30", 4_000);
    const agua = await e.factura(e.agua.id, "2026-09-01", "2026-09-30", 1_000);
    await pedir(`${e.base}/partes/${(await e.parteDe(agua, e.a)).id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-01" }, cookie: e.cookie });
    expect((await leerVista(await e.vista(await e.enlace(e.a)))).pendiente).toBe(54_000);
  });

  it("C6 · detalle del cálculo: 1–20 con Bruno (30 €) y 21–30 con Bruno y Carla (10 €); total 40 €", async () => {
    const e = await escenario();
    await e.factura(e.luz.id, "2026-09-01", "2026-09-30", 9_000);
    const v = await leerVista(await e.vista(await e.enlace(e.a)));
    const gasto = v.gastos[0]!;
    expect(gasto).toMatchObject({ importe: 4_000, importeFactura: 9_000, dias: 30, pagadoEn: null });
    expect(gasto.tramos).toEqual([
      { desde: "2026-09-01", hasta: "2026-09-20", dias: 20, conQuien: ["Bruno"], importe: 3_000 },
      { desde: "2026-09-21", hasta: "2026-09-30", dias: 10, conQuien: ["Bruno", "Carla"], importe: 1_000 },
    ]);
  });

  it("C7, C7b y C8 · descarga: URL firmada si está permitida y la factura es suya; si no, 404", async () => {
    const e = await escenario();
    const luz = await e.factura(e.luz.id, "2026-09-01", "2026-09-30", 9_000);
    const token = await e.enlace(e.a);
    const r = await pedir(`/publico/${token}/facturas/${luz}/pdf`);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBeTruthy();
    // C7b: deshabilitada.
    await pedir(`${e.base}/inquilinos/${e.a.id}/enlace`, { metodo: "PATCH", cuerpo: { permiteDescarga: false }, cookie: e.cookie });
    expect((await pedir(`/publico/${token}/facturas/${luz}/pdf`)).status).toBe(404);
    expect((await leerVista(await e.vista(token))).permiteDescarga).toBe(false);
    // C8: una factura de otro inmueble, con el token de A.
    await pedir(`${e.base}/inquilinos/${e.a.id}/enlace`, { metodo: "PATCH", cuerpo: { permiteDescarga: true }, cookie: e.cookie });
    const otro = await escenario();
    const ajena = await otro.factura(otro.luz.id, "2026-09-01", "2026-09-30", 3_000);
    expect((await pedir(`/publico/${token}/facturas/${ajena}/pdf`)).status).toBe(404);
    expect((await pedir(`/publico/${token}/facturas/no-es-un-id/pdf`)).status).toBe(404);
  });

  it("C10 · las respuestas llevan noindex, Cache-Control privado y Referrer-Policy", async () => {
    const e = await escenario();
    const token = await e.enlace(e.a);
    for (const r of [await e.vista(token), await e.vista("abc")]) {
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("x-robots-tag")).toContain("noindex");
    }
  });

  it("spec 011, C9 · A ve su total de la liquidación y su estado, no el de los demás", async () => {
    const e = await escenario();
    const luz = await e.factura(e.luz.id, "2026-09-01", "2026-09-30", 9_000);
    await pedir(`${e.base}/liquidaciones`, { cuerpo: { facturaIds: [luz] }, cookie: e.cookie });
    await pedir(`${e.base}/partes/${(await e.parteDe(luz, e.b)).id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-01" }, cookie: e.cookie });
    const v = await leerVista(await e.vista(await e.enlace(e.a)));
    expect(v.liquidaciones).toHaveLength(1);
    expect(v.liquidaciones[0]).toMatchObject({ total: 4_000, pendiente: 4_000, estado: "pendiente" });
    expect(v.gastos[0]!.liquidacionId).toBe(v.liquidaciones[0]!.id);
    expect(JSON.stringify(v)).not.toContain("2026-10-01");
  });

  it("R11b · con el inmueble bloqueado, la vista sigue funcionando y lo dice", async () => {
    const e = await escenario();
    const token = await e.enlace(e.a);
    await bd.update(t.inmueble).set({ bloqueado: true }).where(eq(t.inmueble.id, e.i.id));
    expect((await leerVista(await e.vista(token))).inmueble.bloqueado).toBe(true);
  });
});
