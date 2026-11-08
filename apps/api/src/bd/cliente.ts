import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as esquema from "./esquema.ts";

/** Conexión a Neon por HTTP: funciona igual en local y en funciones de Vercel. */
export function crearBaseDatos(url: string) {
  return drizzle({ client: neon(url), schema: esquema, casing: "snake_case" });
}

export type BaseDatos = ReturnType<typeof crearBaseDatos>;

/** Para el chequeo de salud: lanza si la base de datos no responde. */
export function comprobadorBaseDatos(bd: { execute: (consulta: ReturnType<typeof sql>) => Promise<unknown> }) {
  return async () => {
    await bd.execute(sql`select 1`);
  };
}

/** Cualquier conexión de Drizzle a PostgreSQL con nuestro esquema: Neon en producción, PGlite en los tests. */
export type ConexionBd = import("drizzle-orm/pg-core").PgDatabase<import("drizzle-orm/pg-core").PgQueryResultHKT, typeof esquema>;
