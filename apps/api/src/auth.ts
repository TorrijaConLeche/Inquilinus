// Cuenta e inicio de sesión con Better Auth (spec 008).
// - Tarea 2.3: registro con email y contraseña, verificación del email,
//   recuperación de contraseña y aceptación de los términos.
// - Tarea 2.4: inicio de sesión con Google y vinculación segura de cuentas.
import {
  COOKIE_IDIOMA,
  elegirIdioma,
  LONGITUD_MINIMA_CONTRASENA,
  VERSION_TERMINOS,
} from "@inquilinus/contracts";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, getOAuthState } from "better-auth/api";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as esquema from "./bd/esquema.ts";
import type { EnviadorCorreo } from "./correo/enviador.ts";
import { componerCorreo } from "./correo/plantillas.ts";
import { describirError, type Registro } from "./registro.ts";

export interface ConfigAuth {
  // Cualquier conexión de Drizzle a PostgreSQL: Neon en producción, PGlite en los tests.
  bd: PgDatabase<PgQueryResultHKT, typeof esquema>;
  correo: EnviadorCorreo;
  registro: Registro;
  /** Clave para firmar cookies y tokens (BETTER_AUTH_SECRET). */
  secreto: string;
  /** URL pública de la app, sin barra final (por ejemplo, https://inquilinus.vercel.app). */
  urlBase: string;
  /** Ruta donde se monta Better Auth (por ejemplo, /api/auth). */
  rutaBase: string;
  /** Otros orígenes desde los que se aceptan peticiones (previsualizaciones de Vercel). */
  origenesConfiables?: string[];
  /** Cliente OAuth de Google (tarea 2.2). Sin él, solo email y contraseña. */
  google?: { idCliente: string; secreto: string };
}

/**
 * Versión de los términos que acompaña al registro. Con email va en el cuerpo;
 * con Google, en los datos que la web pasa al iniciar el flujo (`additionalData`).
 */
async function versionTerminosAceptada(
  usuario: Record<string, unknown>,
  ruta: string | undefined,
): Promise<unknown> {
  if (ruta === "/sign-up/email") return usuario["terminosVersion"];
  if (ruta?.startsWith("/callback/")) return (await getOAuthState())?.["terminosVersion"];
  return undefined;
}

/** Idioma de los emails: el ajuste guardado en la cookie o el del navegador. */
function idiomaDe(peticion?: Request) {
  const cookies = peticion?.headers.get("cookie") ?? "";
  const cookie = cookies
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([nombre]) => nombre === COOKIE_IDIOMA)?.[1];
  return elegirIdioma({ cookie, acceptLanguage: peticion?.headers.get("accept-language") });
}

export function crearAuth(config: ConfigAuth) {
  const { correo, registro } = config;

  /** Un fallo de SES no debe romper el registro ni filtrar datos al log. */
  const enviar = async (...args: Parameters<typeof componerCorreo>) => {
    try {
      await correo.enviar(componerCorreo(...args));
    } catch (error) {
      registro.aviso("correo_no_enviado", describirError(error));
    }
  };

  return betterAuth({
    secret: config.secreto,
    baseURL: config.urlBase,
    basePath: config.rutaBase,
    trustedOrigins: config.origenesConfiables ?? [],
    database: drizzleAdapter(config.bd, {
      provider: "pg",
      schema: {
        usuario: esquema.usuario,
        sesion: esquema.sesion,
        metodoAcceso: esquema.metodoAcceso,
        verificacion: esquema.verificacion,
      },
    }),
    advanced: {
      database: { generateId: "uuid" },
      // Cookie de sesión HttpOnly, SameSite=Lax y Secure en https (R9).
      cookiePrefix: "inquilinus",
    },

    // Nombres de Better Auth → columnas en español.
    user: {
      modelName: "usuario",
      fields: {
        name: "nombre",
        emailVerified: "emailVerificado",
        image: "imagen",
        createdAt: "creadoEn",
        updatedAt: "actualizadoEn",
      },
      additionalFields: {
        terminosVersion: { type: "string", required: false, input: true },
        terminosAceptadosEn: { type: "date", required: false, input: false },
      },
    },
    session: {
      modelName: "sesion",
      fields: {
        userId: "usuarioId",
        expiresAt: "expiraEn",
        ipAddress: "ip",
        userAgent: "agenteUsuario",
        createdAt: "creadoEn",
        updatedAt: "actualizadoEn",
      },
    },
    account: {
      modelName: "metodoAcceso",
      fields: {
        userId: "usuarioId",
        accountId: "idEnProveedor",
        providerId: "proveedor",
        password: "contrasenaHash",
        accessToken: "tokenAcceso",
        refreshToken: "tokenRefresco",
        idToken: "tokenId",
        accessTokenExpiresAt: "tokenAccesoExpiraEn",
        refreshTokenExpiresAt: "tokenRefrescoExpiraEn",
        scope: "alcance",
        createdAt: "creadoEn",
        updatedAt: "actualizadoEn",
      },
      // R3: Google se vincula a una cuenta con el mismo email solo si Google
      // confirma el email y la cuenta existente ya lo tenía verificado. Así
      // nadie puede registrar el email de otra persona con su contraseña y
      // quedarse dentro cuando la dueña entre con Google.
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
      },
    },
    verification: {
      modelName: "verificacion",
      fields: {
        identifier: "identificador",
        value: "valor",
        expiresAt: "expiraEn",
        createdAt: "creadoEn",
        updatedAt: "actualizadoEn",
      },
    },

    emailAndPassword: {
      enabled: true,
      // R2: la cuenta no se puede usar hasta verificar el email.
      requireEmailVerification: true,
      autoSignIn: false,
      // R5: solo longitud mínima, sin reglas de composición.
      minPasswordLength: LONGITUD_MINIMA_CONTRASENA,
      maxPasswordLength: 128,
      // R6: enlace de un solo uso, válido 1 hora.
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, peticion) => {
        await enviar("recuperarContrasena", idiomaDe(peticion), user.email, url);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }, peticion) => {
        await enviar("verificarEmail", idiomaDe(peticion), user.email, url);
      },
    },

    // R1, R15: Google pide solo email y perfil básico (openid, email, profile).
    ...(config.google && {
      socialProviders: {
        google: {
          clientId: config.google.idCliente,
          clientSecret: config.google.secreto,
          prompt: "select_account" as const,
          // Sin foto (R15); el hook de creación también la deja vacía.
          mapProfileToUser: (perfil: { name?: string }) => ({ name: perfil.name ?? "", image: undefined }),
        },
      },
    }),

    databaseHooks: {
      user: {
        create: {
          // R4: toda cuenta nueva, con email o con Google, acepta la versión
          // vigente de los términos. Con Google desde la pantalla de acceso
          // no llega la versión y la cuenta no se crea: la web lleva al registro.
          before: async (usuario, contexto) => {
            const version = await versionTerminosAceptada(usuario, contexto?.path);
            if (version !== VERSION_TERMINOS) {
              throw new APIError("BAD_REQUEST", {
                code: "TERMINOS_NO_ACEPTADOS",
                message: "Hay que aceptar la política de privacidad y los términos.",
              });
            }
            return {
              data: {
                ...usuario,
                // R15: nunca se guarda la foto del proveedor.
                image: null,
                terminosVersion: version,
                terminosAceptadosEn: new Date(),
              },
            };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof crearAuth>;
