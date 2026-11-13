// Procesos programados que lanza el cron de Vercel (spec 005, R8 y R8b).
// Vercel llama con GET y la cabecera `Authorization: Bearer <CRON_SECRET>`.
import type { RespuestaError } from "@inquilinus/contracts";
import type { Hono } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ConexionBd } from "../bd/cliente.ts";
import { generarCobrosDelDia } from "../cobros.ts";
import { hoyEnMadrid } from "../fechas.ts";
import type { Registro } from "../registro.ts";
import type { EntornoSesion } from "./comunes.ts";

/** Comparación en tiempo constante (las huellas igualan la longitud). */
function mismoSecreto(recibido: string, esperado: string): boolean {
  const huella = (texto: string) => createHash("sha256").update(texto).digest();
  return timingSafeEqual(huella(recibido), huella(esperado));
}

export function registrarRutasProcesos(
  app: Hono<EntornoSesion>,
  opciones: { bd: ConexionBd; secretoCron: string | undefined; ahora: () => Date; registro: Registro },
) {
  app.get("/procesos/cobros-diarios", async (c) => {
    // R8b: sin secreto configurado, el proceso está desactivado.
    if (!opciones.secretoCron) return c.json<RespuestaError>({ error: "proceso-desactivado" }, 503);
    const cabecera = c.req.header("authorization") ?? "";
    if (!mismoSecreto(cabecera, `Bearer ${opciones.secretoCron}`)) {
      return c.json<RespuestaError>({ error: "no-autorizado" }, 401);
    }

    const resumen = await generarCobrosDelDia(opciones.bd, hoyEnMadrid(opciones.ahora()));
    const idPeticion = c.get("idPeticion");
    for (const codigo of resumen.fallos) opciones.registro.aviso("cobro_diario_fallido", { idPeticion, codigo });
    opciones.registro.info("cobros_diarios", {
      idPeticion,
      inmuebles: resumen.inmuebles,
      creados: resumen.creados,
      fallidos: resumen.fallos.length,
    });
    c.header("cache-control", "no-store");
    return c.json({ inmuebles: resumen.inmuebles, creados: resumen.creados, fallidos: resumen.fallos.length });
  });
}
