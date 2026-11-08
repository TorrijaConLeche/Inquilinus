// Monta las dependencias de la API a partir de las variables de entorno.
// Lo usan el servidor local (src/servidor.ts) y la web en Vercel (/api).
import type { Dependencias } from "./app.ts";
import { crearAuth } from "./auth.ts";
import { comprobadorBaseDatos, crearBaseDatos } from "./bd/cliente.ts";
import { crearEnviadorSes } from "./correo/enviador.ts";
import { crearRegistro, type Registro } from "./registro.ts";

type Entorno = Record<string, string | undefined>;

const conHttps = (host: string | undefined) => (host ? `https://${host}` : undefined);

/**
 * URL pública de la app. En Vercel sale de sus variables de sistema: la de
 * producción, o la de la rama en las previsualizaciones (la que se comparte).
 */
export function urlPublica(entorno: Entorno, porDefecto: string): string {
  if (entorno["BETTER_AUTH_URL"]) return entorno["BETTER_AUTH_URL"].replace(/\/$/, "");
  if (entorno["VERCEL_ENV"] === "production") {
    const produccion = conHttps(entorno["VERCEL_PROJECT_PRODUCTION_URL"]);
    if (produccion) return produccion;
  }
  return conHttps(entorno["VERCEL_BRANCH_URL"]) ?? conHttps(entorno["VERCEL_URL"]) ?? porDefecto;
}

/** Orígenes de Vercel que pueden llamar a la API además de la URL pública. */
export function origenesVercel(entorno: Entorno): string[] {
  return ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]
    .map((clave) => conHttps(entorno[clave]))
    .filter((origen): origen is string => origen !== undefined);
}

const VARIABLES_AUTH = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "APP_AWS_REGION",
  "APP_AWS_ACCESS_KEY_ID",
  "APP_AWS_SECRET_ACCESS_KEY",
  "EMAIL_REMITENTE",
] as const;

export function dependenciasDesdeEntorno(
  entorno: Entorno,
  opciones: { rutaBase: string; urlPorDefecto: string; registro?: Registro },
): Dependencias {
  const registro = opciones.registro ?? crearRegistro();
  const url = entorno["DATABASE_URL"];
  if (!url) return { registro };

  const bd = crearBaseDatos(url);
  const dependencias: Dependencias = { registro, comprobarBaseDatos: comprobadorBaseDatos(bd) };

  // Sin todas las variables, la API funciona pero sin cuentas (solo el nombre de lo que falta va al log).
  const faltan = VARIABLES_AUTH.filter((clave) => !entorno[clave]);
  if (faltan.length > 0) {
    registro.aviso("auth_desactivada", { codigo: `FALTA_${faltan[0]}` });
    return dependencias;
  }

  dependencias.auth = crearAuth({
    bd,
    registro,
    secreto: entorno["BETTER_AUTH_SECRET"]!,
    urlBase: urlPublica(entorno, opciones.urlPorDefecto),
    rutaBase: `${opciones.rutaBase}/auth`,
    origenesConfiables: origenesVercel(entorno),
    correo: crearEnviadorSes({
      region: entorno["APP_AWS_REGION"]!,
      idClave: entorno["APP_AWS_ACCESS_KEY_ID"]!,
      claveSecreta: entorno["APP_AWS_SECRET_ACCESS_KEY"]!,
      remitente: entorno["EMAIL_REMITENTE"]!,
    }),
  });
  return dependencias;
}
