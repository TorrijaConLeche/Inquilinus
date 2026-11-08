// Límite de intentos de acceso (spec 008, R11): tras 5 fallos en 15 minutos,
// por cuenta o por IP, se bloquean los intentos durante 15 minutos.
//
// Vive en la base de datos porque en Vercel cada petición puede ir a una
// instancia distinta. El email y la IP se guardan como huella HMAC con el
// secreto de la app: sirven para contar, pero no se pueden leer.
import { createHmac } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as esquema from "./bd/esquema.ts";

export const MAXIMO_FALLOS = 5;
export const VENTANA_MS = 15 * 60 * 1000;
export const BLOQUEO_MS = 15 * 60 * 1000;

type Bd = PgDatabase<PgQueryResultHKT, typeof esquema>;

export interface Limitador {
  /** Claves (huellas) de una cuenta y, si se conoce, de la IP. */
  claves(email: string, ip: string | null): { cuenta: string; ip?: string };
  estaBloqueado(claves: string[], ahora: Date): Promise<boolean>;
  registrarFallo(claves: string[], ahora: Date): Promise<void>;
  /** Tras un acceso correcto se olvidan los fallos de esa cuenta (no los de la IP). */
  olvidar(clave: string): Promise<void>;
}

export function crearLimitador(bd: Bd, secreto: string): Limitador {
  const huella = (tipo: string, valor: string) =>
    `${tipo}:${createHmac("sha256", secreto).update(`${tipo}:${valor}`).digest("base64url")}`;
  const t = esquema.intentoAcceso;

  return {
    claves(email, ip) {
      const cuenta = huella("cuenta", email.trim().toLowerCase());
      return ip ? { cuenta, ip: huella("ip", ip) } : { cuenta };
    },

    async estaBloqueado(claves, ahora) {
      if (claves.length === 0) return false;
      const filas = await bd
        .select({ bloqueadoHasta: t.bloqueadoHasta })
        .from(t)
        .where(inArray(t.clave, claves));
      return filas.some((f) => f.bloqueadoHasta !== null && f.bloqueadoHasta > ahora);
    },

    async registrarFallo(claves, ahora) {
      const momento = sql`${ahora.toISOString()}::timestamptz`;
      const inicioVentana = sql`${new Date(ahora.getTime() - VENTANA_MS).toISOString()}::timestamptz`;
      const finBloqueo = sql`${new Date(ahora.getTime() + BLOQUEO_MS).toISOString()}::timestamptz`;
      // Si el primer fallo cae fuera de la ventana, se empieza a contar de nuevo.
      const ventanaCaducada = sql`${t.primerFalloEn} < ${inicioVentana}`;
      const fallosNuevos = sql`case when ${ventanaCaducada} then 1 else ${t.fallos} + 1 end`;

      for (const clave of claves) {
        await bd
          .insert(t)
          .values({ clave, fallos: 1, primerFalloEn: ahora })
          .onConflictDoUpdate({
            target: t.clave,
            set: {
              fallos: fallosNuevos,
              primerFalloEn: sql`case when ${ventanaCaducada} then ${momento} else ${t.primerFalloEn} end`,
              bloqueadoHasta: sql`case when ${fallosNuevos} >= ${MAXIMO_FALLOS} then ${finBloqueo} else ${t.bloqueadoHasta} end`,
              actualizadoEn: ahora,
            },
          });
      }
    },

    async olvidar(clave) {
      await bd.delete(t).where(inArray(t.clave, [clave]));
    },
  };
}
