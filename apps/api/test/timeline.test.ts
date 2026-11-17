// Spec 006 · tarea 6.2: datos del timeline del inmueble.
import { PGlite } from "@electric-sql/pglite";
import {
  DatosTimeline,
  Factura,
  Inmueble,
  Inquilino,
  ListaCobros,
  PermisosSubida,
  RepartoFactura,
  ResultadoGeneracion,
  ResultadoSubidaFacturas,
  TipoGasto,
  VERSION_TERMINOS,
} from "@inquilinus/contracts";
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
const almacen = crearAlmacenMemoria();
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
  // Hoy es el 2026-10-02 en Madrid.
  app = crearApp({ auth, bd, registro, almacen, ahora: () => new Date("2026-10-02T10:00:00Z") }, { rutaBase: "/api" });
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
  const email = `timeline${++contador}@ejemplo.test`;
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
 * Caso C4 de la spec 002 en modo habitaciones: A en H1 y B en H2 desde el 1 de
 * septiembre, C en H3 desde el 11; luz del 1 al 30 de septiembre, 90 €.
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
  const a = await alta("A", i.habitaciones[0]!.id, "2026-09-01");
  const b = await alta("B", i.habitaciones[1]!.id, "2026-09-01");
  const c = await alta("C", i.habitaciones[2]!.id, "2026-09-11");
  const tipo = async (nombre: string) => TipoGasto.parse(await (await pedir(`${base}/tipos-gasto`, { cuerpo: { nombre }, cookie })).json());
  const luz = await tipo("Luz");
  const gas = await tipo("Gas");

  const factura = async (tipoGastoId: string, inicio: string, fin: string, importe: number, confirmar = true) => {
    const p = PermisosSubida.parse(await (await pedir(`${base}/facturas/subidas`, { cuerpo: { cantidad: 1 }, cookie })).json());
    almacen.subir(p.permisos[0]!.campos, PDF);
    const lote = ResultadoSubidaFacturas.parse(
      await (await pedir(`${base}/facturas`, { cuerpo: { subidas: [{ subidaId: p.permisos[0]!.subidaId, nombre: `${inicio}.pdf` }] }, cookie })).json(),
    );
    const id = lote.facturas[0]!.id;
    await pedir(`${base}/facturas/${id}`, {
      metodo: "PATCH",
      cuerpo: { tipoGastoId, periodoInicio: inicio, periodoFin: fin, importeTotal: importe },
      cookie,
    });
    if (confirmar) Factura.parse(await (await pedir(`${base}/facturas/${id}/confirmar`, { cuerpo: { continuarConSolapes: true }, cookie })).json());
    return id;
  };
  const timeline = async () => DatosTimeline.parse(await (await pedir(`${base}/timeline`, { cookie })).json());
  return { cookie, base, i, a, b, c, luz, gas, factura, timeline };
}

describe("Spec 006 · datos del timeline", () => {
  it("tipos de gasto en orden de creación, estancias de cada inquilino, cobros no quitados y solo facturas repartidas", async () => {
    const e = await escenario();
    const luzSeptiembre = await e.factura(e.luz.id, "2026-09-01", "2026-09-30", 9_000);
    // Una por revisar no aparece (R4b).
    await e.factura(e.luz.id, "2026-10-01", "2026-10-31", 5_000, false);
    // El gas, archivado: sigue en la lista; R2b decide en la web si tiene fila.
    await pedir(`${e.base}/tipos-gasto/${e.gas.id}`, { metodo: "PATCH", cuerpo: { archivado: true }, cookie: e.cookie });

    const generados = ResultadoGeneracion.parse(
      await (await pedir(`${e.base}/cobros/generar`, { cuerpo: { mes: "2026-10" }, cookie: e.cookie })).json(),
    ).creados;
    expect(generados).toHaveLength(3);
    const deC = generados.find((x) => x.inquilinoId === e.c.id)!;
    await pedir(`${e.base}/cobros/${deC.id}`, { metodo: "PATCH", cuerpo: { quitado: true }, cookie: e.cookie });
    const deA = generados.find((x) => x.inquilinoId === e.a.id)!;
    await pedir(`${e.base}/cobros/${deA.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-01" }, cookie: e.cookie });
    const reparto = RepartoFactura.parse(await (await pedir(`${e.base}/facturas/${luzSeptiembre}/reparto`, { cookie: e.cookie })).json());
    const parteA = reparto.partes.find((p) => p.inquilinoId === e.a.id)!;
    await pedir(`${e.base}/partes/${parteA.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-02" }, cookie: e.cookie });

    const datos = await e.timeline();
    expect(datos.tiposGasto.map((tg) => [tg.nombre, tg.color, tg.archivado])).toEqual([
      ["Luz", "ambar", false],
      ["Gas", "azul", true],
    ]);
    expect(datos.inquilinos.map((q) => [q.nombre, q.ocupaciones.map((o) => [o.entrada, o.salida])])).toEqual([
      ["A", [["2026-09-01", null]]],
      ["B", [["2026-09-01", null]]],
      ["C", [["2026-09-11", null]]],
    ]);
    // R3b: el quitado no aparece; el pagado lleva su fecha.
    const todos = ListaCobros.parse(await (await pedir(`${e.base}/cobros?quitados=true`, { cookie: e.cookie })).json()).cobros;
    expect(datos.cobros.map((x) => x.id).sort()).toEqual(
      todos
        .filter((x) => !x.quitado)
        .map((x) => x.id)
        .sort(),
    );
    expect(datos.cobros.find((x) => x.id === deA.id)).toMatchObject({ fechaCobro: deA.fechaCobro, importe: deA.importe, pagadoEn: "2026-10-01" });
    expect(datos.cobros.some((x) => x.id === deC.id)).toBe(false);
    // R4 y R10: la luz de septiembre, con la parte de cada uno y quién ha pagado.
    expect(datos.facturas).toHaveLength(1);
    const luz = datos.facturas[0]!;
    expect(luz).toMatchObject({
      id: luzSeptiembre,
      tipoGastoId: e.luz.id,
      periodoInicio: "2026-09-01",
      periodoFin: "2026-09-30",
      importeTotal: 9_000,
    });
    const pagos = new Map(luz.partes.map((p) => [p.inquilinoId, p.pagadoEn]));
    expect([pagos.get(e.a.id), pagos.get(e.b.id), pagos.get(e.c.id)]).toEqual(["2026-10-02", null, null]);
    // Lo de cada inquilino no lleva datos de más (RGPD): ni documentos ni fianza.
    expect(Object.keys(datos.inquilinos[0]!).sort()).toEqual(["id", "nombre", "ocupaciones"]);
  });
});

describe("Aislamiento del timeline", () => {
  it("sin sesión, 401; otra cuenta, 404", async () => {
    const e = await escenario();
    expect((await pedir(`${e.base}/timeline`)).status).toBe(401);
    const ajena = await cuenta();
    expect((await pedir(`${e.base}/timeline`, { cookie: ajena })).status).toBe(404);
    expect((await pedir(`/inmuebles/no-es-un-uuid/timeline`, { cookie: e.cookie })).status).toBe(404);
  });
});
