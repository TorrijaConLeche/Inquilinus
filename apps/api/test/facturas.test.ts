// Spec 003 · tareas 5.2 y 5.3: subida múltiple, lectura con IA (simulada), lista por revisar y confirmación.
import { PGlite } from "@electric-sql/pglite";
import {
  Factura,
  Inmueble,
  ListaFacturas,
  PermisosSubida,
  RespuestaSolape,
  ResultadoConfirmacionTodas,
  ResultadoSubidaFacturas,
  TipoGasto,
  VERSION_TERMINOS,
} from "@inquilinus/contracts";
import type { LecturaFactura } from "@inquilinus/domain";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.ts";
import { crearAuth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import type { Correo } from "../src/correo/enviador.ts";
import { leerConLimite, type ExtractorFacturas } from "../src/extractor.ts";
import { crearRegistro } from "../src/registro.ts";
import { crearAlmacenMemoria } from "./almacen-memoria.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";
const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.7\n${texto}\n%%EOF`);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** Extractor simulado: lee lo que dice el PDF y apunta con qué lo llamaron (R10). */
const llamadas: { pdf: string; tipos: string[] }[] = [];
const lecturas: Record<string, LecturaFactura | "error"> = {
  "luz-septiembre": { inicio: "2026-09-01", fin: "2026-09-30", importe: 8745, tipoGasto: "Luz" },
  "luz-octubre": { inicio: "2026-10-01", fin: "2026-10-31", importe: 9120, tipoGasto: "luz" },
  "luz-noviembre": { inicio: "2026-11-01", fin: "2026-11-30", importe: 10_050, tipoGasto: "Luz" },
  "gas-otono": { inicio: "2026-09-01", fin: "2026-11-30", importe: 15_000, tipoGasto: "Gas" },
  "sin-periodo": { importe: 4_200, tipoGasto: "Luz" },
  agua: { inicio: "2026-09-01", fin: "2026-10-31", importe: 3_300, tipoGasto: "Agua" },
  rota: "error",
};
const extractor: ExtractorFacturas = {
  async leer(contenido, tipos) {
    const texto = new TextDecoder().decode(contenido).split("\n")[1]!;
    llamadas.push({ pdf: texto, tipos });
    const lectura = lecturas[texto];
    if (lectura === "error" || !lectura) throw new Error("La IA no responde");
    return lectura;
  },
};

let conIa: ReturnType<typeof crearApp>;
let sinIa: ReturnType<typeof crearApp>;
let sinAlmacen: ReturnType<typeof crearApp>;
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
  const ahora = () => new Date("2026-11-15T12:00:00Z");
  conIa = crearApp({ auth, bd, registro, almacen, extractor, ahora }, { rutaBase: "/api" });
  sinIa = crearApp({ auth, bd, registro, almacen, ahora }, { rutaBase: "/api" });
  sinAlmacen = crearApp({ auth, bd, registro, ahora }, { rutaBase: "/api" });
}, 30_000);

type Opciones = { metodo?: string; cuerpo?: unknown; cookie?: string; origen?: string; app?: ReturnType<typeof crearApp> };

function pedir(ruta: string, { metodo, cuerpo, cookie, origen, app = conIa }: Opciones = {}) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: { origin: origen ?? URL_BASE, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

let contador = 0;
async function cuenta() {
  const email = `facturas${++contador}@ejemplo.test`;
  await pedir("/auth/sign-up/email", { cuerpo: { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS } });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await conIa.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Inmueble con los tipos de gasto «Luz» y «Gas». */
async function escenario() {
  const cookie = await cuenta();
  const i = Inmueble.parse(
    await (
      await pedir("/inmuebles", {
        cuerpo: { nombre: "Piso Centro", modalidad: "habitaciones", habitaciones: [{ nombre: "H1", precioMensual: 50_000 }] },
        cookie,
      })
    ).json(),
  );
  const tipo = async (nombre: string) =>
    TipoGasto.parse(await (await pedir(`/inmuebles/${i.id}/tipos-gasto`, { cuerpo: { nombre }, cookie })).json());
  const luz = await tipo("Luz");
  const gas = await tipo("Gas");
  const base = `/inmuebles/${i.id}/facturas`;

  /** Lo que hace el navegador: pide permisos, sube cada fichero y registra el lote. */
  const subir = async (ficheros: { nombre: string; contenido: Uint8Array }[], app = conIa) => {
    const p = await pedir(`${base}/subidas`, { cuerpo: { cantidad: ficheros.length }, cookie, app });
    expect(p.status).toBe(201);
    const { permisos } = PermisosSubida.parse(await p.json());
    ficheros.forEach((f, n) => almacen.subir(permisos[n]!.campos, f.contenido));
    const r = await pedir(base, {
      cuerpo: { subidas: ficheros.map((f, n) => ({ subidaId: permisos[n]!.subidaId, nombre: f.nombre })) },
      cookie,
      app,
    });
    expect(r.status).toBe(201);
    return ResultadoSubidaFacturas.parse(await r.json());
  };
  const porRevisar = async () => ListaFacturas.parse(await (await pedir(`${base}?porRevisar=true`, { cookie })).json()).facturas;
  return { cookie, id: i.id, base, luz, gas, subir, porRevisar };
}

const porNombre = <T extends { nombreFichero: string }>(facturas: T[], nombre: string) => facturas.find((f) => f.nombreFichero === nombre)!;

describe("Spec 003 · Lectura con IA (simulada)", () => {
  it("C1 · extracción completa: propuesta con periodo, importe y tipo", async () => {
    const e = await escenario();
    const { facturas } = await e.subir([{ nombre: "luz.pdf", contenido: pdf("luz-septiembre") }]);
    expect(facturas[0]).toMatchObject({
      estado: "propuesta",
      periodoInicio: "2026-09-01",
      periodoFin: "2026-09-30",
      importeTotal: 8745,
      tipoGastoId: e.luz.id,
      propuestaIa: { inicio: "2026-09-01", fin: "2026-09-30", importe: 8745, tipoGastoId: e.luz.id },
    });
  });

  it("C2 · lo que la IA no encuentra se queda vacío", async () => {
    const e = await escenario();
    const { facturas } = await e.subir([{ nombre: "sin-periodo.pdf", contenido: pdf("sin-periodo") }]);
    expect(facturas[0]).toMatchObject({ estado: "propuesta", periodoInicio: null, periodoFin: null, importeTotal: 4_200 });
  });

  it("C3 y C4 · un fichero que no es PDF o pasa de 10 MB se rechaza antes de llamar a la IA", async () => {
    const e = await escenario();
    const grande = new Uint8Array(12 * 1024 * 1024);
    grande.set(pdf("luz-septiembre"));
    llamadas.length = 0;
    const r = await e.subir([
      { nombre: "foto.jpg", contenido: JPG },
      { nombre: "enorme.pdf", contenido: grande },
    ]);
    expect(r.facturas).toEqual([]);
    expect(r.rechazadas.sort((a, b) => a.nombre.localeCompare(b.nombre))).toEqual([
      { nombre: "enorme.pdf", error: "FICHERO_INVALIDO" },
      { nombre: "foto.jpg", error: "FICHERO_INVALIDO" },
    ]);
    expect(llamadas).toEqual([]);
    expect(await e.porRevisar()).toEqual([]);
  });

  it("C10 · si la IA falla, la factura queda para rellenar a mano y el PDF se conserva", async () => {
    const e = await escenario();
    const { facturas } = await e.subir([{ nombre: "rota.pdf", contenido: pdf("rota") }]);
    expect(facturas[0]).toMatchObject({ estado: "error_extraccion", importeTotal: null, propuestaIa: null });
    const [fichero] = await bd.select().from(t.fichero).where(eq(t.fichero.nombreOriginal, "rota.pdf"));
    expect(almacen.objetos.has(fichero!.claveS3)).toBe(true);
  });

  it("si la IA tarda más del límite, falla como cualquier otro error (R8)", async () => {
    const lento: ExtractorFacturas = { leer: () => new Promise(() => {}) };
    await expect(leerConLimite(lento, pdf("x"), [], 20)).rejects.toThrow("LECTURA_LENTA");
  });

  it("C12 · subida múltiple: cada factura con su propuesta, en el mismo lote", async () => {
    const e = await escenario();
    const r = await e.subir([
      { nombre: "luz-octubre.pdf", contenido: pdf("luz-octubre") },
      { nombre: "luz-noviembre.pdf", contenido: pdf("luz-noviembre") },
      { nombre: "gas.pdf", contenido: pdf("gas-otono") },
    ]);
    expect(r.facturas).toHaveLength(3);
    expect(new Set(r.facturas.map((f) => f.lote))).toEqual(new Set([r.lote]));
    expect(porNombre(r.facturas, "luz-octubre.pdf")).toMatchObject({ importeTotal: 9120, tipoGastoId: e.luz.id });
    expect(porNombre(r.facturas, "luz-noviembre.pdf")).toMatchObject({ importeTotal: 10_050, tipoGastoId: e.luz.id });
    expect(porNombre(r.facturas, "gas.pdf")).toMatchObject({ periodoInicio: "2026-09-01", periodoFin: "2026-11-30", tipoGastoId: e.gas.id });
    expect(await e.porRevisar()).toHaveLength(3);
  });

  it("C13 y C14 · el tipo sugerido sale de los del inmueble; si no encaja ninguno, vacío", async () => {
    const e = await escenario();
    const r = await e.subir([
      { nombre: "luz.pdf", contenido: pdf("luz-octubre") },
      { nombre: "agua.pdf", contenido: pdf("agua") },
    ]);
    expect(porNombre(r.facturas, "luz.pdf").tipoGastoId).toBe(e.luz.id);
    expect(porNombre(r.facturas, "agua.pdf")).toMatchObject({ tipoGastoId: null, importeTotal: 3_300 });
  });

  it("R10 · a la IA solo le llega el PDF y los nombres de los tipos de gasto", async () => {
    const e = await escenario();
    llamadas.length = 0;
    await e.subir([{ nombre: "Factura de Ana López.pdf", contenido: pdf("luz-octubre") }]);
    expect(llamadas).toEqual([{ pdf: "luz-octubre", tipos: ["Luz", "Gas"] }]);
    expect(JSON.stringify(llamadas)).not.toContain(e.id);
  });

  it("C15 · un fichero no válido en un lote no afecta al resto", async () => {
    const e = await escenario();
    const r = await e.subir([
      { nombre: "a.pdf", contenido: pdf("luz-septiembre") },
      { nombre: "b.pdf", contenido: pdf("luz-octubre") },
      { nombre: "c.pdf", contenido: pdf("gas-otono") },
      { nombre: "foto.jpg", contenido: JPG },
    ]);
    expect(r.facturas.map((f) => f.nombreFichero).sort()).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
    expect(r.rechazadas).toEqual([{ nombre: "foto.jpg", error: "FICHERO_INVALIDO" }]);
  });

  it("C16 · más de 20 PDF se rechaza entero antes de nada", async () => {
    const e = await escenario();
    const permisos = await pedir(`${e.base}/subidas`, { cuerpo: { cantidad: 21 }, cookie: e.cookie });
    expect(permisos.status).toBe(400);
    expect(await permisos.json()).toEqual({ error: "DEMASIADAS_FACTURAS" });
    const subidas = Array.from({ length: 21 }, () => ({ subidaId: crypto.randomUUID(), nombre: "x.pdf" }));
    const registro = await pedir(e.base, { cuerpo: { subidas }, cookie: e.cookie });
    expect(await registro.json()).toEqual({ error: "DEMASIADAS_FACTURAS" });
  });
});

describe("Spec 003 · Sin IA y descartar (R8b, R16)", () => {
  it("C20 · sin IA activada, las facturas quedan subidas y vacías para rellenar a mano", async () => {
    const e = await escenario();
    llamadas.length = 0;
    const r = await e.subir(
      [
        { nombre: "luz.pdf", contenido: pdf("luz-septiembre") },
        { nombre: "gas.pdf", contenido: pdf("gas-otono") },
      ],
      sinIa,
    );
    expect(r.facturas.map((f) => [f.estado, f.tipoGastoId, f.periodoInicio, f.importeTotal, f.propuestaIa])).toEqual([
      ["subida", null, null, null, null],
      ["subida", null, null, null, null],
    ]);
    expect(llamadas).toEqual([]);
    expect(await e.porRevisar()).toHaveLength(2);
  });

  it("C21 · descartar quita la factura y su PDF; una confirmada no se descarta", async () => {
    const e = await escenario();
    const { facturas } = await e.subir([
      { nombre: "mala.pdf", contenido: pdf("luz-septiembre") },
      { nombre: "buena.pdf", contenido: pdf("luz-octubre") },
    ]);
    const mala = porNombre(facturas, "mala.pdf");
    const [fichero] = await bd.select().from(t.fichero).where(eq(t.fichero.nombreOriginal, "mala.pdf"));
    expect((await pedir(`${e.base}/${mala.id}`, { metodo: "DELETE", cookie: e.cookie })).status).toBe(204);
    expect(almacen.objetos.has(fichero!.claveS3)).toBe(false);
    expect(await bd.select().from(t.fichero).where(eq(t.fichero.id, fichero!.id))).toEqual([]);
    expect((await e.porRevisar()).map((f) => f.nombreFichero)).toEqual(["buena.pdf"]);

    const buena = porNombre(facturas, "buena.pdf");
    await bd.update(t.factura).set({ estado: "confirmada" }).where(eq(t.factura.id, buena.id));
    const r = await pedir(`${e.base}/${buena.id}`, { metodo: "DELETE", cookie: e.cookie });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "FACTURA_CONFIRMADA" });
  });

  it("ver el PDF redirige a una URL firmada de 5 minutos", async () => {
    const e = await escenario();
    const { facturas } = await e.subir([{ nombre: "luz.pdf", contenido: pdf("luz-septiembre") }]);
    const r = await pedir(`${e.base}/${facturas[0]!.id}/pdf`, { cookie: e.cookie });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/^https:\/\/bucket\.ejemplo\.test\/facturas\/.+\.pdf\?caduca=300$/);
  });

  it("borrar el inmueble se lleva sus facturas y sus PDF", async () => {
    const e = await escenario();
    await e.subir([{ nombre: "luz.pdf", contenido: pdf("luz-septiembre") }]);
    const [fichero] = (await bd.select().from(t.fichero).where(eq(t.fichero.nombreOriginal, "luz.pdf"))).slice(-1);
    expect((await pedir(`/inmuebles/${e.id}`, { metodo: "DELETE", cuerpo: { nombre: "Piso Centro" }, cookie: e.cookie })).status).toBe(204);
    expect(await bd.select().from(t.factura).where(eq(t.factura.inmuebleId, e.id))).toEqual([]);
    expect(almacen.objetos.has(fichero!.claveS3)).toBe(false);
  });
});

describe("Aislamiento y seguridad", () => {
  it("otra cuenta no ve, sube, descarga ni descarta facturas ajenas", async () => {
    const e = await escenario();
    const { facturas } = await e.subir([{ nombre: "luz.pdf", contenido: pdf("luz-septiembre") }]);
    const ajena = await cuenta();
    const intentos = [
      pedir(e.base, { cookie: ajena }),
      pedir(`${e.base}/subidas`, { cuerpo: { cantidad: 1 }, cookie: ajena }),
      pedir(e.base, { cuerpo: { subidas: [{ subidaId: crypto.randomUUID(), nombre: "x.pdf" }] }, cookie: ajena }),
      pedir(`${e.base}/${facturas[0]!.id}/pdf`, { cookie: ajena }),
      pedir(`${e.base}/${facturas[0]!.id}`, { metodo: "DELETE", cookie: ajena }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(404);
    // Tampoco desde su propio inmueble con el id de una factura ajena.
    const suyo = await escenario();
    expect((await pedir(`${suyo.base}/${facturas[0]!.id}`, { metodo: "DELETE", cookie: suyo.cookie })).status).toBe(404);
    expect(await e.porRevisar()).toHaveLength(1);
  });

  it("sin sesión, 401; desde otra web, 403; sin bucket, 503", async () => {
    const e = await escenario();
    expect((await pedir(e.base)).status).toBe(401);
    expect((await pedir(`${e.base}/subidas`, { cuerpo: { cantidad: 1 }, cookie: e.cookie, origen: "https://malvada.ejemplo" })).status).toBe(403);
    expect((await pedir(`${e.base}/subidas`, { cuerpo: { cantidad: 1 }, cookie: e.cookie, app: sinAlmacen })).status).toBe(503);
  });
});

describe("Spec 003 · Revisión y confirmación (R5, R6, R9, R13, R14)", () => {
  /** Sube a mano (sin IA) y rellena cada factura con lo indicado. */
  const conFacturas = async (datos: { nombre: string; tipo?: "luz" | "gas"; inicio?: string; fin?: string; importe?: number }[]) => {
    const e = await escenario();
    const { facturas } = await e.subir(
      datos.map((d) => ({ nombre: d.nombre, contenido: pdf(d.nombre) })),
      sinIa,
    );
    const ids: Record<string, string> = {};
    for (const d of datos) {
      const f = porNombre(facturas, d.nombre);
      ids[d.nombre] = f.id;
      await pedir(`${e.base}/${f.id}`, {
        metodo: "PATCH",
        cuerpo: {
          ...(d.tipo && { tipoGastoId: d.tipo === "luz" ? e.luz.id : e.gas.id }),
          ...(d.inicio && { periodoInicio: d.inicio }),
          ...(d.fin && { periodoFin: d.fin }),
          ...(d.importe && { importeTotal: d.importe }),
        },
        cookie: e.cookie,
      });
    }
    const confirmar = (nombre: string, continuarConSolapes?: boolean) =>
      pedir(`${e.base}/${ids[nombre]}/confirmar`, {
        cuerpo: continuarConSolapes === undefined ? {} : { continuarConSolapes },
        cookie: e.cookie,
      });
    return { ...e, ids, confirmar };
  };

  it("C9 · la usuaria corrige lo propuesto: se confirma su valor y se guarda la propuesta original (R5, R7)", async () => {
    const e = await escenario();
    const { facturas } = await e.subir([{ nombre: "luz.pdf", contenido: pdf("luz-septiembre") }]);
    const id = facturas[0]!.id;
    await pedir(`${e.base}/${id}`, { metodo: "PATCH", cuerpo: { importeTotal: 7_845 }, cookie: e.cookie });
    const r = await pedir(`${e.base}/${id}/confirmar`, { cuerpo: {}, cookie: e.cookie });
    expect(Factura.parse(await r.json())).toMatchObject({ estado: "confirmada", importeTotal: 7_845, propuestaIa: { importe: 8_745 } });
    expect(await e.porRevisar()).toEqual([]);
  });

  it("C2 · sin periodo no se confirma; C11 · un periodo al revés no se acepta (R4, R9)", async () => {
    const e = await conFacturas([{ nombre: "luz.pdf", tipo: "luz", importe: 5_000 }]);
    const sinPeriodo = await e.confirmar("luz.pdf");
    expect(sinPeriodo.status).toBe(400);
    expect(await sinPeriodo.json()).toEqual({ error: "CAMPO_OBLIGATORIO" });
    const alReves = await pedir(`${e.base}/${e.ids["luz.pdf"]}`, {
      metodo: "PATCH",
      cuerpo: { periodoInicio: "2026-09-01", periodoFin: "2026-08-31" },
      cookie: e.cookie,
    });
    expect(await alReves.json()).toEqual({ error: "PERIODO_INVALIDO" });
    const inexistente = await pedir(`${e.base}/${e.ids["luz.pdf"]}`, { metodo: "PATCH", cuerpo: { periodoFin: "2026-02-30" }, cookie: e.cookie });
    expect(await inexistente.json()).toEqual({ error: "FECHA_INVALIDA" });
  });

  it("C5 · un duplicado exacto avisa con la factura existente; si se continúa, se guarda", async () => {
    const e = await conFacturas([
      { nombre: "luz-1.pdf", tipo: "luz", inicio: "2026-09-01", fin: "2026-09-30", importe: 8_745 },
      { nombre: "luz-2.pdf", tipo: "luz", inicio: "2026-09-01", fin: "2026-09-30", importe: 8_745 },
    ]);
    // Las dos son del mismo lote, así que ya la primera avisa (R14); se continúa.
    expect((await e.confirmar("luz-1.pdf", true)).status).toBe(200);
    const aviso = await e.confirmar("luz-2.pdf");
    expect(aviso.status).toBe(409);
    const { solapadas } = RespuestaSolape.parse(await aviso.json());
    expect(solapadas.map((s) => [s.nombreFichero, s.estado])).toEqual([["luz-1.pdf", "confirmada"]]);
    expect((await e.confirmar("luz-2.pdf", true)).status).toBe(200);
  });

  it("C6, C7 y C8 · solape parcial avisa; periodos contiguos u otro tipo, no", async () => {
    const e = await conFacturas([
      { nombre: "agosto.pdf", tipo: "luz", inicio: "2026-08-01", fin: "2026-09-15", importe: 9_000 },
      { nombre: "parcial.pdf", tipo: "luz", inicio: "2026-09-10", fin: "2026-10-10", importe: 9_000 },
      { nombre: "contigua.pdf", tipo: "luz", inicio: "2026-09-16", fin: "2026-10-15", importe: 9_000 },
      { nombre: "gas.pdf", tipo: "gas", inicio: "2026-08-01", fin: "2026-09-15", importe: 9_000 },
    ]);
    // La parcial se solapa con la de agosto y con la contigua (las tres del mismo lote).
    const parcial = RespuestaSolape.parse(await (await e.confirmar("parcial.pdf")).json());
    expect(parcial.solapadas.map((s) => s.nombreFichero).sort()).toEqual(["agosto.pdf", "contigua.pdf"]);
    await pedir(`${e.base}/${e.ids["parcial.pdf"]}`, { metodo: "DELETE", cookie: e.cookie });
    // Sin la parcial: agosto y la contigua no se tocan (C7) y el gas es otro tipo (C8).
    expect((await e.confirmar("agosto.pdf")).status).toBe(200);
    expect((await e.confirmar("contigua.pdf")).status).toBe(200);
    expect((await e.confirmar("gas.pdf")).status).toBe(200);
  });

  it("C18 · la misma factura dos veces en un lote avisa entre ambas (R14)", async () => {
    const e = await conFacturas([
      { nombre: "octubre-a.pdf", tipo: "luz", inicio: "2026-10-01", fin: "2026-10-31", importe: 9_120 },
      { nombre: "octubre-b.pdf", tipo: "luz", inicio: "2026-10-01", fin: "2026-10-31", importe: 9_120 },
    ]);
    const aviso = RespuestaSolape.parse(await (await e.confirmar("octubre-a.pdf")).json());
    expect(aviso.solapadas.map((s) => s.nombreFichero)).toEqual(["octubre-b.pdf"]);
  });

  it("C17 · «Confirmar todas» confirma las completas y deja las incompletas y las que se solapan (R13, R14b)", async () => {
    const e = await conFacturas([
      { nombre: "luz-sep.pdf", tipo: "luz", inicio: "2026-09-01", fin: "2026-09-30", importe: 8_745 },
      { nombre: "gas.pdf", tipo: "gas", inicio: "2026-09-01", fin: "2026-11-30", importe: 15_000 },
      { nombre: "sin-importe.pdf", tipo: "luz", inicio: "2026-10-01", fin: "2026-10-31" },
    ]);
    const r = ResultadoConfirmacionTodas.parse(await (await pedir(`${e.base}/confirmar-todas`, { cuerpo: {}, cookie: e.cookie })).json());
    expect(r.confirmadas.map((f) => f.nombreFichero).sort()).toEqual(["gas.pdf", "luz-sep.pdf"]);
    expect(r.pendientes).toEqual([{ id: e.ids["sin-importe.pdf"], motivo: "incompleta", solapadas: [] }]);
    expect((await e.porRevisar()).map((f) => f.nombreFichero)).toEqual(["sin-importe.pdf"]);

    const dobles = await conFacturas([
      { nombre: "a.pdf", tipo: "luz", inicio: "2026-10-01", fin: "2026-10-31", importe: 9_120 },
      { nombre: "b.pdf", tipo: "luz", inicio: "2026-10-01", fin: "2026-10-31", importe: 9_120 },
    ]);
    const conSolape = ResultadoConfirmacionTodas.parse(
      await (await pedir(`${dobles.base}/confirmar-todas`, { cuerpo: {}, cookie: dobles.cookie })).json(),
    );
    expect(conSolape.confirmadas).toEqual([]);
    expect(conSolape.pendientes.map((p) => p.motivo)).toEqual(["solape", "solape"]);
  });

  it("no se edita ni se confirma otra vez una factura ya confirmada, ni con un tipo de otro inmueble", async () => {
    const e = await conFacturas([{ nombre: "luz.pdf", tipo: "luz", inicio: "2026-09-01", fin: "2026-09-30", importe: 5_000 }]);
    const otro = await escenario();
    const ajeno = await pedir(`${e.base}/${e.ids["luz.pdf"]}`, { metodo: "PATCH", cuerpo: { tipoGastoId: otro.luz.id }, cookie: e.cookie });
    expect(await ajeno.json()).toEqual({ error: "TIPO_GASTO_DESCONOCIDO" });
    await e.confirmar("luz.pdf");
    const editar = await pedir(`${e.base}/${e.ids["luz.pdf"]}`, { metodo: "PATCH", cuerpo: { importeTotal: 1 }, cookie: e.cookie });
    expect(await editar.json()).toEqual({ error: "FACTURA_CONFIRMADA" });
    expect(await (await e.confirmar("luz.pdf")).json()).toEqual({ error: "FACTURA_CONFIRMADA" });
  });

  it("aislamiento: otra cuenta no edita ni confirma facturas ajenas", async () => {
    const e = await conFacturas([{ nombre: "luz.pdf", tipo: "luz", inicio: "2026-09-01", fin: "2026-09-30", importe: 5_000 }]);
    const ajena = await cuenta();
    const intentos = [
      pedir(`${e.base}/${e.ids["luz.pdf"]}`, { metodo: "PATCH", cuerpo: { importeTotal: 1 }, cookie: ajena }),
      pedir(`${e.base}/${e.ids["luz.pdf"]}/confirmar`, { cuerpo: {}, cookie: ajena }),
      pedir(`${e.base}/confirmar-todas`, { cuerpo: {}, cookie: ajena }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(404);
    const suyo = await escenario();
    expect((await pedir(`${suyo.base}/${e.ids["luz.pdf"]}/confirmar`, { cuerpo: {}, cookie: suyo.cookie })).status).toBe(404);
    expect((await e.porRevisar())[0]).toMatchObject({ estado: "subida", importeTotal: 5_000 });
  });
});
