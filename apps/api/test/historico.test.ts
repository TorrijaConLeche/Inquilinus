// Spec 012 · tarea 6.4b: histórico del inmueble.
import { PGlite } from "@electric-sql/pglite";
import {
  Factura,
  Historico,
  Inmueble,
  Inquilino,
  ListaInquilinos,
  PermisosSubida,
  RepartoFactura,
  ResultadoGeneracion,
  ResultadoSubidaFacturas,
  TipoGasto,
  VERSION_TERMINOS,
} from "@inquilinus/contracts";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { readFileSync } from "node:fs";
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
  const email = `historico${++contador}@ejemplo.test`;
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
 * Piso Centro con Alex y Jorge. En octubre: cobros de los dos; luz de
 * septiembre repartida (Alex 20 €, Jorge 20 €); Alex paga su alquiler y su
 * luz; se edita la renta de Jorge de 400 € a 380 €.
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
      await (await pedir(`${base}/inquilinos`, { cuerpo: { nombre, ocupacion: { habitacionId, entrada: "2026-09-01" } }, cookie })).json(),
    );
  const alex = await alta("Alex", i.habitaciones[0]!.id);
  const jorge = await alta("Jorge", i.habitaciones[1]!.id);
  const luz = TipoGasto.parse(await (await pedir(`${base}/tipos-gasto`, { cuerpo: { nombre: "Luz" }, cookie })).json());

  const cobros = ResultadoGeneracion.parse(await (await pedir(`${base}/cobros/generar`, { cuerpo: { mes: "2026-10" }, cookie })).json()).creados;
  const cobroDe = (q: Inquilino) => cobros.find((c) => c.inquilinoId === q.id)!;

  const p = PermisosSubida.parse(await (await pedir(`${base}/facturas/subidas`, { cuerpo: { cantidad: 1 }, cookie })).json());
  almacen.subir(p.permisos[0]!.campos, PDF);
  const lote = ResultadoSubidaFacturas.parse(
    await (await pedir(`${base}/facturas`, { cuerpo: { subidas: [{ subidaId: p.permisos[0]!.subidaId, nombre: "luz.pdf" }] }, cookie })).json(),
  );
  const facturaId = lote.facturas[0]!.id;
  await pedir(`${base}/facturas/${facturaId}`, {
    metodo: "PATCH",
    cuerpo: { tipoGastoId: luz.id, periodoInicio: "2026-09-01", periodoFin: "2026-09-30", importeTotal: 4_000 },
    cookie,
  });
  Factura.parse(await (await pedir(`${base}/facturas/${facturaId}/confirmar`, { cuerpo: {}, cookie })).json());
  const reparto = RepartoFactura.parse(await (await pedir(`${base}/facturas/${facturaId}/reparto`, { cookie })).json());

  await pedir(`${base}/cobros/${cobroDe(alex).id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-02" }, cookie });
  const parteAlex = reparto.partes.find((x) => x.inquilinoId === alex.id)!;
  await pedir(`${base}/partes/${parteAlex.id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-02" }, cookie });
  await pedir(`${base}/cobros/${cobroDe(jorge).id}`, { metodo: "PATCH", cuerpo: { renta: 38_000 }, cookie });

  const historico = async (consulta = "") => {
    const r = await pedir(`${base}/historico${consulta}`, { cookie });
    expect(r.status).toBe(200);
    return Historico.parse(await r.json());
  };
  return { cookie, base, i, alex, jorge, luz, facturaId, cobroDe, historico };
}

const tipos = (h: Historico) => h.actividades.map((a) => a.tipo);

describe("Spec 012 · histórico del inmueble", () => {
  it("C1 · sin filtros: todas las actividades, de la más reciente a la más antigua, sin resumen", async () => {
    const e = await escenario();
    const h = await e.historico();
    expect(h.resumen).toBeNull();
    // Lo último que se hizo, primero.
    expect(tipos(h).slice(0, 4)).toEqual(["cobro_editado", "parte_pagada", "cobro_pagado", "factura_repartida"]);
    expect(tipos(h)).toEqual(
      expect.arrayContaining(["factura_subida", "cobro_generado", "tipo_gasto_creado", "inquilino_alta", "entrada"]),
    );
    expect(tipos(h).filter((x) => x === "cobro_generado")).toHaveLength(2);
    const instantes = h.actividades.map((a) => a.ocurridaEn);
    expect([...instantes].sort().reverse()).toEqual(instantes);
  });

  it("C2 · por inquilino: solo lo de Alex (y el reparto de la luz, que le afecta)", async () => {
    const e = await escenario();
    const h = await e.historico(`?inquilino=${e.alex.id}`);
    expect(h.actividades.every((a) => a.inquilinoId === e.alex.id || a.tipo === "factura_repartida")).toBe(true);
    expect(tipos(h)).toEqual(expect.arrayContaining(["parte_pagada", "cobro_pagado", "factura_repartida", "cobro_generado", "entrada"]));
    expect(h.actividades.some((a) => a.inquilinoId === e.jorge.id)).toBe(false);
  });

  it("C3 · por tipo de gasto: con Luz, la factura, su reparto y los pagos de luz", async () => {
    const e = await escenario();
    expect(tipos(await e.historico(`?gasto=${e.luz.id}`))).toEqual(["parte_pagada", "factura_repartida"]);
    const alquiler = await e.historico("?gasto=alquiler");
    expect(new Set(tipos(alquiler))).toEqual(new Set(["cobro_editado", "cobro_pagado", "cobro_generado"]));
  });

  it("C4 · Alex + Luz: pagado 20 €, pendiente 0 €; Jorge + Alquiler: pendiente 380 €", async () => {
    const e = await escenario();
    expect((await e.historico(`?inquilino=${e.alex.id}&gasto=${e.luz.id}`)).resumen).toEqual({ pagado: 2_000, pendiente: 0 });
    expect((await e.historico(`?inquilino=${e.jorge.id}&gasto=alquiler`)).resumen).toEqual({ pagado: 0, pendiente: 38_000 });
    // Por estado: lo pendiente de hoy.
    const pendiente = await e.historico("?estado=pendiente");
    expect(pendiente.actividades.every((a) => a.estadoPago === "pendiente")).toBe(true);
    expect(pendiente.resumen).toEqual({ pagado: 2_000, pendiente: 40_000 });
  });

  it("C5 · cambio de importe: renta de octubre de Jorge, 400 € → 380 €", async () => {
    const e = await escenario();
    const editada = (await e.historico("?grupo=alquiler")).actividades.find((a) => a.tipo === "cobro_editado")!;
    expect(editada).toMatchObject({ inquilinoId: e.jorge.id, detalle: { mes: "2026-10", antes: 40_000, despues: 38_000 } });
  });

  it("C6 · solo lectura: no hay forma de editar ni borrar una actividad", async () => {
    const e = await escenario();
    const una = (await e.historico()).actividades[0]!;
    for (const metodo of ["PATCH", "PUT", "DELETE"]) {
      expect((await pedir(`${e.base}/historico/${una.id}`, { metodo, cuerpo: {}, cookie: e.cookie })).status).toBe(404);
      expect((await pedir(`${e.base}/historico`, { metodo, cuerpo: {}, cookie: e.cookie })).status).toBe(404);
    }
  });

  it("C9 · inquilino borrado: sus actividades siguen, como «Inquilino 1», con los mismos importes", async () => {
    const e = await escenario();
    // Jorge se va en septiembre y se borra (con cobros: se anonimiza).
    const lista = async () => ListaInquilinos.parse(await (await pedir(`${e.base}/inquilinos`, { cookie: e.cookie })).json()).inquilinos;
    const jorge = (await lista()).find((q) => q.id === e.jorge.id)!;
    await pedir(`${e.base}/ocupaciones/${jorge.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-10-31" }, cookie: e.cookie });
    expect((await pedir(`${e.base}/inquilinos/${e.jorge.id}`, { metodo: "DELETE", cookie: e.cookie })).status).toBe(200);
    const anonimo = (await lista()).find((q) => q.id === e.jorge.id)!;
    expect(anonimo.nombre).toBe("Inquilino 1");
    const h = await e.historico(`?inquilino=${e.jorge.id}`);
    expect(h.actividades.find((a) => a.tipo === "cobro_editado")!.detalle).toMatchObject({ antes: 40_000, despues: 38_000 });
    expect(tipos(h)).toEqual(expect.arrayContaining(["inquilino_borrado", "salida"]));
    // El histórico no guarda su nombre (R10): solo su id.
    expect(JSON.stringify(h)).not.toContain("Jorge");
  });

  it("R3b · la reconstrucción crea lo anterior a partir de los datos guardados", async () => {
    const e = await escenario();
    // Como si no se hubiera registrado nada: se borra el histórico y se aplica la migración.
    await bd.delete(t.actividad).where(eq(t.actividad.inmuebleId, e.i.id));
    const migracion = readFileSync(new URL("../drizzle/0007_historico_reconstruido.sql", import.meta.url), "utf8");
    for (const sentencia of migracion.split("--> statement-breakpoint")) {
      if (sentencia.trim()) await bd.execute(sql.raw(sentencia));
    }
    const h = await e.historico();
    expect(h.actividades.every((a) => a.detalle.reconstruida)).toBe(true);
    expect(new Set(tipos(h))).toEqual(
      new Set([
        "cobro_generado",
        "cobro_pagado",
        "factura_subida",
        "factura_repartida",
        "parte_pagada",
        "inquilino_alta",
        "entrada",
        "habitacion_creada",
        "tipo_gasto_creado",
      ]),
    );
    expect(h.actividades.find((a) => a.tipo === "cobro_pagado")).toMatchObject({ fecha: "2026-10-02", detalle: { fecha: "2026-10-02" } });
    expect((await e.historico(`?inquilino=${e.alex.id}&gasto=${e.luz.id}`)).resumen).toEqual({ pagado: 2_000, pendiente: 0 });
    // Una segunda vez no duplica: ese inmueble ya tiene su histórico reconstruido... y lo propio, si lo hay, lo protege.
    await pedir(`${e.base}/cobros/${e.cobroDe(e.jorge).id}`, { metodo: "PATCH", cuerpo: { pagadoEn: "2026-10-05" }, cookie: e.cookie });
    const antes = (await e.historico()).actividades.length;
    for (const sentencia of migracion.split("--> statement-breakpoint")) {
      if (sentencia.trim()) await bd.execute(sql.raw(sentencia));
    }
    expect((await e.historico()).actividades).toHaveLength(antes);
  });
});

describe("Aislamiento del histórico", () => {
  it("sin sesión, 401; otra cuenta, 404; filtros no válidos, 400", async () => {
    const e = await escenario();
    expect((await pedir(`${e.base}/historico`)).status).toBe(401);
    expect((await pedir(`${e.base}/historico`, { cookie: await cuenta() })).status).toBe(404);
    expect((await pedir(`${e.base}/historico?estado=raro`, { cookie: e.cookie })).status).toBe(400);
    expect((await pedir(`${e.base}/historico?desde=ayer`, { cookie: e.cookie })).status).toBe(400);
  });
});
