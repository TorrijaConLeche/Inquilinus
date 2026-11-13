// Spec 007 · tarea 3.7: archivar, restaurar, borrar y anonimizar (R11–R13).
import { PGlite } from "@electric-sql/pglite";
import {
  Inmueble,
  Inquilino,
  ListaInmuebles,
  ListaTiposGasto,
  PermisoSubida,
  TipoGasto,
  VERSION_TERMINOS,
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
  // Hoy es el 2026-11-15 en Madrid.
  app = crearApp({ auth, bd, registro, almacen, ahora: () => new Date("2026-11-15T12:00:00Z") }, { rutaBase: "/api" });
}, 30_000);

type Opciones = { metodo?: string; cuerpo?: unknown; cookie: string };

function pedir(ruta: string, { metodo, cuerpo, cookie }: Opciones) {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: { origin: URL_BASE, "content-type": "application/json", cookie },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

let contador = 0;
async function cuenta() {
  const email = `archivo${++contador}@ejemplo.test`;
  const sinCookie = (ruta: string, cuerpo: unknown) =>
    app.request(`${URL_BASE}/api${ruta}`, {
      method: "POST",
      headers: { origin: URL_BASE, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  await sinCookie("/auth/sign-up/email", { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await sinCookie("/auth/sign-in/email", { email, password: CONTRASENA });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Inmueble "Piso Centro" con H1 y H2. */
async function inmueble(cookie: string) {
  const r = await pedir("/inmuebles", {
    cuerpo: {
      nombre: "Piso Centro",
      modalidad: "habitaciones",
      habitaciones: [
        { nombre: "H1", precioMensual: 50_000, desdeMes: "2026-01" },
        { nombre: "H2", precioMensual: 40_000, desdeMes: "2026-01" },
      ],
    },
    cookie,
  });
  const i = Inmueble.parse(await r.json());
  return { id: i.id, h1: i.habitaciones[0]!.id, h2: i.habitaciones[1]!.id, base: `/inmuebles/${i.id}` };
}

async function inquilino(cookie: string, inmuebleId: string, nombre: string, ocupacion?: object) {
  const r = await pedir(`/inmuebles/${inmuebleId}/inquilinos`, { cuerpo: { nombre, ...(ocupacion && { ocupacion }) }, cookie });
  return Inquilino.parse(await r.json());
}

async function ver(cookie: string, inmuebleId: string) {
  return Inmueble.parse(await (await pedir(`/inmuebles/${inmuebleId}`, { cookie })).json());
}

async function inquilinos(cookie: string, inmuebleId: string) {
  const { inquilinos } = (await (await pedir(`/inmuebles/${inmuebleId}/inquilinos`, { cookie })).json()) as {
    inquilinos: unknown[];
  };
  return inquilinos.map((q) => Inquilino.parse(q));
}

const error = async (r: Response) => ((await r.json()) as { error: string }).error;

/** Historial de A: un cobro y una línea de reparto de una factura de luz (spec 002 y 001). */
async function conHistorial(cookie: string, inmuebleId: string, inquilinoId: string) {
  const tipo = TipoGasto.parse(await (await pedir(`/inmuebles/${inmuebleId}/tipos-gasto`, { cuerpo: { nombre: "Luz" }, cookie })).json());
  const [usuario] = await bd.select({ id: t.inmueble.usuarioId }).from(t.inmueble).where(eq(t.inmueble.id, inmuebleId));
  const clave = `facturas/${crypto.randomUUID()}.pdf`;
  almacen.objetos.set(clave, PDF);
  const [fichero] = await bd
    .insert(t.fichero)
    .values({ usuarioId: usuario!.id, claveS3: clave, nombreOriginal: "luz.pdf", mime: "application/pdf", tamanoBytes: 10, sha256: "x" })
    .returning();
  const [factura] = await bd
    .insert(t.factura)
    .values({ tipoGastoId: tipo.id, ficheroId: fichero!.id, lote: crypto.randomUUID() })
    .returning();
  const [reparto] = await bd.insert(t.reparto).values({ facturaId: factura!.id, detalle: {} }).returning();
  await bd.insert(t.repartoLinea).values({ repartoId: reparto!.id, inquilinoId, dias: 30, importe: 2_500 });
  await bd.insert(t.cobroAlquiler).values({
    inquilinoId,
    mes: "2026-09",
    renta: 50_000,
    importe: 50_000,
    fechaCobro: "2026-09-01",
    origen: "auto",
  });
  return { tipoId: tipo.id, claveFactura: clave };
}

async function subirContrato(cookie: string, inmuebleId: string, inquilinoId: string) {
  const base = `/inmuebles/${inmuebleId}/inquilinos/${inquilinoId}`;
  const permiso = PermisoSubida.parse(await (await pedir(`${base}/subidas`, { metodo: "POST", cookie })).json());
  almacen.subir(permiso.campos, PDF);
  await pedir(`${base}/documentos/contrato`, { metodo: "PUT", cuerpo: { subidaId: permiso.subidaId, nombre: "contrato.pdf" }, cookie });
  const [fila] = await bd
    .select({ clave: t.fichero.claveS3 })
    .from(t.documento)
    .innerJoin(t.fichero, eq(t.fichero.id, t.documento.ficheroId))
    .where(eq(t.documento.inquilinoId, inquilinoId));
  return fila!.clave;
}

describe("Spec 007 · Habitaciones (R11, R11b)", () => {
  it("C8 · con una estancia pasada solo se archiva (y se restaura); sin estancias, se borra", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const r3 = Inmueble.parse(await (await pedir(`${i.base}/habitaciones`, { cuerpo: { nombre: "H3", precioMensual: 1 }, cookie })).json());
    const h3 = r3.habitaciones.find((h) => h.nombre === "H3")!.id;
    await inquilino(cookie, i.id, "A", { habitacionId: i.h1, entrada: "2026-01-01", salida: "2026-06-30" });

    const estancias = (await ver(cookie, i.id)).habitaciones.map((h) => [h.nombre, h.conEstancias]);
    expect(estancias).toEqual([
      ["H1", true],
      ["H2", false],
      ["H3", false],
    ]);
    const borrarH1 = await pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "DELETE", cookie });
    expect(borrarH1.status).toBe(400);
    expect(await error(borrarH1)).toBe("HABITACION_CON_ESTANCIAS");

    expect((await pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "PATCH", cuerpo: { archivada: true }, cookie })).status).toBe(200);
    expect((await ver(cookie, i.id)).habitaciones.find((h) => h.id === i.h1)?.archivada).toBe(true);
    expect((await pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "PATCH", cuerpo: { archivada: false }, cookie })).status).toBe(200);
    expect((await ver(cookie, i.id)).habitaciones.find((h) => h.id === i.h1)?.archivada).toBe(false);

    const borrarH3 = await pedir(`${i.base}/habitaciones/${h3}`, { metodo: "DELETE", cookie });
    expect(borrarH3.status).toBe(200);
    expect((await ver(cookie, i.id)).habitaciones.map((h) => h.nombre)).toEqual(["H1", "H2"]);
  });

  it("C16 · no se archiva una habitación con alguien viviendo, ni con una salida futura", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const a = await inquilino(cookie, i.id, "A", { habitacionId: i.h1, entrada: "2026-09-01" });
    const r = await pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "PATCH", cuerpo: { archivada: true }, cookie });
    expect(r.status).toBe(400);
    expect(await error(r)).toBe("ALGUIEN_VIVIENDO");
    expect((await ver(cookie, i.id)).habitaciones.find((h) => h.id === i.h1)?.archivada).toBe(false);

    await pedir(`${i.base}/ocupaciones/${a.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-11-30" }, cookie });
    expect(await error(await pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "PATCH", cuerpo: { archivada: true }, cookie }))).toBe(
      "ALGUIEN_VIVIENDO",
    );
  });

  it("C17 · no se archiva ni se borra la última habitación activa", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    expect((await pedir(`${i.base}/habitaciones/${i.h2}`, { metodo: "PATCH", cuerpo: { archivada: true }, cookie })).status).toBe(200);
    const archivar = await pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "PATCH", cuerpo: { archivada: true }, cookie });
    expect(await error(archivar)).toBe("ULTIMA_HABITACION");
    const borrar = await pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "DELETE", cookie });
    expect(await error(borrar)).toBe("ULTIMA_HABITACION");
    // La archivada sí se puede borrar: no tiene estancias.
    expect((await pedir(`${i.base}/habitaciones/${i.h2}`, { metodo: "DELETE", cookie })).status).toBe(200);
  });

  it("renombrar sigue funcionando con la edición nueva", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    await pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "PATCH", cuerpo: { nombre: "Grande" }, cookie });
    expect((await ver(cookie, i.id)).habitaciones.find((h) => h.id === i.h1)?.nombre).toBe("Grande");
  });
});

describe("Spec 007 · Tipos de gasto (R11)", () => {
  it("C21 · con facturas solo se archiva; sin facturas, se borra", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const a = await inquilino(cookie, i.id, "A", { habitacionId: i.h1, entrada: "2026-01-01", salida: "2026-06-30" });
    const { tipoId: luz } = await conHistorial(cookie, i.id, a.id);
    const agua = TipoGasto.parse(await (await pedir(`${i.base}/tipos-gasto`, { cuerpo: { nombre: "Agua" }, cookie })).json());

    const { tiposGasto } = ListaTiposGasto.parse(await (await pedir(`${i.base}/tipos-gasto`, { cookie })).json());
    expect(tiposGasto.map((tg) => [tg.nombre, tg.conFacturas])).toEqual([
      ["Luz", true],
      ["Agua", false],
    ]);

    const borrarLuz = await pedir(`${i.base}/tipos-gasto/${luz}`, { metodo: "DELETE", cookie });
    expect(await error(borrarLuz)).toBe("TIPO_GASTO_CON_FACTURAS");
    const archivada = await pedir(`${i.base}/tipos-gasto/${luz}`, { metodo: "PATCH", cuerpo: { archivado: true }, cookie });
    expect(TipoGasto.parse(await archivada.json())).toMatchObject({ archivado: true, conFacturas: true });
    const restaurada = await pedir(`${i.base}/tipos-gasto/${luz}`, { metodo: "PATCH", cuerpo: { archivado: false }, cookie });
    expect(TipoGasto.parse(await restaurada.json()).archivado).toBe(false);

    expect((await pedir(`${i.base}/tipos-gasto/${agua.id}`, { metodo: "DELETE", cookie })).status).toBe(204);
    const despues = ListaTiposGasto.parse(await (await pedir(`${i.base}/tipos-gasto`, { cookie })).json());
    expect(despues.tiposGasto.map((tg) => tg.nombre)).toEqual(["Luz"]);
  });
});

describe("Spec 007 · Inquilinos (R11d, R12)", () => {
  it("C9 · borrar a A con historial lo anonimiza: «Inquilino 1», importes intactos, sin documentos, fianza ni ficheros", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const a = await inquilino(cookie, i.id, "Ana", { habitacionId: i.h1, entrada: "2026-01-01", salida: "2026-10-31" });
    await conHistorial(cookie, i.id, a.id);
    const clave = await subirContrato(cookie, i.id, a.id);
    await pedir(`${i.base}/inquilinos/${a.id}/fianza`, { metodo: "PUT", cuerpo: { importe: 80_000 }, cookie });
    await bd.insert(t.enlaceInquilino).values({ inquilinoId: a.id, tokenHash: `hash-${a.id}` });
    expect((await inquilinos(cookie, i.id))[0]!.conHistorial).toBe(true);

    const r = await pedir(`${i.base}/inquilinos/${a.id}`, { metodo: "DELETE", cookie });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ resultado: "anonimizado" });

    const [anonimo] = await inquilinos(cookie, i.id);
    expect(anonimo).toMatchObject({ id: a.id, nombre: "Inquilino 1", anonimizado: true, documentos: [], fianza: null });
    expect(anonimo!.ocupaciones).toHaveLength(1);
    expect(almacen.objetos.has(clave)).toBe(false);
    expect(await bd.select().from(t.enlaceInquilino).where(eq(t.enlaceInquilino.inquilinoId, a.id))).toEqual([]);
    const [cobro] = await bd.select().from(t.cobroAlquiler).where(eq(t.cobroAlquiler.inquilinoId, a.id));
    expect(cobro?.importe).toBe(50_000);
    const [linea] = await bd.select().from(t.repartoLinea).where(eq(t.repartoLinea.inquilinoId, a.id));
    expect(linea?.importe).toBe(2_500);
    // En ningún sitio queda su nombre.
    expect(JSON.stringify(await inquilinos(cookie, i.id))).not.toContain("Ana");
  });

  it("el siguiente anonimizado del inmueble es «Inquilino 2», y un anonimizado ya no se puede editar", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    for (const nombre of ["Ana", "Bea"]) {
      const q = await inquilino(cookie, i.id, nombre, { habitacionId: i.h1, entrada: nombre === "Ana" ? "2026-01-01" : "2026-04-01", salida: nombre === "Ana" ? "2026-03-31" : "2026-06-30" });
      await conHistorial(cookie, i.id, q.id);
      await pedir(`${i.base}/inquilinos/${q.id}`, { metodo: "DELETE", cookie });
    }
    const lista = await inquilinos(cookie, i.id);
    expect(lista.map((q) => q.nombre)).toEqual(["Inquilino 1", "Inquilino 2"]);

    const anonimo = lista[0]!;
    const intentos = [
      pedir(`${i.base}/inquilinos/${anonimo.id}`, { metodo: "PATCH", cuerpo: { nombre: "Ana" }, cookie }),
      pedir(`${i.base}/inquilinos/${anonimo.id}/ocupaciones`, { cuerpo: { habitacionId: i.h2, entrada: "2027-01-01" }, cookie }),
      pedir(`${i.base}/ocupaciones/${anonimo.ocupaciones[0]!.id}`, { metodo: "PATCH", cuerpo: { salida: "2026-03-30" }, cookie }),
      pedir(`${i.base}/inquilinos/${anonimo.id}/fianza`, { metodo: "PUT", cuerpo: { importe: 1 }, cookie }),
      pedir(`${i.base}/inquilinos/${anonimo.id}/subidas`, { metodo: "POST", cookie }),
      pedir(`${i.base}/inquilinos/${anonimo.id}`, { metodo: "DELETE", cookie }),
    ];
    for (const r of await Promise.all(intentos)) {
      expect(r.status).toBe(400);
      expect(await error(r)).toBe("INQUILINO_ANONIMIZADO");
    }
  });

  it("C19 · borrar a B sin historial lo quita del todo, con sus estancias y sus ficheros", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const b = await inquilino(cookie, i.id, "B", { habitacionId: i.h2, entrada: "2026-05-01", salida: "2026-10-31" });
    const clave = await subirContrato(cookie, i.id, b.id);
    expect((await inquilinos(cookie, i.id))[0]!.conHistorial).toBe(false);

    const r = await pedir(`${i.base}/inquilinos/${b.id}`, { metodo: "DELETE", cookie });
    expect(await r.json()).toEqual({ resultado: "borrado" });
    expect(await inquilinos(cookie, i.id)).toEqual([]);
    expect(await bd.select().from(t.ocupacion).where(eq(t.ocupacion.inquilinoId, b.id))).toEqual([]);
    expect(almacen.objetos.has(clave)).toBe(false);
    expect(await bd.select().from(t.fichero).where(eq(t.fichero.claveS3, clave))).toEqual([]);
    // Y la habitación vuelve a no tener estancias: ya se podría borrar.
    expect((await ver(cookie, i.id)).habitaciones.find((h) => h.id === i.h2)?.conEstancias).toBe(false);
  });

  it("C20 · no se borra a quien vive allí ni a quien aún no ha salido", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const a = await inquilino(cookie, i.id, "A", { habitacionId: i.h1, entrada: "2026-09-01" });
    const r = await pedir(`${i.base}/inquilinos/${a.id}`, { metodo: "DELETE", cookie });
    expect(r.status).toBe(400);
    expect(await error(r)).toBe("INQUILINO_VIVIENDO");
    expect((await inquilinos(cookie, i.id))[0]).toMatchObject({ nombre: "A", anonimizado: false });

    // Un inquilino sin estancias todavía sí se puede borrar.
    const sinEstancias = await inquilino(cookie, i.id, "Pendiente");
    expect(await (await pedir(`${i.base}/inquilinos/${sinEstancias.id}`, { metodo: "DELETE", cookie })).json()).toEqual({
      resultado: "borrado",
    });
  });
});

describe("Spec 007 · Inmueble (R11c, R13)", () => {
  it("se archiva y se restaura; archivado solo sale con ?archivados=true", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const r = await pedir(i.base, { metodo: "PATCH", cuerpo: { archivado: true }, cookie });
    expect(Inmueble.parse(await r.json()).archivado).toBe(true);
    const lista = async (q = "") => ListaInmuebles.parse(await (await pedir(`/inmuebles${q}`, { cookie })).json()).inmuebles;
    expect(await lista()).toEqual([]);
    expect((await lista("?archivados=true")).map((x) => x.archivado)).toEqual([true]);
    // Archivado se puede seguir viendo.
    expect((await pedir(i.base, { cookie })).status).toBe(200);
    await pedir(i.base, { metodo: "PATCH", cuerpo: { archivado: false }, cookie });
    expect((await lista()).map((x) => x.id)).toEqual([i.id]);
  });

  it("no se archiva un inmueble con alguien viviendo (R11b)", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    await inquilino(cookie, i.id, "A", { habitacionId: i.h1, entrada: "2026-12-01" });
    const r = await pedir(i.base, { metodo: "PATCH", cuerpo: { archivado: true }, cookie });
    expect(await error(r)).toBe("ALGUIEN_VIVIENDO");
  });

  it("C10 · con un nombre distinto no se borra", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const r = await pedir(i.base, { metodo: "DELETE", cuerpo: { nombre: "Piso centro" }, cookie });
    expect(r.status).toBe(400);
    expect(await error(r)).toBe("CONFIRMACION_INCORRECTA");
    expect((await pedir(i.base, { cookie })).status).toBe(200);
  });

  it("borrar con el nombre exacto lo quita todo, también facturas, repartos y ficheros del bucket (R13)", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const a = await inquilino(cookie, i.id, "A", { habitacionId: i.h1, entrada: "2026-01-01" });
    const { claveFactura } = await conHistorial(cookie, i.id, a.id);
    const claveContrato = await subirContrato(cookie, i.id, a.id);

    const r = await pedir(i.base, { metodo: "DELETE", cuerpo: { nombre: " Piso Centro " }, cookie });
    expect(r.status).toBe(204);
    expect((await pedir(i.base, { cookie })).status).toBe(404);
    expect(almacen.objetos.has(claveFactura)).toBe(false);
    expect(almacen.objetos.has(claveContrato)).toBe(false);
    for (const clave of [claveFactura, claveContrato]) {
      expect(await bd.select().from(t.fichero).where(eq(t.fichero.claveS3, clave))).toEqual([]);
    }
    expect(await bd.select().from(t.inquilino).where(eq(t.inquilino.id, a.id))).toEqual([]);
  });
});

describe("Aislamiento: otra cuenta no puede archivar ni borrar nada ajeno", () => {
  it("todo responde 404 y nada cambia", async () => {
    const cookie = await cuenta();
    const i = await inmueble(cookie);
    const b = await inquilino(cookie, i.id, "B", { habitacionId: i.h2, entrada: "2026-05-01", salida: "2026-10-31" });
    const tipo = TipoGasto.parse(await (await pedir(`${i.base}/tipos-gasto`, { cuerpo: { nombre: "Agua" }, cookie })).json());
    const ajena = await cuenta();
    const intentos = [
      pedir(i.base, { metodo: "PATCH", cuerpo: { archivado: true }, cookie: ajena }),
      pedir(i.base, { metodo: "DELETE", cuerpo: { nombre: "Piso Centro" }, cookie: ajena }),
      pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "PATCH", cuerpo: { archivada: true }, cookie: ajena }),
      pedir(`${i.base}/habitaciones/${i.h1}`, { metodo: "DELETE", cookie: ajena }),
      pedir(`${i.base}/tipos-gasto/${tipo.id}`, { metodo: "PATCH", cuerpo: { archivado: true }, cookie: ajena }),
      pedir(`${i.base}/tipos-gasto/${tipo.id}`, { metodo: "DELETE", cookie: ajena }),
      pedir(`${i.base}/inquilinos/${b.id}`, { metodo: "DELETE", cookie: ajena }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(404);
    const intacto = await ver(cookie, i.id);
    expect(intacto.archivado).toBe(false);
    expect(intacto.habitaciones.every((h) => !h.archivada)).toBe(true);
    expect((await inquilinos(cookie, i.id)).map((q) => q.nombre)).toEqual(["B"]);
  });
});
