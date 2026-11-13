// Spec 005 · tarea 4.2: proceso diario que genera los cobros (R2, R2b, R3, R4, R8, R8b).
import { PGlite } from "@electric-sql/pglite";
import { Inmueble, Inquilino, ListaCobros, VERSION_TERMINOS } from "@inquilinus/contracts";
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
const SECRETO = "secreto-del-cron-de-pruebas";

let app: ReturnType<typeof crearApp>;
let sinSecreto: ReturnType<typeof crearApp>;
let bd: ReturnType<typeof drizzle<typeof t>>;
const enviados: Correo[] = [];
const lineas: string[] = [];
/** Hoy (en Madrid) para el proceso; cada test lo fija. */
let hoy = "2026-10-01";

beforeAll(async () => {
  bd = drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const registro = crearRegistro((_nivel, linea) => void lineas.push(linea));
  const auth = crearAuth({
    bd,
    correo: { enviar: async (c) => void enviados.push(c) },
    registro,
    secreto: "secreto-de-pruebas-con-mas-de-32-caracteres",
    urlBase: URL_BASE,
    rutaBase: "/api/auth",
  });
  // Las 10:00 UTC caen siempre en el mismo día en Madrid.
  const ahora = () => new Date(`${hoy}T10:00:00Z`);
  app = crearApp({ auth, bd, registro, ahora, secretoCron: SECRETO }, { rutaBase: "/api" });
  sinSecreto = crearApp({ auth, bd, registro, ahora }, { rutaBase: "/api" });
}, 30_000);

function pedir(ruta: string, { metodo, cuerpo, cookie }: { metodo?: string; cuerpo?: unknown; cookie?: string } = {}) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: { origin: URL_BASE, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

/** Lo que hace Vercel cada madrugada. */
async function proceso(dia: string, autorizacion: string | null = `Bearer ${SECRETO}`, aplicacion = app) {
  hoy = dia;
  return aplicacion.request(`${URL_BASE}/api/procesos/cobros-diarios`, {
    headers: autorizacion === null ? {} : { authorization: autorizacion },
  });
}

let contador = 0;
async function cuenta() {
  hoy = "2026-09-15";
  const email = `proceso${++contador}@ejemplo.test`;
  await pedir("/auth/sign-up/email", { cuerpo: { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS } });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Por habitaciones con prorrateo: H1 500 €, H2 400 €, H3 300 €; A en H1 y B en H2 desde enero. */
async function escenario(diaCobro = 1) {
  const cookie = await cuenta();
  const r = await pedir("/inmuebles", {
    cuerpo: {
      nombre: "Piso Centro",
      modalidad: "habitaciones",
      mesesParciales: "prorrateo",
      diaCobro,
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
  const alta = async (nombre: string, ocupacion: object) =>
    Inquilino.parse(await (await pedir(`/inmuebles/${i.id}/inquilinos`, { cuerpo: { nombre, ocupacion }, cookie })).json());
  const a = await alta("A", { habitacionId: h.H1, entrada: "2026-01-01" });
  const b = await alta("B", { habitacionId: h.H2, entrada: "2026-01-01" });
  const cobros = async (mes = "2026-10") =>
    ListaCobros.parse(await (await pedir(`/inmuebles/${i.id}/cobros?mes=${mes}`, { cookie })).json()).cobros;
  return { cookie, id: i.id, h, a, b, alta, cobros };
}

const resumen = (cs: { inquilinoId: string; importe: number; fechaCobro: string; origen: string; pagadoEn: string | null }[], nombres: Record<string, string>) =>
  cs.map((c) => [nombres[c.inquilinoId], c.importe, c.fechaCobro, c.origen, c.pagadoEn]).sort();

describe("Spec 005 · Proceso diario", () => {
  it("C1 · el día 1 genera los cobros de octubre, pendientes y con origen auto", async () => {
    const e = await escenario();
    const r = await proceso("2026-10-01");
    expect(r.status).toBe(200);
    expect(resumen(await e.cobros(), { [e.a.id]: "A", [e.b.id]: "B" })).toEqual([
      ["A", 50_000, "2026-10-01", "auto", null],
      ["B", 40_000, "2026-10-01", "auto", null],
    ]);
  });

  it("C2 · con día de cobro 5, el 4 no genera nada y el 5 sí", async () => {
    const e = await escenario(5);
    await proceso("2026-10-04");
    expect(await e.cobros()).toEqual([]);
    await proceso("2026-10-05");
    expect((await e.cobros()).map((c) => c.fechaCobro)).toEqual(["2026-10-05", "2026-10-05"]);
  });

  it("C3 · correr dos veces el mismo día no duplica", async () => {
    const e = await escenario();
    await proceso("2026-10-01");
    await proceso("2026-10-01");
    expect(await e.cobros()).toHaveLength(2);
  });

  it("C4 · si no corrió el día 1, los genera el día 2", async () => {
    const e = await escenario();
    await proceso("2026-10-02");
    expect((await e.cobros()).map((c) => c.fechaCobro)).toEqual(["2026-10-01", "2026-10-01"]);
  });

  it("C10 · un inquilino nuevo a mitad de mes recibe su cobro esa noche, con fecha del día de cobro", async () => {
    const e = await escenario();
    await proceso("2026-10-01");
    hoy = "2026-10-11";
    const c = await e.alta("C", { habitacionId: e.h.H3, entrada: "2026-10-11" });
    await proceso("2026-10-12");
    const deC = (await e.cobros()).find((x) => x.inquilinoId === c.id);
    // 300 € × 21/31 días.
    expect(deC).toMatchObject({ importe: 20_323, fechaCobro: "2026-10-01", origen: "auto" });
  });

  it("C14 · sin cambios no crea nada nuevo", async () => {
    const e = await escenario();
    await proceso("2026-10-01");
    const antes = await e.cobros();
    await proceso("2026-10-12");
    expect(await e.cobros()).toEqual(antes);
  });

  it("un cobro quitado no se vuelve a crear (R11)", async () => {
    const e = await escenario();
    await proceso("2026-10-01");
    const [primero] = await e.cobros();
    await pedir(`/inmuebles/${e.id}/cobros/${primero!.id}`, { metodo: "PATCH", cuerpo: { quitado: true }, cookie: e.cookie });
    await proceso("2026-10-02");
    expect((await e.cobros()).map((c) => c.id)).not.toContain(primero!.id);
    expect(await e.cobros()).toHaveLength(1);
  });

  it("C19 · los inmuebles archivados y bloqueados no generan", async () => {
    const archivado = await escenario();
    await pedir(`/inmuebles/${archivado.id}/ocupaciones/${archivado.a.ocupaciones[0]!.id}`, {
      metodo: "PATCH",
      cuerpo: { salida: "2026-09-10" },
      cookie: archivado.cookie,
    });
    await pedir(`/inmuebles/${archivado.id}/ocupaciones/${archivado.b.ocupaciones[0]!.id}`, {
      metodo: "PATCH",
      cuerpo: { salida: "2026-09-10" },
      cookie: archivado.cookie,
    });
    hoy = "2026-09-15";
    expect((await pedir(`/inmuebles/${archivado.id}`, { metodo: "PATCH", cuerpo: { archivado: true }, cookie: archivado.cookie })).status).toBe(200);
    // Aunque tenga a alguien en octubre (se corrige la salida después de archivarlo), no genera.
    await bd.update(t.ocupacion).set({ salida: null }).where(eq(t.ocupacion.inquilinoId, archivado.a.id));

    const bloqueado = await escenario();
    await bd.update(t.inmueble).set({ bloqueado: true }).where(eq(t.inmueble.id, bloqueado.id));

    await proceso("2026-10-01");
    const enBd = async (inmuebleId: string) =>
      bd
        .select({ id: t.cobroAlquiler.id })
        .from(t.cobroAlquiler)
        .innerJoin(t.inquilino, eq(t.inquilino.id, t.cobroAlquiler.inquilinoId))
        .where(eq(t.inquilino.inmuebleId, inmuebleId));
    expect(await enBd(archivado.id)).toEqual([]);
    expect(await enBd(bloqueado.id)).toEqual([]);
  });

  it("un inmueble que no se puede calcular no para a los demás, y el registro no lleva datos personales (R8b)", async () => {
    const roto = await escenario();
    // Una habitación ocupada en octubre sin precio en octubre: no se puede calcular.
    const [sinPrecio] = await bd.insert(t.habitacion).values({ inmuebleId: roto.id, nombre: "Buhardilla" }).returning();
    await bd.insert(t.precioHabitacion).values({ habitacionId: sinPrecio!.id, desdeMes: "2026-12", precioMensual: 10_000 });
    await bd.insert(t.ocupacion).values({
      inmuebleId: roto.id,
      habitacionId: sinPrecio!.id,
      inquilinoId: (await roto.alta("Zoe Secreta", { habitacionId: roto.h.H3, entrada: "2026-01-01", salida: "2026-01-31" })).id,
      entrada: "2026-10-01",
    });
    const sano = await escenario();

    lineas.length = 0;
    const r = await proceso("2026-10-01");
    const cuerpo = (await r.json()) as { fallidos: number; creados: number };
    expect(cuerpo.fallidos).toBeGreaterThanOrEqual(1);
    expect(await roto.cobros()).toEqual([]);
    expect(await sano.cobros()).toHaveLength(2);

    const registro = lineas.join("\n");
    expect(registro).toContain('"evento":"cobro_diario_fallido"');
    expect(registro).toContain('"codigo":"SIN_PRECIO"');
    expect(registro).toContain('"evento":"cobros_diarios"');
    expect(registro).not.toContain("Zoe");
    expect(registro).not.toContain(roto.id);
  });
});

describe("Spec 005 · Seguridad del proceso (R8b)", () => {
  it("C20 · sin el secreto o con otro: 401 y no se crea nada", async () => {
    const e = await escenario();
    expect((await proceso("2026-10-01", null)).status).toBe(401);
    expect((await proceso("2026-10-01", "Bearer otro-secreto")).status).toBe(401);
    expect((await proceso("2026-10-01", SECRETO)).status).toBe(401);
    expect(await e.cobros()).toEqual([]);
  });

  it("sin CRON_SECRET configurado, el proceso está desactivado", async () => {
    const e = await escenario();
    const r = await proceso("2026-10-01", `Bearer ${SECRETO}`, sinSecreto);
    expect(r.status).toBe(503);
    expect(await e.cobros()).toEqual([]);
  });
});
