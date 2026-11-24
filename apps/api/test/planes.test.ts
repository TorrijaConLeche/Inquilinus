// Spec 010 · Límites del plan en la API: alta de inmuebles, lecturas con IA y Advanced de cortesía.
import { PGlite } from "@electric-sql/pglite";
import {
  Inmueble,
  PermisosSubida,
  RespuestaLimiteInmuebles,
  ResultadoSubidaFacturas,
  VERSION_TERMINOS,
} from "@inquilinus/contracts";
import { leerCortesias, type Cortesias, type LecturaFactura } from "@inquilinus/domain";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.ts";
import { crearAuth, type Auth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import { dependenciasDesdeEntorno } from "../src/configuracion.ts";
import type { Correo } from "../src/correo/enviador.ts";
import type { ExtractorFacturas } from "../src/extractor.ts";
import { crearRegistro } from "../src/registro.ts";
import { crearAlmacenMemoria } from "./almacen-memoria.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";
const AHORA = new Date("2026-11-15T12:00:00Z");
const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.7\n${texto}\n%%EOF`);

/** Extractor simulado: «luz» se lee bien; «rota» falla. */
const llamadas: string[] = [];
const extractor: ExtractorFacturas = {
  async leer(contenido) {
    const texto = new TextDecoder().decode(contenido).split("\n")[1]!;
    llamadas.push(texto);
    if (texto === "rota") throw new Error("La IA no responde");
    return { inicio: "2026-10-01", fin: "2026-10-31", importe: 5_000, tipoGasto: "Luz" } satisfies LecturaFactura;
  },
};

let bd: ReturnType<typeof drizzle<typeof t>>;
let auth: Auth;
const registro = crearRegistro(() => {});
const almacen = crearAlmacenMemoria();
const enviados: Correo[] = [];

beforeAll(async () => {
  bd = drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  auth = crearAuth({
    bd,
    correo: { enviar: async (c) => void enviados.push(c) },
    registro,
    secreto: "secreto-de-pruebas-con-mas-de-32-caracteres",
    urlBase: URL_BASE,
    rutaBase: "/api/auth",
  });
}, 30_000);

type App = ReturnType<typeof crearApp>;
const appCon = (cortesias: Cortesias = new Map(), ahora = AHORA): App =>
  crearApp({ auth, bd, registro, almacen, extractor, cortesias, ahora: () => ahora }, { rutaBase: "/api" });

function pedir(app: App, ruta: string, cuerpo: unknown, cookie: string) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: "POST",
    headers: { origin: URL_BASE, "content-type": "application/json", cookie },
    body: JSON.stringify(cuerpo),
  });
}

let contador = 0;
/** Cuenta nueva con la sesión iniciada. */
async function cuenta(prefijo = "planes") {
  const app = appCon();
  const email = `${prefijo}${++contador}@ejemplo.test`;
  await pedir(app, "/auth/sign-up/email", { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS }, "");
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir(app, "/auth/sign-in/email", { email, password: CONTRASENA }, "");
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const [usuario] = await bd.select({ id: t.usuario.id }).from(t.usuario).where(eq(t.usuario.email, email));
  return { email, cookie, usuarioId: usuario!.id };
}

const ALTA = { nombre: "Piso", modalidad: "entero", habitaciones: [{ nombre: "Todo", precioMensual: 80_000 }] };
const altaInmueble = (app: App, cookie: string) => pedir(app, "/inmuebles", ALTA, cookie);

async function pagado(usuarioId: string, plan: "advanced", estado = "active") {
  await bd.insert(t.suscripcion).values({ usuarioId, plan, periodicidad: "mensual", estado });
}

async function leidasEsteMes(usuarioId: string, mes = "2026-11") {
  const [fila] = await bd
    .select({ n: t.usoIa.facturasLeidas })
    .from(t.usoIa)
    .where(and(eq(t.usoIa.usuarioId, usuarioId), eq(t.usoIa.mes, mes)));
  return fila?.n ?? 0;
}

/** Lo que hace el navegador: pide permisos, sube cada PDF y registra el lote. */
async function subir(app: App, cookie: string, inmuebleId: string, textos: string[]) {
  const base = `/inmuebles/${inmuebleId}/facturas`;
  const p = await pedir(app, `${base}/subidas`, { cantidad: textos.length }, cookie);
  const { permisos } = PermisosSubida.parse(await p.json());
  // Cada PDF distinto (la línea extra), aunque se lea igual.
  textos.forEach((texto, n) => almacen.subir(permisos[n]!.campos, pdf(`${texto}\n${n}`)));
  const r = await pedir(
    app,
    base,
    { subidas: textos.map((_, n) => ({ subidaId: permisos[n]!.subidaId, nombre: `${n + 1}.pdf` })) },
    cookie,
  );
  expect(r.status).toBe(201);
  return ResultadoSubidaFacturas.parse(await r.json());
}

async function conInmueble(app = appCon()) {
  const c = await cuenta();
  const i = Inmueble.parse(await (await altaInmueble(app, c.cookie)).json());
  return { ...c, inmuebleId: i.id };
}

describe("Spec 010 · Límite de inmuebles (R1)", () => {
  it("C1 · segundo inmueble en Starter", async () => {
    const app = appCon();
    const { cookie } = await cuenta();
    expect((await altaInmueble(app, cookie)).status).toBe(201);
    const r = await altaInmueble(app, cookie);
    expect(r.status).toBe(403);
    expect(RespuestaLimiteInmuebles.parse(await r.json())).toEqual({
      error: "LIMITE_INMUEBLES",
      plan: "starter",
      limite: 1,
      siguiente: "subir_de_plan",
      planes: ["plus", "advanced"],
    });
  });

  it("C2 · undécimo inmueble en Advanced", async () => {
    const app = appCon();
    const { cookie, usuarioId } = await cuenta();
    await pagado(usuarioId, "advanced");
    for (let n = 0; n < 10; n++) expect((await altaInmueble(app, cookie)).status).toBe(201);
    const r = await altaInmueble(app, cookie);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ plan: "advanced", limite: 10, siguiente: "contactar_soporte", planes: [] });
  });

  it("los archivados no cuentan", async () => {
    const app = appCon();
    const { cookie, usuarioId } = await cuenta();
    await altaInmueble(app, cookie);
    await bd.update(t.inmueble).set({ archivado: true }).where(eq(t.inmueble.usuarioId, usuarioId));
    expect((await altaInmueble(app, cookie)).status).toBe(201);
  });

  it("una suscripción que ya no está en vigor no cuenta: Starter", async () => {
    const app = appCon();
    const { cookie, usuarioId } = await cuenta();
    await pagado(usuarioId, "advanced", "canceled");
    await altaInmueble(app, cookie);
    expect((await altaInmueble(app, cookie)).status).toBe(403);
  });

  it("aislamiento (spec 008, R13): los inmuebles de otra cuenta no cuentan", async () => {
    const app = appCon();
    const a = await cuenta();
    const b = await cuenta();
    expect((await altaInmueble(app, a.cookie)).status).toBe(201);
    expect((await altaInmueble(app, b.cookie)).status).toBe(201);
    expect((await altaInmueble(app, a.cookie)).status).toBe(403);
  });
});

describe("Spec 010 · Advanced de cortesía (R15)", () => {
  it("C22 · cortesía sin fecha, con el email en mayúsculas", async () => {
    const { email, cookie } = await cuenta("cortesia");
    const app = appCon(leerCortesias(` ${email.toUpperCase()} `).cortesias);
    for (let n = 0; n < 10; n++) expect((await altaInmueble(app, cookie)).status).toBe(201);
    expect(await (await altaInmueble(app, cookie)).json()).toMatchObject({ plan: "advanced", siguiente: "contactar_soporte" });
  });

  it("C23 · el último día de la cortesía sigue en Advanced; al día siguiente, Starter", async () => {
    const { email, cookie } = await cuenta("cortesia");
    const { cortesias } = leerCortesias(`${email}:2026-11-15`);
    // 15 de noviembre a las 23:59 en Madrid (22:59 UTC).
    const ultimoDia = appCon(cortesias, new Date("2026-11-15T22:59:00Z"));
    expect((await altaInmueble(ultimoDia, cookie)).status).toBe(201);
    expect((await altaInmueble(ultimoDia, cookie)).status).toBe(201);
    const despues = appCon(cortesias, new Date("2026-11-15T23:00:00Z"));
    expect(await (await altaInmueble(despues, cookie)).json()).toMatchObject({ plan: "starter" });
  });

  it("C24 · cortesía y suscripción a la vez: gana Advanced", async () => {
    const { email, cookie, usuarioId } = await cuenta("cortesia");
    await pagado(usuarioId, "advanced");
    const app = appCon(leerCortesias(`${email}:2026-01-01`).cortesias);
    for (let n = 0; n < 10; n++) expect((await altaInmueble(app, cookie)).status).toBe(201);
  });

  it("C25 · una entrada mal escrita se ignora y el registro avisa sin el email", () => {
    const lineas: string[] = [];
    const d = dependenciasDesdeEntorno(
      { DATABASE_URL: "postgresql://u:c@ejemplo.test/bd", PLAN_CORTESIA: "ana@ejemplo.es:2027-02-30,rosa@ejemplo.es" },
      { rutaBase: "/api", urlPorDefecto: URL_BASE, registro: crearRegistro((_n, l) => lineas.push(l)) },
    );
    expect([...d.cortesias!.keys()]).toEqual(["rosa@ejemplo.es"]);
    expect(lineas.join()).toContain("plan_cortesia_erronea");
    expect(lineas.join()).not.toContain("ana@");
  });
});

describe("Spec 010 · Lecturas con IA del mes (R2, R3)", () => {
  it("C3 · sexta factura por IA en Starter: no se llama a la IA y se rellena a mano", async () => {
    const app = appCon();
    const { cookie, usuarioId, inmuebleId } = await conInmueble(app);
    await bd.insert(t.usoIa).values({ usuarioId, mes: "2026-11", facturasLeidas: 5 });
    llamadas.length = 0;
    const r = await subir(app, cookie, inmuebleId, ["luz"]);
    expect(llamadas).toEqual([]);
    expect(r.facturas.map((f) => f.estado)).toEqual(["subida"]);
    expect(r.sinIaPorLimite).toBe(1);
    expect(await leidasEsteMes(usuarioId)).toBe(5);
  });

  it("C4 · el contador es del mes en curso, en hora de Madrid", async () => {
    // 1 de diciembre a las 00:30 en Madrid: las 5 de noviembre ya no cuentan.
    const app = appCon(new Map(), new Date("2026-11-30T23:30:00Z"));
    const { cookie, usuarioId, inmuebleId } = await conInmueble(app);
    await bd.insert(t.usoIa).values({ usuarioId, mes: "2026-11", facturasLeidas: 5 });
    const r = await subir(app, cookie, inmuebleId, ["luz"]);
    expect(r.facturas.map((f) => f.estado)).toEqual(["propuesta"]);
    expect(await leidasEsteMes(usuarioId, "2026-12")).toBe(1);
  });

  it("C26 · una lectura fallida no gasta del límite", async () => {
    const app = appCon();
    const { cookie, usuarioId, inmuebleId } = await conInmueble(app);
    await bd.insert(t.usoIa).values({ usuarioId, mes: "2026-11", facturasLeidas: 4 });
    const fallida = await subir(app, cookie, inmuebleId, ["rota"]);
    expect(fallida.facturas.map((f) => f.estado)).toEqual(["error_extraccion"]);
    expect(await leidasEsteMes(usuarioId)).toBe(4);
    const siguiente = await subir(app, cookie, inmuebleId, ["luz"]);
    expect(siguiente.facturas.map((f) => f.estado)).toEqual(["propuesta"]);
    expect(await leidasEsteMes(usuarioId)).toBe(5);
  });

  it("con cortesía, 100 al mes", async () => {
    const { email, cookie, usuarioId } = await cuenta("cortesia");
    const app = appCon(leerCortesias(email).cortesias);
    const i = Inmueble.parse(await (await altaInmueble(app, cookie)).json());
    await bd.insert(t.usoIa).values({ usuarioId, mes: "2026-11", facturasLeidas: 98 });
    const r = await subir(app, cookie, i.id, ["luz", "luz", "luz"]);
    expect(r.facturas.map((f) => f.estado)).toEqual(["propuesta", "propuesta", "subida"]);
    expect(await leidasEsteMes(usuarioId)).toBe(100);
  });

  it("aislamiento (spec 008, R13): el contador es de cada cuenta", async () => {
    const app = appCon();
    const a = await conInmueble(app);
    const b = await conInmueble(app);
    await bd.insert(t.usoIa).values({ usuarioId: a.usuarioId, mes: "2026-11", facturasLeidas: 5 });
    expect((await subir(app, b.cookie, b.inmuebleId, ["luz"])).facturas[0]!.estado).toBe("propuesta");
    expect(await leidasEsteMes(a.usuarioId)).toBe(5);
    expect(await leidasEsteMes(b.usuarioId)).toBe(1);
  });
});
