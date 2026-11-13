// Spec 001 · tarea 5.4: reparto guardado al confirmar, pagos de cada parte, desactualizado,
// recalcular y deshacer (R10–R15); y las partes de gastos en los cobros y el panel (spec 009).
import { PGlite } from "@electric-sql/pglite";
import {
  CobrosDelMes,
  Factura,
  Inmueble,
  Inquilino,
  Panel,
  ParteReparto,
  PermisosSubida,
  RepartoFactura,
  ResultadoPagoTodo,
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
  // Hoy es el 2026-10-20 en Madrid: las facturas se reparten en octubre.
  app = crearApp({ auth, bd, registro, almacen, ahora: () => new Date("2026-10-20T10:00:00Z") }, { rutaBase: "/api" });
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
  const email = `repartos${++contador}@ejemplo.test`;
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
 * El caso de la spec: luz de septiembre, 90 €. A y B todo el mes; C entra el 21.
 * La factura queda confirmada (y repartida) el 2026-10-20.
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
  const h = Object.fromEntries(i.habitaciones.map((x) => [x.nombre, x.id])) as Record<"H1" | "H2" | "H3", string>;
  const alta = async (nombre: string, habitacionId: string, entrada: string) =>
    Inquilino.parse(
      await (await pedir(`/inmuebles/${i.id}/inquilinos`, { cuerpo: { nombre, ocupacion: { habitacionId, entrada } }, cookie })).json(),
    );
  const a = await alta("A", h.H1, "2026-01-01");
  const b = await alta("B", h.H2, "2026-01-01");
  const c = await alta("C", h.H3, "2026-09-21");
  const luz = TipoGasto.parse(await (await pedir(`/inmuebles/${i.id}/tipos-gasto`, { cuerpo: { nombre: "Luz" }, cookie })).json());
  const base = `/inmuebles/${i.id}`;

  const p = PermisosSubida.parse(await (await pedir(`${base}/facturas/subidas`, { cuerpo: { cantidad: 1 }, cookie })).json());
  almacen.subir(p.permisos[0]!.campos, PDF);
  const subida = ResultadoSubidaFacturas.parse(
    await (await pedir(`${base}/facturas`, { cuerpo: { subidas: [{ subidaId: p.permisos[0]!.subidaId, nombre: "luz.pdf" }] }, cookie })).json(),
  );
  const facturaId = subida.facturas[0]!.id;
  await pedir(`${base}/facturas/${facturaId}`, {
    metodo: "PATCH",
    cuerpo: { tipoGastoId: luz.id, periodoInicio: "2026-09-01", periodoFin: "2026-09-30", importeTotal: 9_000 },
    cookie,
  });
  const confirmada = Factura.parse(await (await pedir(`${base}/facturas/${facturaId}/confirmar`, { cuerpo: {}, cookie })).json());

  const reparto = async () => RepartoFactura.parse(await (await pedir(`${base}/facturas/${facturaId}/reparto`, { cookie })).json());
  const parteDe = async (q: Inquilino) => (await reparto()).partes.find((x) => x.inquilinoId === q.id)!;
  const pagar = async (q: Inquilino, pagadoEn: string | null) =>
    pedir(`${base}/partes/${(await parteDe(q)).id}`, { metodo: "PATCH", cuerpo: { pagadoEn }, cookie });
  const importes = async () => {
    const r = await reparto();
    return Object.fromEntries([a, b, c].map((q) => [q.nombre, r.partes.find((x) => x.inquilinoId === q.id)?.importe ?? 0]));
  };
  const corregirEntradaDeC = (entrada: string) =>
    pedir(`${base}/ocupaciones/${c.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { entrada }, cookie });
  return { cookie, id: i.id, base, a, b, c, facturaId, confirmada, reparto, parteDe, pagar, importes, corregirEntradaDeC };
}

const error = async (r: Response) => ((await r.json()) as { error: string }).error;

describe("Spec 001 · Reparto guardado", () => {
  it("C10 · confirmar reparte: factura repartida y partes pendientes de A 40 €, B 40 € y C 10 €", async () => {
    const e = await escenario();
    expect(e.confirmada.estado).toBe("repartida");
    expect(e.confirmada.reparto?.partes.map((p) => p.pagadoEn)).toEqual([null, null, null]);
    expect(await e.importes()).toEqual({ A: 4_000, B: 4_000, C: 1_000 });
    const detalle = await e.reparto();
    expect(detalle.sinOcupar).toEqual({ dias: 0, importe: 0 });
    // Detalle por tramos: del 1 al 20 A y B; del 21 al 30 los tres.
    expect(detalle.tramos.map((tr) => [tr.desde, tr.hasta, tr.presentes.length])).toEqual([
      ["2026-09-01", "2026-09-20", 2],
      ["2026-09-21", "2026-09-30", 3],
    ]);
  });

  it("C11 · marcar la parte de C pagada y desmarcarla", async () => {
    const e = await escenario();
    expect(ParteReparto.parse(await (await e.pagar(e.c, "2026-10-05")).json()).pagadoEn).toBe("2026-10-05");
    expect(ParteReparto.parse(await (await e.pagar(e.c, null)).json()).pagadoEn).toBeNull();
    const futuro = await e.pagar(e.c, "2026-10-21");
    expect(await error(futuro)).toBe("PAGO_FUTURO");
  });

  it("C12 · corregir la entrada de C deja el reparto desactualizado; al recalcular, 35 / 35 / 20", async () => {
    const e = await escenario();
    await e.corregirEntradaDeC("2026-09-11");
    expect((await e.reparto()).desactualizado).toBe(true);
    const r = await pedir(`${e.base}/facturas/${e.facturaId}/recalcular`, { cuerpo: {}, cookie: e.cookie });
    expect(Factura.parse(await r.json()).reparto?.desactualizado).toBe(false);
    expect(await e.importes()).toEqual({ A: 3_500, B: 3_500, C: 2_000 });
  });

  it("C13 · recalcular con una parte pagada pide confirmación y la parte sigue pagada", async () => {
    const e = await escenario();
    await e.pagar(e.a, "2026-10-10");
    await e.corregirEntradaDeC("2026-09-11");
    const sinConfirmar = await pedir(`${e.base}/facturas/${e.facturaId}/recalcular`, { cuerpo: {}, cookie: e.cookie });
    expect(await error(sinConfirmar)).toBe("CONFIRMACION_NECESARIA");
    await pedir(`${e.base}/facturas/${e.facturaId}/recalcular`, { cuerpo: { confirmar: true }, cookie: e.cookie });
    expect(await e.parteDe(e.a)).toMatchObject({ importe: 3_500, pagadoEn: "2026-10-10" });
  });

  it("C14 · deshacer con una parte pagada pide confirmación y la devuelve a por revisar sin reparto", async () => {
    const e = await escenario();
    await e.pagar(e.a, "2026-10-10");
    const sinConfirmar = await pedir(`${e.base}/facturas/${e.facturaId}/deshacer`, { cuerpo: {}, cookie: e.cookie });
    expect(await error(sinConfirmar)).toBe("CONFIRMACION_NECESARIA");
    const r = await pedir(`${e.base}/facturas/${e.facturaId}/deshacer`, { cuerpo: { confirmar: true }, cookie: e.cookie });
    expect(Factura.parse(await r.json())).toMatchObject({ estado: "subida", reparto: null, importeTotal: 9_000 });
    expect((await pedir(`${e.base}/facturas/${e.facturaId}/reparto`, { cookie: e.cookie })).status).toBe(404);
  });

  it("C15 · las partes son del mes en que se repartió la factura (octubre), no del de su periodo", async () => {
    const e = await escenario();
    expect((await e.reparto()).mes).toBe("2026-10");
    const octubre = CobrosDelMes.parse(await (await pedir(`${e.base}/cobros/mes/2026-10`, { cookie: e.cookie })).json());
    expect(octubre.gastos.map((g) => [g.inquilinoId, g.importe, g.periodoInicio])).toHaveLength(3);
    const septiembre = CobrosDelMes.parse(await (await pedir(`${e.base}/cobros/mes/2026-09`, { cookie: e.cookie })).json());
    expect(septiembre.gastos).toEqual([]);
  });

  it("un reparto sin cambios en su periodo no se marca; los días sin nadie los asume la propietaria", async () => {
    const e = await escenario();
    // Un cambio fuera de septiembre no afecta a este reparto.
    await pedir(`/inmuebles/${e.id}/ocupaciones/${e.a.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-12-31" }, cookie: e.cookie });
    expect((await e.reparto()).desactualizado).toBe(false);
    // C entra el 25 en lugar del 21: del 21 al 24 solo A y B.
    await e.corregirEntradaDeC("2026-09-25");
    expect((await e.reparto()).desactualizado).toBe(true);
  });
});

describe("Spec 009 · Partes de gastos en los cobros y el panel", () => {
  it("C4 · un toque y «Todo pagado» también marcan las partes de gastos del mes", async () => {
    const e = await escenario();
    await pedir(`${e.base}/cobros/generar`, { cuerpo: { mes: "2026-10" }, cookie: e.cookie });
    const r = ResultadoPagoTodo.parse(
      await (await pedir(`${e.base}/cobros/pagar-todo`, { cuerpo: { inquilinoId: e.a.id, mes: "2026-10" }, cookie: e.cookie })).json(),
    );
    expect(r.marcados).toHaveLength(1);
    expect(r.partes.map((p) => [p.importe, p.pagadoEn])).toEqual([[4_000, "2026-10-20"]]);
    expect((await e.parteDe(e.a)).pagadoEn).toBe("2026-10-20");
    expect((await e.parteDe(e.b)).pagadoEn).toBeNull();
  });

  it("C1 y C2 · el panel suma las partes de gastos pendientes con su nombre", async () => {
    const e = await escenario();
    const p = Panel.parse(await (await pedir("/panel", { cookie: e.cookie })).json());
    expect(p.totalPendiente).toBe(9_000);
    const deC = p.pendientes[0]!.inquilinos.find((q) => q.inquilinoId === e.c.id)!;
    expect(deC.conceptos).toEqual([expect.objectContaining({ tipo: "gasto", nombreGasto: "Luz", mes: "2026-10", importe: 1_000 })]);
    await e.pagar(e.c, "2026-10-12");
    const tras = Panel.parse(await (await pedir("/panel", { cookie: e.cookie })).json());
    expect(tras.totalPendiente).toBe(8_000);
    expect(tras.cobradoEsteMes).toBe(1_000);
  });
});

describe("Aislamiento del reparto", () => {
  it("otra cuenta no ve, paga, recalcula ni deshace el reparto ajeno", async () => {
    const e = await escenario();
    const ajena = await cuenta();
    const parte = await e.parteDe(e.a);
    const intentos = [
      pedir(`${e.base}/facturas/${e.facturaId}/reparto`, { cookie: ajena }),
      pedir(`${e.base}/partes/${parte.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-01" }, cookie: ajena }),
      pedir(`${e.base}/facturas/${e.facturaId}/recalcular`, { cuerpo: { confirmar: true }, cookie: ajena }),
      pedir(`${e.base}/facturas/${e.facturaId}/deshacer`, { cuerpo: { confirmar: true }, cookie: ajena }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(404);
    // Ni desde su propio inmueble con ids ajenos.
    const otra = await escenario();
    expect((await pedir(`${otra.base}/partes/${parte.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-01" }, cookie: otra.cookie })).status).toBe(404);
    expect((await e.parteDe(e.a)).pagadoEn).toBeNull();
    expect((await e.reparto()).partes).toHaveLength(3);
  });
});
