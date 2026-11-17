// Spec 011 · tarea 5.5: liquidaciones (R1–R13).
import { PGlite } from "@electric-sql/pglite";
import {
  CobrosDelMes,
  Factura,
  Inmueble,
  Inquilino,
  Liquidacion,
  ListaLiquidaciones,
  Panel,
  PermisosSubida,
  RepartoFactura,
  ResultadoPagoLiquidacion,
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
  // Hoy es el 2026-12-02 en Madrid: las facturas se reparten y las liquidaciones se crean en diciembre.
  app = crearApp({ auth, bd, registro, almacen, ahora: () => new Date("2026-12-02T10:00:00Z") }, { rutaBase: "/api" });
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
  const email = `liquidaciones${++contador}@ejemplo.test`;
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
 * Piso Centro con A y B todo el periodo. Facturas repartidas: luz de octubre 40 €,
 * luz de noviembre 30 € y gas del 1 de septiembre al 30 de noviembre 90 €.
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
          ],
        },
        cookie,
      })
    ).json(),
  );
  const base = `/inmuebles/${i.id}`;
  const alta = async (nombre: string, habitacionId: string) =>
    Inquilino.parse(
      await (await pedir(`${base}/inquilinos`, { cuerpo: { nombre, ocupacion: { habitacionId, entrada: "2026-01-01" } }, cookie })).json(),
    );
  const a = await alta("A", i.habitaciones[0]!.id);
  const b = await alta("B", i.habitaciones[1]!.id);
  const tipo = async (nombre: string) =>
    TipoGasto.parse(await (await pedir(`${base}/tipos-gasto`, { cuerpo: { nombre }, cookie })).json());
  const luz = await tipo("Luz");
  const gas = await tipo("Gas");

  /** Sube, rellena y (si se pide) confirma una factura. Devuelve su id. */
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
  const luzOctubre = await factura(luz.id, "2026-10-01", "2026-10-31", 4_000);
  const luzNoviembre = await factura(luz.id, "2026-11-01", "2026-11-30", 3_000);
  const gasOtono = await factura(gas.id, "2026-09-01", "2026-11-30", 9_000);

  const crear = (facturaIds: string[], extra: object = {}) =>
    pedir(`${base}/liquidaciones`, { cuerpo: { facturaIds, ...extra }, cookie });
  const editar = (id: string, cuerpo: object) => pedir(`${base}/liquidaciones/${id}`, { metodo: "PATCH", cuerpo, cookie });
  const lista = async () => ListaLiquidaciones.parse(await (await pedir(`${base}/liquidaciones`, { cookie })).json()).liquidaciones;
  const de = (l: Liquidacion, q: Inquilino) => l.inquilinos.find((x) => x.inquilinoId === q.id)!;
  const parteDe = async (facturaId: string, q: Inquilino) =>
    RepartoFactura.parse(await (await pedir(`${base}/facturas/${facturaId}/reparto`, { cookie })).json()).partes.find(
      (p) => p.inquilinoId === q.id,
    )!;
  const panel = async () => Panel.parse(await (await pedir("/panel", { cookie })).json());
  return { cookie, id: i.id, base, a, b, luz, gas, factura, luzOctubre, luzNoviembre, gasOtono, crear, editar, lista, de, parteDe, panel };
}

describe("Spec 011 · Liquidaciones", () => {
  it("C1 y C3 · nombre automático, totales por inquilino y total de la liquidación", async () => {
    const e = await escenario();
    const r = await e.crear([e.luzOctubre, e.luzNoviembre, e.gasOtono]);
    expect(r.status).toBe(201);
    const l = Liquidacion.parse(await r.json());
    expect(l).toMatchObject({ numero: 1, nombre: "Liquidación 1 · septiembre a noviembre de 2026", mes: "2026-12", total: 16_000, sinOcupar: 0 });
    expect(e.de(l, e.a)).toMatchObject({ total: 8_000, pagado: 0, pendiente: 8_000, estado: "pendiente" });
    expect(e.de(l, e.b).total).toBe(8_000);
    // Las facturas quedan en ella, ordenadas por periodo.
    expect(l.facturas.map((f) => f.importeTotal)).toEqual([9_000, 4_000, 3_000]);
  });

  it("el nombre automático sale en el idioma de la app; también se puede dar uno (R2b)", async () => {
    const e = await escenario();
    const en = Liquidacion.parse(await (await e.crear([e.luzOctubre], { idioma: "en" })).json());
    expect(en.nombre).toBe("Settlement 1 · October 2026");
    const propia = Liquidacion.parse(await (await e.crear([e.luzNoviembre], { nombre: "  Otoño  " })).json());
    expect(propia.nombre).toBe("Otoño");
  });

  it("C2 · numeración correlativa que no se reutiliza al borrar", async () => {
    const e = await escenario();
    await e.crear([e.luzOctubre]);
    const segunda = Liquidacion.parse(await (await e.crear([e.luzNoviembre])).json());
    expect(segunda.numero).toBe(2);
    await pedir(`${e.base}/liquidaciones/${segunda.id}`, { metodo: "DELETE", cookie: e.cookie });
    const tercera = Liquidacion.parse(await (await e.crear([e.luzNoviembre])).json());
    expect(tercera.numero).toBe(3);
  });

  it("C4 · una factura no puede estar en dos liquidaciones; ni sin repartir", async () => {
    const e = await escenario();
    await e.crear([e.luzOctubre]);
    expect(await error(await e.crear([e.luzOctubre, e.gasOtono]))).toBe("FACTURA_EN_LIQUIDACION");
    const porRevisar = await e.factura(e.luz.id, "2026-12-01", "2026-12-31", 2_000, false);
    expect(await error(await e.crear([porRevisar]))).toBe("FACTURA_NO_REPARTIDA");
    expect(await error(await e.crear([crypto.randomUUID()]))).toBe("FACTURA_DESCONOCIDA");
  });

  it("C5 · «Marcar pagada» a A: sus tres partes pagadas hoy; B sigue pendiente", async () => {
    const e = await escenario();
    const l = Liquidacion.parse(await (await e.crear([e.luzOctubre, e.luzNoviembre, e.gasOtono])).json());
    const r = ResultadoPagoLiquidacion.parse(
      await (await pedir(`${e.base}/liquidaciones/${l.id}/pagar`, { cuerpo: { inquilinoId: e.a.id }, cookie: e.cookie })).json(),
    );
    expect(r.partes.map((p) => p.pagadoEn)).toEqual(["2026-12-02", "2026-12-02", "2026-12-02"]);
    const [tras] = await e.lista();
    expect(e.de(tras!, e.a).estado).toBe("pagada");
    expect(e.de(tras!, e.b).estado).toBe("pendiente");
  });

  it("C6 · B paga la luz de octubre por separado: parcial, le faltan 60 €", async () => {
    const e = await escenario();
    await e.crear([e.luzOctubre, e.luzNoviembre, e.gasOtono]);
    const parte = await e.parteDe(e.luzOctubre, e.b);
    await pedir(`${e.base}/partes/${parte.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-12-01" }, cookie: e.cookie });
    const [l] = await e.lista();
    expect(e.de(l!, e.b)).toMatchObject({ estado: "parcial", pendiente: 6_000, pagado: 2_000 });
  });

  it("C7 y C8 · en el panel, una línea por liquidación con lo que falta; la factura suelta, aparte", async () => {
    const e = await escenario();
    await e.crear([e.luzOctubre, e.luzNoviembre, e.gasOtono]);
    const luzDiciembre = await e.factura(e.luz.id, "2026-12-01", "2026-12-31", 2_000);
    const deB = (await e.panel()).pendientes[0]!.inquilinos.find((q) => q.inquilinoId === e.b.id)!;
    const linea = deB.conceptos.find((c) => c.tipo === "liquidacion")!;
    expect(linea).toMatchObject({ importe: 8_000, mes: "2026-12", liquidacion: { nombre: "Liquidación 1 · septiembre a noviembre de 2026" } });
    expect(linea.liquidacion!.partes.map((p) => [p.nombreGasto, p.importe]).sort()).toEqual([
      ["Gas", 4_500],
      ["Luz", 1_500],
      ["Luz", 2_000],
    ]);
    // La de diciembre, suelta: su propia línea de gasto.
    expect(deB.conceptos.filter((c) => c.tipo === "gasto").map((c) => [c.nombreGasto, c.importe])).toEqual([["Luz", 1_000]]);
    expect(deB.total).toBe(9_000);
    // En los cobros de diciembre: la liquidación agrupada y la suelta como gasto.
    const mes = CobrosDelMes.parse(await (await pedir(`${e.base}/cobros/mes/2026-12`, { cookie: e.cookie })).json());
    expect(mes.liquidaciones.map((l) => l.numero)).toEqual([1]);
    expect(mes.gastos.map((g) => g.facturaId).every((id) => id === luzDiciembre)).toBe(true);
  });

  it("R11b · «Todo pagado» del mes incluye las partes de la liquidación de ese mes", async () => {
    const e = await escenario();
    await e.crear([e.luzOctubre, e.luzNoviembre]);
    const r = ResultadoPagoTodo.parse(
      await (await pedir(`${e.base}/cobros/pagar-todo`, { cuerpo: { inquilinoId: e.a.id, mes: "2026-12" }, cookie: e.cookie })).json(),
    );
    // Las dos de la liquidación y la del gas, suelta, repartida también en diciembre.
    expect(r.partes.map((p) => p.importe).sort()).toEqual([1_500, 2_000, 4_500]);
  });

  it("C10 · añadir una factura con pagos pide confirmación; el total sube y lo pagado sigue pagado", async () => {
    const e = await escenario();
    const l = Liquidacion.parse(await (await e.crear([e.luzOctubre, e.luzNoviembre])).json());
    await pedir(`${e.base}/liquidaciones/${l.id}/pagar`, { cuerpo: { inquilinoId: e.a.id }, cookie: e.cookie });
    expect(await error(await e.editar(l.id, { anadir: [e.gasOtono] }))).toBe("CONFIRMACION_NECESARIA");
    const tras = Liquidacion.parse(await (await e.editar(l.id, { anadir: [e.gasOtono], confirmar: true })).json());
    expect(e.de(tras, e.a)).toMatchObject({ total: 8_000, pagado: 3_500, estado: "parcial" });
  });

  it("no se queda vacía; quitar una factura la deja suelta", async () => {
    const e = await escenario();
    const l = Liquidacion.parse(await (await e.crear([e.luzOctubre, e.luzNoviembre])).json());
    expect(await error(await e.editar(l.id, { quitar: [e.luzOctubre, e.luzNoviembre] }))).toBe("LIQUIDACION_VACIA");
    const tras = Liquidacion.parse(await (await e.editar(l.id, { quitar: [e.luzOctubre] })).json());
    expect(tras.facturas.map((f) => f.facturaId)).toEqual([e.luzNoviembre]);
    // Ya suelta, puede ir a otra.
    expect((await e.crear([e.luzOctubre])).status).toBe(201);
  });

  it("C11 · borrar la liquidación deja sus facturas sueltas y conserva los pagos", async () => {
    const e = await escenario();
    const l = Liquidacion.parse(await (await e.crear([e.luzOctubre, e.luzNoviembre, e.gasOtono])).json());
    await pedir(`${e.base}/liquidaciones/${l.id}/pagar`, { cuerpo: { inquilinoId: e.a.id }, cookie: e.cookie });
    expect((await pedir(`${e.base}/liquidaciones/${l.id}`, { metodo: "DELETE", cookie: e.cookie })).status).toBe(204);
    expect(await e.lista()).toEqual([]);
    expect((await e.parteDe(e.gasOtono, e.a)).pagadoEn).toBe("2026-12-02");
    // Sueltas otra vez: se pueden agrupar de nuevo.
    expect((await e.crear([e.luzOctubre, e.luzNoviembre, e.gasOtono])).status).toBe(201);
  });

  it("C12 · renombrar: el nombre nuevo sale en el panel", async () => {
    const e = await escenario();
    const l = Liquidacion.parse(await (await e.crear([e.luzOctubre])).json());
    expect(await error(await e.editar(l.id, { nombre: "   " }))).toBe("NOMBRE_OBLIGATORIO");
    await e.editar(l.id, { nombre: "Gastos de otoño" });
    const linea = (await e.panel()).pendientes[0]!.inquilinos[0]!.conceptos.find((c) => c.tipo === "liquidacion")!;
    expect(linea.liquidacion!.nombre).toBe("Gastos de otoño");
  });
});

describe("Aislamiento de las liquidaciones", () => {
  it("otra cuenta no ve, crea, cambia, paga ni borra liquidaciones ajenas", async () => {
    const e = await escenario();
    const l = Liquidacion.parse(await (await e.crear([e.luzOctubre])).json());
    const ajena = await cuenta();
    const intentos = [
      pedir(`${e.base}/liquidaciones`, { cookie: ajena }),
      pedir(`${e.base}/liquidaciones`, { cuerpo: { facturaIds: [e.luzNoviembre] }, cookie: ajena }),
      pedir(`${e.base}/liquidaciones/${l.id}`, { metodo: "PATCH", cuerpo: { nombre: "x" }, cookie: ajena }),
      pedir(`${e.base}/liquidaciones/${l.id}/pagar`, { cuerpo: { inquilinoId: e.a.id }, cookie: ajena }),
      pedir(`${e.base}/liquidaciones/${l.id}`, { metodo: "DELETE", cookie: ajena }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(404);
    // Ni desde su propio inmueble con ids ajenos.
    const otra = await escenario();
    expect((await pedir(`${otra.base}/liquidaciones/${l.id}`, { metodo: "DELETE", cookie: otra.cookie })).status).toBe(404);
    expect(await error(await otra.crear([e.luzNoviembre]))).toBe("FACTURA_DESCONOCIDA");
    expect((await e.lista()).map((x) => x.nombre)).toEqual([l.nombre]);
  });
});
