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
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getIP,
  getOAuthState,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as esquema from "./bd/esquema.ts";
import type { EnviadorCorreo } from "./correo/enviador.ts";
import { componerCodigo, componerCorreo } from "./correo/plantillas.ts";
import { BLOQUEO_MS, crearLimitador, MAXIMO_FALLOS, type Limitador } from "./limitador.ts";
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
  /** Limitador de intentos compartido con el borrado de cuentas. Si no se pasa, se crea uno. */
  limitador?: Limitador;
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

/** R8: con "recordar este dispositivo", la sesión dura 30 días y no se alarga. */
export const DURACION_SESION_S = 30 * 24 * 60 * 60;

export function crearAuth(config: ConfigAuth) {
  const { correo, registro } = config;
  const limitador = config.limitador ?? crearLimitador(config.bd, config.secreto);

  /** Un fallo de SES no debe romper el registro ni filtrar datos al log. */
  const enviarSeguro = async (mensaje: Parameters<EnviadorCorreo["enviar"]>[0]) => {
    try {
      await correo.enviar(mensaje);
    } catch (error) {
      registro.aviso("correo_no_enviado", describirError(error));
    }
  };
  const enviar = (...args: Parameters<typeof componerCorreo>) => enviarSeguro(componerCorreo(...args));

  /** ¿Tiene el doble factor con app ya confirmado? Entonces no hay código por email (R7). */
  const usaApp = async (usuarioId: string) => {
    const [fila] = await config.bd
      .select({ id: esquema.dobleFactor.id })
      .from(esquema.dobleFactor)
      .where(and(eq(esquema.dobleFactor.usuarioId, usuarioId), eq(esquema.dobleFactor.verificado, true)))
      .limit(1);
    return Boolean(fila);
  };

  /**
   * Usuario que está en el segundo paso del acceso: el de la sesión si ya la
   * hay, o el de la cookie firmada que Better Auth deja tras la contraseña.
   */
  const usuarioDelSegundoPaso = async (ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]) => {
    const sesion = await getSessionFromCtx(ctx).catch(() => null);
    if (sesion) return sesion.user.id;
    const cookie = ctx.context.createAuthCookie("two_factor");
    const firmada = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    if (!firmada) return null;
    const verificacion = await ctx.context.internalAdapter.findVerificationValue(firmada);
    return verificacion?.value ?? null;
  };

  /** Claves del limitador para un intento de acceso con email (cuenta e IP). */
  const clavesDeIntento = (ctx: {
    body?: unknown;
    request?: Request | undefined;
    headers?: Headers | undefined;
    context: { options: BetterAuthOptions };
  }) => {
    const email = (ctx.body as { email?: unknown } | undefined)?.email;
    if (typeof email !== "string") return null;
    const origen = ctx.request ?? ctx.headers;
    const ip = origen ? getIP(origen, ctx.context.options) : null;
    return limitador.claves(email, ip);
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
        dobleFactor: esquema.dobleFactor,
      },
    }),
    advanced: {
      database: { generateId: "uuid" },
      // Cookie de sesión HttpOnly, SameSite=Lax y Secure en https (R9).
      cookiePrefix: "inquilinus",
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // R7: con la app activa no se puede pedir ni usar un código por email.
        // Se corta aquí porque Better Auth guarda el código antes de enviarlo.
        if (ctx.path === "/two-factor/send-otp" || ctx.path === "/two-factor/verify-otp") {
          const usuarioId = await usuarioDelSegundoPaso(ctx);
          if (usuarioId && (await usaApp(usuarioId))) {
            throw new APIError("FORBIDDEN", {
              code: "METODO_NO_PERMITIDO",
              message: "Esta cuenta usa una app de autenticación.",
            });
          }
          return;
        }

        // R11: límite de intentos con email y contraseña, por cuenta y por IP.
        if (ctx.path !== "/sign-in/email") return;
        const claves = clavesDeIntento(ctx);
        if (!claves) return;
        if (await limitador.estaBloqueado(Object.values(claves), new Date())) {
          throw new APIError("TOO_MANY_REQUESTS", {
            code: "DEMASIADOS_INTENTOS",
            message: "Demasiados intentos. Prueba de nuevo en 15 minutos.",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const claves = clavesDeIntento(ctx);
        if (!claves) return;
        const resultado = ctx.context.returned;
        if (isAPIError(resultado)) {
          if (resultado.body?.code === "INVALID_EMAIL_OR_PASSWORD") {
            await limitador.registrarFallo(Object.values(claves), new Date());
          }
        } else {
          await limitador.olvidar(claves.cuenta);
        }
      }),
    },

    plugins: [
      // R7: doble factor opcional con app de autenticación y códigos de
      // recuperación. Tras 5 códigos fallidos seguidos, 15 minutos de bloqueo (R11).
      twoFactor({
        issuer: "Inquilinus",
        accountLockout: { enabled: true, maxFailedAttempts: MAXIMO_FALLOS, durationSeconds: BLOQUEO_MS / 1000 },
        backupCodeOptions: { amount: 10 },
        // R7: código de 6 cifras por email, válido 5 minutos, guardado como hash.
        // Better Auth lo ofrece a cualquiera con doble factor; aquí se niega a
        // quien tiene la app, para no rebajar su protección a la del correo.
        otpOptions: {
          period: 5,
          digits: 6,
          allowedAttempts: MAXIMO_FALLOS,
          storeOTP: "hashed",
          sendOTP: async ({ user, otp }, ctx) => {
            // Segunda barrera: aunque el hook lo corta antes, nunca se envía a quien usa la app.
            if (await usaApp(user.id)) return;
            await enviarSeguro(componerCodigo(idiomaDe(ctx?.request), user.email, otp));
          },
        },
        schema: {
          user: { fields: { twoFactorEnabled: "dobleFactorActivo" } },
          twoFactor: {
            modelName: "dobleFactor",
            fields: {
              secret: "secreto",
              backupCodes: "codigosRecuperacion",
              userId: "usuarioId",
              verified: "verificado",
              failedVerificationCount: "fallosSeguidos",
              lockedUntil: "bloqueadoHasta",
            },
          },
        },
      }),
    ],

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
      // R8: 30 días exactos desde el acceso, sin renovar al usarla. Sin
      // "recordar" (rememberMe: false), la cookie es de sesión del navegador.
      expiresIn: DURACION_SESION_S,
      disableSessionRefresh: true,
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
