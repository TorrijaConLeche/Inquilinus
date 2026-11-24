// Monta las dependencias de la API a partir de las variables de entorno.
// Lo usan el servidor local (src/servidor.ts) y la web en Vercel (/api).
import { leerCortesias } from "@inquilinus/domain";
import { crearAlmacenS3 } from "./almacen.ts";
import type { Dependencias } from "./app.ts";
import { crearAuth } from "./auth.ts";
import { comprobadorBaseDatos, crearBaseDatos } from "./bd/cliente.ts";
import { crearEnviadorSes } from "./correo/enviador.ts";
import { crearExtractorBedrockAws, ErrorLectura } from "./extractor-bedrock.ts";
import { listaInvitados } from "./invitados.ts";
import { crearLimitador } from "./limitador.ts";
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
  const dependencias: Dependencias = { registro, bd, comprobarBaseDatos: comprobadorBaseDatos(bd) };
  // Advanced de cortesía (spec 010, R15). Las entradas mal escritas se cuentan, sin el email.
  const { cortesias, erroneas } = leerCortesias(entorno["PLAN_CORTESIA"]);
  dependencias.cortesias = cortesias;
  if (erroneas > 0) registro.aviso("plan_cortesia_erronea", { fallidos: erroneas });
  // Cron de Vercel (spec 005, R8b): Vercel manda este secreto en cada llamada.
  if (entorno["CRON_SECRET"]) dependencias.secretoCron = entorno["CRON_SECRET"];

  // Sin todas las variables, la API funciona pero sin cuentas (solo el nombre de lo que falta va al log).
  const faltan = VARIABLES_AUTH.filter((clave) => !entorno[clave]);
  if (faltan.length > 0) {
    registro.aviso("auth_desactivada", { codigo: `FALTA_${faltan[0]}` });
    return dependencias;
  }

  // Un solo limitador: lo usan el acceso (R11) y el borrado de la cuenta (R14).
  const limitador = crearLimitador(bd, entorno["BETTER_AUTH_SECRET"]!);
  dependencias.limitador = limitador;
  // Bucket privado de ficheros (spec 007, R6c): mismas credenciales de AWS que el correo.
  if (entorno["APP_S3_BUCKET"]) {
    dependencias.almacen = crearAlmacenS3({
      region: entorno["APP_AWS_REGION"]!,
      idClave: entorno["APP_AWS_ACCESS_KEY_ID"]!,
      claveSecreta: entorno["APP_AWS_SECRET_ACCESS_KEY"]!,
      bucket: entorno["APP_S3_BUCKET"],
    });
  } else {
    registro.aviso("almacen_desactivado", { codigo: "FALTA_APP_S3_BUCKET" });
  }
  // Lectura de facturas con IA (spec 003, R8b y R10b): solo con APP_BEDROCK_MODELO,
  // en la región de APP_BEDROCK_REGION (o la de AWS) y siempre en la UE.
  if (entorno["APP_BEDROCK_MODELO"]) {
    try {
      dependencias.extractor = crearExtractorBedrockAws({
        region: entorno["APP_BEDROCK_REGION"] ?? entorno["APP_AWS_REGION"]!,
        modelo: entorno["APP_BEDROCK_MODELO"],
        idClave: entorno["APP_AWS_ACCESS_KEY_ID"]!,
        claveSecreta: entorno["APP_AWS_SECRET_ACCESS_KEY"]!,
        registro,
      });
    } catch (error) {
      registro.aviso("lectura_ia_desactivada", {
        codigo: error instanceof ErrorLectura ? error.codigo : "BEDROCK_CONFIGURACION",
      });
    }
  }

  dependencias.auth = crearAuth({
    limitador,
    bd,
    registro,
    secreto: entorno["BETTER_AUTH_SECRET"]!,
    urlBase: urlPublica(entorno, opciones.urlPorDefecto),
    rutaBase: `${opciones.rutaBase}/auth`,
    origenesConfiables: origenesVercel(entorno),
    // Spec 008, R1b: sin la variable, nadie se registra; con "*", cualquiera.
    invitados: listaInvitados(entorno["REGISTRO_INVITADOS"]),
    // Google es opcional: sin sus dos variables, solo email y contraseña.
    ...(entorno["GOOGLE_CLIENT_ID"] && entorno["GOOGLE_CLIENT_SECRET"]
      ? { google: { idCliente: entorno["GOOGLE_CLIENT_ID"], secreto: entorno["GOOGLE_CLIENT_SECRET"] } }
      : {}),
    correo: crearEnviadorSes({
      region: entorno["APP_AWS_REGION"]!,
      idClave: entorno["APP_AWS_ACCESS_KEY_ID"]!,
      claveSecreta: entorno["APP_AWS_SECRET_ACCESS_KEY"]!,
      remitente: entorno["EMAIL_REMITENTE"]!,
    }),
  });
  return dependencias;
}
