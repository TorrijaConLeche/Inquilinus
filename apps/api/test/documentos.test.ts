// Spec 007 · tarea 3.6: documentos (contrato y justificante de la fianza) y fianza.
import { PGlite } from "@electric-sql/pglite";
import { Documento, Fianza, Inmueble, Inquilino, PermisoSubida, VERSION_TERMINOS } from "@inquilinus/contracts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { disposicion } from "../src/almacen.ts";
import { crearApp } from "../src/app.ts";
import { crearAuth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import type { Correo } from "../src/correo/enviador.ts";
import { crearRegistro } from "../src/registro.ts";
import { crearAlmacenMemoria } from "./almacen-memoria.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");

let app: ReturnType<typeof crearApp>;
let appSinAlmacen: ReturnType<typeof crearApp>;
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
  app = crearApp({ auth, bd, registro, almacen, ahora }, { rutaBase: "/api" });
  appSinAlmacen = crearApp({ auth, bd, registro, ahora }, { rutaBase: "/api" });
}, 30_000);

type Opciones = { metodo?: string; cuerpo?: unknown; cookie?: string; origen?: string };

function pedir(ruta: string, { metodo, cuerpo, cookie, origen }: Opciones = {}, aplicacion = app) {
  return aplicacion.request(`${URL_BASE}/api${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: { origin: origen ?? URL_BASE, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

let contador = 0;
async function cuenta() {
  const email = `documentos${++contador}@ejemplo.test`;
  await pedir("/auth/sign-up/email", { cuerpo: { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS } });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir("/auth/sign-in/email", { cuerpo: { email, password: CONTRASENA } });
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Cuenta con un inmueble y un inquilino, Ana. Devuelve la ruta base del inquilino. */
async function conInquilino() {
  const cookie = await cuenta();
  const r = await pedir("/inmuebles", {
    cuerpo: { nombre: "Piso Centro", modalidad: "habitaciones", habitaciones: [{ nombre: "H1", precioMensual: 50_000 }] },
    cookie,
  });
  const inmueble = Inmueble.parse(await r.json());
  const q = await pedir(`/inmuebles/${inmueble.id}/inquilinos`, { cuerpo: { nombre: "Ana" }, cookie });
  const ana = Inquilino.parse(await q.json());
  return { cookie, base: `/inmuebles/${inmueble.id}/inquilinos/${ana.id}`, inmuebleId: inmueble.id, inquilinoId: ana.id };
}

/** Pide permiso, "sube" el contenido como lo haría el navegador y confirma. */
async function subir(cookie: string, base: string, tipo: string, contenido: Uint8Array, nombre = "contrato.pdf") {
  const p = await pedir(`${base}/subidas`, { metodo: "POST", cookie });
  expect(p.status).toBe(201);
  const permiso = PermisoSubida.parse(await p.json());
  almacen.subir(permiso.campos, contenido);
  return { permiso, respuesta: await pedir(`${base}/documentos/${tipo}`, { metodo: "PUT", cuerpo: { subidaId: permiso.subidaId, nombre }, cookie }) };
}

async function verAna(cookie: string, inmuebleId: string, inquilinoId: string) {
  const r = await pedir(`/inmuebles/${inmuebleId}/inquilinos`, { cookie });
  const { inquilinos } = (await r.json()) as { inquilinos: unknown[] };
  return inquilinos.map((q) => Inquilino.parse(q)).find((q) => q.id === inquilinoId)!;
}

const clavesDocumentos = () => [...almacen.objetos.keys()].filter((k) => k.startsWith("documentos/"));

describe("Spec 007 · Documentos (R6b, R6c)", () => {
  it("sube un contrato: queda en el bucket, en la base de datos y en el inquilino", async () => {
    const { cookie, base, inmuebleId, inquilinoId } = await conInquilino();
    const { permiso, respuesta } = await subir(cookie, base, "contrato", PDF, "Contrato Ana.pdf");
    expect(permiso.tamanoMaximo).toBe(10 * 1024 * 1024);
    expect(permiso.caducaEn).toBe("2026-11-15T12:05:00.000Z");
    expect(respuesta.status).toBe(200);
    const documento = Documento.parse(await respuesta.json());
    expect(documento).toMatchObject({ tipo: "contrato", nombre: "Contrato Ana.pdf", tamanoBytes: PDF.length });

    // La subida pendiente ya no existe; el definitivo sí.
    expect(almacen.objetos.has(permiso.campos["key"]!)).toBe(false);
    const [fichero] = await bd.select().from(t.fichero).where(eq(t.fichero.nombreOriginal, "Contrato Ana.pdf"));
    expect(fichero?.mime).toBe("application/pdf");
    expect(fichero?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(almacen.objetos.has(fichero!.claveS3)).toBe(true);

    const ana = await verAna(cookie, inmuebleId, inquilinoId);
    expect(ana.documentos.map((d) => d.tipo)).toEqual(["contrato"]);
  });

  it("C11 · un fichero de texto con extensión .pdf no se guarda (R6b)", async () => {
    const { cookie, base, inmuebleId, inquilinoId } = await conInquilino();
    const antes = clavesDocumentos().length;
    const { permiso, respuesta } = await subir(cookie, base, "contrato", new TextEncoder().encode("No soy un PDF"), "falso.pdf");
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toEqual({ error: "FICHERO_INVALIDO" });
    // Nada en el bucket (ni la subida pendiente) y nada en la base de datos.
    expect(almacen.objetos.has(permiso.campos["key"]!)).toBe(false);
    expect(clavesDocumentos().length).toBe(antes);
    expect((await verAna(cookie, inmuebleId, inquilinoId)).documentos).toEqual([]);
  });

  it("C12 · subir otro contrato reemplaza al anterior y borra su fichero (R6b)", async () => {
    const { cookie, base, inmuebleId, inquilinoId } = await conInquilino();
    await subir(cookie, base, "contrato", PDF, "primero.pdf");
    const [primero] = await bd.select().from(t.fichero).where(eq(t.fichero.nombreOriginal, "primero.pdf"));
    const { respuesta } = await subir(cookie, base, "contrato", PDF, "segundo.pdf");
    expect(respuesta.status).toBe(200);

    const ana = await verAna(cookie, inmuebleId, inquilinoId);
    expect(ana.documentos).toHaveLength(1);
    expect(ana.documentos[0]!.nombre).toBe("segundo.pdf");
    expect(almacen.objetos.has(primero!.claveS3)).toBe(false);
    expect(await bd.select().from(t.fichero).where(eq(t.fichero.id, primero!.id))).toEqual([]);
  });

  it("contrato y justificante conviven: uno de cada tipo (R6b)", async () => {
    const { cookie, base, inmuebleId, inquilinoId } = await conInquilino();
    await subir(cookie, base, "contrato", PDF);
    await subir(cookie, base, "justificante_fianza", PDF, "justificante.pdf");
    const ana = await verAna(cookie, inmuebleId, inquilinoId);
    expect(ana.documentos.map((d) => d.tipo)).toEqual(["contrato", "justificante_fianza"]);
  });

  it("una subida no se puede confirmar dos veces ni con un id inventado", async () => {
    const { cookie, base } = await conInquilino();
    const { permiso } = await subir(cookie, base, "contrato", PDF);
    const otra = await pedir(`${base}/documentos/contrato`, { metodo: "PUT", cuerpo: { subidaId: permiso.subidaId, nombre: "x.pdf" }, cookie });
    expect(otra.status).toBe(400);
    expect(await otra.json()).toEqual({ error: "SUBIDA_NO_ENCONTRADA" });
    const inventada = await pedir(`${base}/documentos/contrato`, {
      metodo: "PUT",
      cuerpo: { subidaId: crypto.randomUUID(), nombre: "x.pdf" },
      cookie,
    });
    expect(inventada.status).toBe(400);
  });

  it("el nombre se queda sin rutas ni caracteres de control", async () => {
    const { cookie, base } = await conInquilino();
    const { respuesta } = await subir(cookie, base, "contrato", PDF, "C:\\fakepath\\con\u0007trato.pdf");
    expect(Documento.parse(await respuesta.json()).nombre).toBe("contrato.pdf");
  });

  it("ver el documento redirige a una URL firmada de 5 minutos (R6c)", async () => {
    const { cookie, base } = await conInquilino();
    await subir(cookie, base, "contrato", PDF);
    const r = await pedir(`${base}/documentos/contrato`, { cookie });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/^https:\/\/bucket\.ejemplo\.test\/documentos\/.+\.pdf\?caduca=300$/);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await pedir(`${base}/documentos/justificante_fianza`, { cookie })).status).toBe(404);
    expect((await pedir(`${base}/documentos/nomina`, { cookie })).status).toBe(404);
  });

  it("borrar el documento lo quita del bucket y de la base de datos", async () => {
    const { cookie, base, inmuebleId, inquilinoId } = await conInquilino();
    await subir(cookie, base, "contrato", PDF, "para-borrar.pdf");
    const [fichero] = await bd.select().from(t.fichero).where(eq(t.fichero.nombreOriginal, "para-borrar.pdf"));
    expect((await pedir(`${base}/documentos/contrato`, { metodo: "DELETE", cookie })).status).toBe(204);
    expect(almacen.objetos.has(fichero!.claveS3)).toBe(false);
    expect((await verAna(cookie, inmuebleId, inquilinoId)).documentos).toEqual([]);
    expect((await pedir(`${base}/documentos/contrato`, { metodo: "DELETE", cookie })).status).toBe(404);
  });

  it("C13 · otra propietaria no puede ver, subir ni borrar los documentos de Ana (aislamiento)", async () => {
    const { cookie, base } = await conInquilino();
    await subir(cookie, base, "contrato", PDF);
    const ajena = await cuenta();
    expect((await pedir(`${base}/documentos/contrato`, { cookie: ajena })).status).toBe(404);
    expect((await pedir(`${base}/subidas`, { metodo: "POST", cookie: ajena })).status).toBe(404);
    expect((await pedir(`${base}/documentos/contrato`, { metodo: "DELETE", cookie: ajena })).status).toBe(404);

    // Tampoco puede confirmar en el inquilino de Ana una subida suya.
    const suya = await conInquilino();
    const p = PermisoSubida.parse(await (await pedir(`${suya.base}/subidas`, { metodo: "POST", cookie: suya.cookie })).json());
    almacen.subir(p.campos, PDF);
    const r = await pedir(`${base}/documentos/contrato`, { metodo: "PUT", cuerpo: { subidaId: p.subidaId, nombre: "x.pdf" }, cookie: suya.cookie });
    expect(r.status).toBe(404);
    // Ni Ana puede usar la subida de otra cuenta: la clave pendiente depende del usuario.
    const robada = await pedir(`${base}/documentos/contrato`, { metodo: "PUT", cuerpo: { subidaId: p.subidaId, nombre: "x.pdf" }, cookie });
    expect(await robada.json()).toEqual({ error: "SUBIDA_NO_ENCONTRADA" });
  });

  it("sin sesión, 401; desde otra web, 403", async () => {
    const { cookie, base } = await conInquilino();
    expect((await pedir(`${base}/subidas`, { metodo: "POST" })).status).toBe(401);
    expect((await pedir(`${base}/subidas`, { metodo: "POST", cookie, origen: "https://malvada.ejemplo" })).status).toBe(403);
  });

  it("sin bucket configurado, los documentos responden 503", async () => {
    const { cookie, base } = await conInquilino();
    const r = await pedir(`${base}/subidas`, { metodo: "POST", cookie }, appSinAlmacen);
    expect(r.status).toBe(503);
  });
});

describe("Spec 007 · Fianza (R6d)", () => {
  it("guarda la fianza, la actualiza con una devolución parcial y aparece en el inquilino", async () => {
    const { cookie, base, inmuebleId, inquilinoId } = await conInquilino();
    const r = await pedir(`${base}/fianza`, { metodo: "PUT", cuerpo: { importe: 80_000, recibidaEn: "2026-09-01" }, cookie });
    expect(r.status).toBe(200);
    expect(Fianza.parse(await r.json())).toEqual({
      importe: 80_000,
      recibidaEn: "2026-09-01",
      devueltaEn: null,
      importeDevuelto: null,
      notas: null,
    });

    const devolucion = { importe: 80_000, recibidaEn: "2026-09-01", devueltaEn: "2027-07-10", importeDevuelto: 75_000, notas: "Pintura" };
    expect((await pedir(`${base}/fianza`, { metodo: "PUT", cuerpo: devolucion, cookie })).status).toBe(200);
    expect((await verAna(cookie, inmuebleId, inquilinoId)).fianza).toEqual(devolucion);
    // Sigue habiendo una sola fila.
    expect((await bd.select().from(t.fianza)).filter((f) => f.inquilinoId === inquilinoId)).toHaveLength(1);
  });

  it("C14 · devolver más que la fianza es un error", async () => {
    const { cookie, base } = await conInquilino();
    const r = await pedir(`${base}/fianza`, {
      metodo: "PUT",
      cuerpo: { importe: 80_000, devueltaEn: "2027-07-01", importeDevuelto: 90_000 },
      cookie,
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "DEVOLUCION_MAYOR_QUE_FIANZA" });
  });

  it("C15 · importe devuelto sin fecha es un error", async () => {
    const { cookie, base } = await conInquilino();
    const r = await pedir(`${base}/fianza`, { metodo: "PUT", cuerpo: { importe: 80_000, importeDevuelto: 80_000 }, cookie });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "DEVOLUCION_INCOMPLETA" });
  });

  it("se puede borrar", async () => {
    const { cookie, base, inmuebleId, inquilinoId } = await conInquilino();
    await pedir(`${base}/fianza`, { metodo: "PUT", cuerpo: { importe: 80_000 }, cookie });
    expect((await pedir(`${base}/fianza`, { metodo: "DELETE", cookie })).status).toBe(204);
    expect((await verAna(cookie, inmuebleId, inquilinoId)).fianza).toBeNull();
    expect((await pedir(`${base}/fianza`, { metodo: "DELETE", cookie })).status).toBe(404);
  });

  it("aislamiento: otra propietaria no puede ver ni tocar la fianza de Ana", async () => {
    const { cookie, base, inmuebleId, inquilinoId } = await conInquilino();
    await pedir(`${base}/fianza`, { metodo: "PUT", cuerpo: { importe: 80_000 }, cookie });
    const ajena = await cuenta();
    expect((await pedir(`${base}/fianza`, { metodo: "PUT", cuerpo: { importe: 1 }, cookie: ajena })).status).toBe(404);
    expect((await pedir(`${base}/fianza`, { metodo: "DELETE", cookie: ajena })).status).toBe(404);
    expect((await pedir(`/inmuebles/${inmuebleId}/inquilinos`, { cookie: ajena })).status).toBe(404);
    expect((await verAna(cookie, inmuebleId, inquilinoId)).fianza?.importe).toBe(80_000);
  });
});

describe("Nombre del PDF al verlo", () => {
  it("lleva el nombre original codificado y una versión ASCII sin comillas", () => {
    expect(disposicion('Contrato "Ana" Muñoz.pdf')).toBe(
      `inline; filename="Contrato _Ana_ Mu_oz.pdf"; filename*=UTF-8''Contrato%20%22Ana%22%20Mu%C3%B1oz.pdf`,
    );
  });
});
