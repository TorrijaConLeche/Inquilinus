// Spec 003, R12: lectura de los lotes de 3 en 3, con reintentos si Bedrock frena y tope del lote.
import { PGlite } from "@electric-sql/pglite";
import { Inmueble, PermisosSubida, ResultadoSubidaFacturas, VERSION_TERMINOS } from "@inquilinus/contracts";
import { leerCortesias, type LecturaFactura } from "@inquilinus/domain";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { crearApp, type Dependencias } from "../src/app.ts";
import { crearAuth, type Auth } from "../src/auth.ts";
import * as t from "../src/bd/esquema.ts";
import type { Correo } from "../src/correo/enviador.ts";
import { ErrorLectura } from "../src/extractor-bedrock.ts";
import type { ExtractorFacturas } from "../src/extractor.ts";
import { crearRegistro } from "../src/registro.ts";
import { crearAlmacenMemoria } from "./almacen-memoria.ts";

const URL_BASE = "http://localhost:3000";
const CONTRASENA = "una frase larga y segura";
const LECTURA: LecturaFactura = { inicio: "2026-10-01", fin: "2026-10-31", importe: 5_000, tipoGasto: "Luz" };
const pdf = (n: number) => new TextEncoder().encode(`%PDF-1.7\nfactura ${n}\n%%EOF`);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
function pedir(app: App, ruta: string, cuerpo: unknown, cookie = "") {
  return app.request(`${URL_BASE}/api${ruta}`, {
    method: "POST",
    headers: { origin: URL_BASE, "content-type": "application/json", cookie },
    body: JSON.stringify(cuerpo),
  });
}

let contador = 0;
/**
 * Cuenta con Advanced de cortesía (100 lecturas al mes), un inmueble y una app con el
 * extractor y los ajustes de lectura de cada caso.
 */
async function escenario(extractor: ExtractorFacturas, lecturaIa: NonNullable<Dependencias["lecturaIa"]>) {
  const email = `lote${++contador}@ejemplo.test`;
  const app = crearApp(
    {
      auth,
      bd,
      registro,
      almacen,
      extractor,
      lecturaIa,
      cortesias: leerCortesias(email).cortesias,
      ahora: () => new Date("2026-11-15T12:00:00Z"),
    },
    { rutaBase: "/api" },
  );
  await pedir(app, "/auth/sign-up/email", { email, password: CONTRASENA, name: "", terminosVersion: VERSION_TERMINOS });
  const correo = [...enviados].reverse().find((c) => c.para === email)!;
  await app.request(correo.texto.match(/https?:\/\/\S+/)![0].replace(URL_BASE, ""));
  const r = await pedir(app, "/auth/sign-in/email", { email, password: CONTRASENA });
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const alta = { nombre: "Piso", modalidad: "entero", habitaciones: [{ nombre: "Todo", precioMensual: 80_000 }] };
  const inmueble = Inmueble.parse(await (await pedir(app, "/inmuebles", alta, cookie)).json());
  const [usuario] = await bd.select({ id: t.usuario.id }).from(t.usuario).where(eq(t.usuario.email, email));

  /** Sube `n` PDF como un solo lote, en orden 1, 2, 3… */
  const subir = async (n: number) => {
    const base = `/inmuebles/${inmueble.id}/facturas`;
    const { permisos } = PermisosSubida.parse(await (await pedir(app, `${base}/subidas`, { cantidad: n }, cookie)).json());
    permisos.forEach((p, i) => almacen.subir(p.campos, pdf(i + 1)));
    const lote = await pedir(app, base, { subidas: permisos.map((p, i) => ({ subidaId: p.subidaId, nombre: `${i + 1}.pdf` })) }, cookie);
    expect(lote.status).toBe(201);
    return ResultadoSubidaFacturas.parse(await lote.json());
  };
  const leidasEsteMes = async () => {
    const [fila] = await bd
      .select({ n: t.usoIa.facturasLeidas })
      .from(t.usoIa)
      .where(and(eq(t.usoIa.usuarioId, usuario!.id), eq(t.usoIa.mes, "2026-11")));
    return fila?.n ?? 0;
  };
  return { subir, leidasEsteMes };
}

const estados = (r: ResultadoSubidaFacturas) =>
  [...r.facturas].sort((a, b) => a.nombreFichero.localeCompare(b.nombreFichero, "es", { numeric: true })).map((f) => f.estado);

describe("Spec 003 · Lectura del lote (R12)", () => {
  it("C25 · si Bedrock frena, se espera y se reintenta", async () => {
    let llamadas = 0;
    const extractor: ExtractorFacturas = {
      async leer() {
        llamadas++;
        if (llamadas === 1) throw new ErrorLectura("HTTP_429");
        return LECTURA;
      },
    };
    const e = await escenario(extractor, { esperaBaseMs: 10 });
    const r = await e.subir(1);
    expect(estados(r)).toEqual(["propuesta"]);
    expect(llamadas).toBe(2);
    expect(await e.leidasEsteMes()).toBe(1);
  });

  it("C26 · un lote de 6 se lee con 3 lecturas a la vez como mucho", async () => {
    let enCurso = 0;
    let maximo = 0;
    const extractor: ExtractorFacturas = {
      async leer() {
        maximo = Math.max(maximo, ++enCurso);
        await dormir(30);
        enCurso--;
        return LECTURA;
      },
    };
    const e = await escenario(extractor, {});
    const r = await e.subir(6);
    expect(estados(r)).toEqual(Array(6).fill("propuesta"));
    expect(maximo).toBe(3);
    expect(await e.leidasEsteMes()).toBe(6);
  });

  it("C27 · pasado el tope del lote, las que no han empezado quedan para rellenar a mano y no gastan", async () => {
    // Una a la vez y un tope de 50 ms: la primera tarda 100 ms y las otras dos ya no empiezan.
    const extractor: ExtractorFacturas = {
      async leer() {
        await dormir(100);
        return LECTURA;
      },
    };
    const e = await escenario(extractor, { aLaVez: 1, limiteLoteMs: 50 });
    const r = await e.subir(3);
    expect(estados(r)).toEqual(["propuesta", "subida", "subida"]);
    expect(r.sinIaPorLimite).toBe(0);
    expect(await e.leidasEsteMes()).toBe(1);
  });

  it("un error que no es de cuota no se reintenta (R8)", async () => {
    let llamadas = 0;
    const extractor: ExtractorFacturas = {
      async leer() {
        llamadas++;
        throw new ErrorLectura("IA_RESPUESTA_INVALIDA");
      },
    };
    const e = await escenario(extractor, { esperaBaseMs: 10 });
    expect(estados(await e.subir(1))).toEqual(["error_extraccion"]);
    expect(llamadas).toBe(1);
    expect(await e.leidasEsteMes()).toBe(0);
  });
});
