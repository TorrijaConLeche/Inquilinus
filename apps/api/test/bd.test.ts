// Aplica las migraciones en PostgreSQL en memoria (PGlite) y comprueba las
// reglas que garantiza la propia base de datos.
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.ts";
import { comprobadorBaseDatos } from "../src/bd/cliente.ts";
import * as t from "../src/bd/esquema.ts";

let bd: ReturnType<typeof crearBd>;
const crearBd = () => drizzle({ client: new PGlite(), schema: t, casing: "snake_case" });

beforeAll(async () => {
  bd = crearBd();
  await migrate(bd, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
}, 30_000);

let contador = 0;
async function nuevoUsuario() {
  contador += 1;
  const [u] = await bd
    .insert(t.usuario)
    .values({ email: `prueba${contador}@ejemplo.test`, nombre: "Prueba" })
    .returning();
  return u!;
}

async function nuevoInmueble(usuarioId?: string) {
  const [i] = await bd
    .insert(t.inmueble)
    .values({ usuarioId: usuarioId ?? (await nuevoUsuario()).id, nombre: "Piso", modalidad: "habitaciones" })
    .returning();
  return i!;
}

async function nuevoInquilino(inmuebleId: string) {
  const [q] = await bd.insert(t.inquilino).values({ inmuebleId, nombre: "Ana" }).returning();
  return q!;
}

async function nuevaHabitacion(inmuebleId: string) {
  const [h] = await bd.insert(t.habitacion).values({ inmuebleId, nombre: "Hab. 1" }).returning();
  return h!;
}

/** Drizzle envuelve el error de Postgres; el motivo está en `cause`. */
async function errorDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    const causa = (e as { cause?: { message?: string } }).cause;
    return causa?.message ?? String(e);
  }
  throw new Error("Se esperaba un error de la base de datos");
}

describe("migraciones", () => {
  it("crean todas las tablas del modelo de datos", async () => {
    const resultado = await bd.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    const tablas = resultado.rows.map((f) => f.table_name);
    expect(tablas).toEqual(
      [
        "actividad",
        "cobro_alquiler",
        "doble_factor",
        "documento",
        "enlace_inquilino",
        "evento_pago",
        "factura",
        "fianza",
        "fichero",
        "habitacion",
        "inmueble",
        "intento_acceso",
        "inquilino",
        "liquidacion",
        "metodo_acceso",
        "ocupacion",
        "precio_habitacion",
        "reparto",
        "reparto_linea",
        "sesion",
        "suscripcion",
        "tipo_gasto",
        "uso_ia",
        "usuario",
        "verificacion",
      ].sort(),
    );
  });

  it("aplican los valores por defecto del inmueble", async () => {
    const inmueble = await nuevoInmueble();
    expect(inmueble).toMatchObject({
      mesesParciales: "mes_completo",
      diaCobro: 1,
      ultimoNumeroLiquidacion: 0,
      archivado: false,
      bloqueado: false,
    });
  });
});

describe("reglas de la base de datos", () => {
  it("el día de cobro está entre 1 y 28", async () => {
    const { id } = await nuevoUsuario();
    expect(
      await errorDe(
        bd.insert(t.inmueble).values({ usuarioId: id, nombre: "X", modalidad: "entero", diaCobro: 29 }),
      ),
    ).toMatch(/inmueble_dia_cobro/);
  });

  it("una ocupación no puede mezclar habitación e inquilino de inmuebles distintos", async () => {
    const usuario = await nuevoUsuario();
    const a = await nuevoInmueble(usuario.id);
    const b = await nuevoInmueble(usuario.id);
    const habitacionA = await nuevaHabitacion(a.id);
    const inquilinoB = await nuevoInquilino(b.id);

    expect(
      await errorDe(
        bd.insert(t.ocupacion).values({
          inmuebleId: a.id,
          habitacionId: habitacionA.id,
          inquilinoId: inquilinoB.id,
          entrada: "2026-01-01",
        }),
      ),
    ).toMatch(/ocupacion_inquilino_mismo_inmueble/);
  });

  it("la salida no puede ser anterior a la entrada", async () => {
    const inmueble = await nuevoInmueble();
    const habitacion = await nuevaHabitacion(inmueble.id);
    const inquilino = await nuevoInquilino(inmueble.id);
    expect(
      await errorDe(
        bd.insert(t.ocupacion).values({
          inmuebleId: inmueble.id,
          habitacionId: habitacion.id,
          inquilinoId: inquilino.id,
          entrada: "2026-03-10",
          salida: "2026-03-09",
        }),
      ),
    ).toMatch(/ocupacion_fechas/);
  });

  it("solo hay un cobro por inquilino y mes, aunque esté quitado", async () => {
    const inmueble = await nuevoInmueble();
    const inquilino = await nuevoInquilino(inmueble.id);
    const cobro = {
      inquilinoId: inquilino.id,
      mes: "2026-05",
      renta: 45_000,
      importe: 45_000,
      fechaCobro: "2026-05-01",
      origen: "auto" as const,
    };
    await bd.insert(t.cobroAlquiler).values({ ...cobro, quitadoEn: new Date() });
    expect(await errorDe(bd.insert(t.cobroAlquiler).values(cobro))).toMatch(/unique/i);
  });

  it("los meses tienen formato YYYY-MM", async () => {
    const inmueble = await nuevoInmueble();
    const habitacion = await nuevaHabitacion(inmueble.id);
    expect(
      await errorDe(
        bd.insert(t.precioHabitacion).values({ habitacionId: habitacion.id, desdeMes: "2026-13", precioMensual: 1 }),
      ),
    ).toMatch(/precio_habitacion_desde_mes/);
  });

  it("solo hay un enlace vigente por inquilino; los revocados se conservan", async () => {
    const inmueble = await nuevoInmueble();
    const inquilino = await nuevoInquilino(inmueble.id);
    await bd.insert(t.enlaceInquilino).values({ inquilinoId: inquilino.id, tokenHash: "h1", revocadoEn: new Date() });
    await bd.insert(t.enlaceInquilino).values({ inquilinoId: inquilino.id, tokenHash: "h2" });
    expect(
      await errorDe(bd.insert(t.enlaceInquilino).values({ inquilinoId: inquilino.id, tokenHash: "h3" })),
    ).toMatch(/enlace_inquilino_vigente/);
  });

  it("borrar un usuario borra en cascada sus inmuebles y lo que cuelga de ellos", async () => {
    const usuario = await nuevoUsuario();
    const otra = await nuevoInmueble();
    const inmueble = await nuevoInmueble(usuario.id);
    const habitacion = await nuevaHabitacion(inmueble.id);
    const inquilino = await nuevoInquilino(inmueble.id);
    await bd.insert(t.ocupacion).values({
      inmuebleId: inmueble.id,
      habitacionId: habitacion.id,
      inquilinoId: inquilino.id,
      entrada: "2026-01-01",
    });

    await bd.delete(t.usuario).where(eq(t.usuario.id, usuario.id));

    expect(await bd.select().from(t.inmueble).where(eq(t.inmueble.id, inmueble.id))).toEqual([]);
    expect(await bd.select().from(t.inquilino).where(eq(t.inquilino.id, inquilino.id))).toEqual([]);
    expect(await bd.select().from(t.ocupacion).where(eq(t.ocupacion.inmuebleId, inmueble.id))).toEqual([]);
    // Los datos de otros usuarios no se tocan.
    expect(await bd.select().from(t.inmueble).where(eq(t.inmueble.id, otra.id))).toHaveLength(1);
  });
});

describe("chequeo de salud con base de datos", () => {
  it("responde ok cuando la base de datos contesta", async () => {
    const app = crearApp({ comprobarBaseDatos: comprobadorBaseDatos(bd) });
    const respuesta = await app.request("/salud");
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ estado: "ok", baseDatos: "ok" });
  });

  it("responde 503 cuando la base de datos está cerrada", async () => {
    const cerrada = crearBd();
    await cerrada.$client.close();
    const app = crearApp({ comprobarBaseDatos: comprobadorBaseDatos(cerrada) });
    const respuesta = await app.request("/salud");
    expect(respuesta.status).toBe(503);
  });
});
