import { describe, expect, it } from "vitest";
import { dependenciasDesdeEntorno, origenesVercel, urlPublica } from "../src/configuracion.ts";
import { crearRegistro } from "../src/registro.ts";

const LOCAL = "http://localhost:3000";

describe("urlPublica", () => {
  it("usa BETTER_AUTH_URL si está, sin barra final", () => {
    expect(urlPublica({ BETTER_AUTH_URL: "https://app.ejemplo.test/" }, LOCAL)).toBe("https://app.ejemplo.test");
  });

  it("en producción de Vercel usa el dominio de producción", () => {
    const entorno = {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "inquilinus.vercel.app",
      VERCEL_URL: "inquilinus-abc123.vercel.app",
    };
    expect(urlPublica(entorno, LOCAL)).toBe("https://inquilinus.vercel.app");
  });

  it("en una previsualización usa la URL de la rama, que es la que se comparte", () => {
    const entorno = {
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "inquilinus-git-feat-x.vercel.app",
      VERCEL_URL: "inquilinus-abc123.vercel.app",
    };
    expect(urlPublica(entorno, LOCAL)).toBe("https://inquilinus-git-feat-x.vercel.app");
  });

  it("fuera de Vercel usa la URL por defecto", () => {
    expect(urlPublica({}, LOCAL)).toBe(LOCAL);
  });
});

describe("origenesVercel", () => {
  it("admite las tres URL de un despliegue de Vercel", () => {
    expect(
      origenesVercel({
        VERCEL_URL: "a.vercel.app",
        VERCEL_BRANCH_URL: "b.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "c.vercel.app",
      }),
    ).toEqual(["https://a.vercel.app", "https://b.vercel.app", "https://c.vercel.app"]);
    expect(origenesVercel({})).toEqual([]);
  });
});

describe("dependenciasDesdeEntorno", () => {
  it("sin base de datos no hay chequeo de base de datos ni cuentas", () => {
    const d = dependenciasDesdeEntorno({}, { rutaBase: "/api", urlPorDefecto: LOCAL });
    expect(d.comprobarBaseDatos).toBeUndefined();
    expect(d.auth).toBeUndefined();
  });

  it("si falta alguna variable de las cuentas, avisa con su nombre (nunca su valor) y sigue sin cuentas", () => {
    const lineas: string[] = [];
    const registro = crearRegistro((_n, l) => lineas.push(l));
    const d = dependenciasDesdeEntorno(
      { DATABASE_URL: "postgresql://usuario:secreto@ejemplo.test/bd" },
      { rutaBase: "/api", urlPorDefecto: LOCAL, registro },
    );
    expect(d.comprobarBaseDatos).toBeDefined();
    expect(d.auth).toBeUndefined();
    expect(lineas.join()).toContain("FALTA_BETTER_AUTH_SECRET");
    expect(lineas.join()).not.toContain("secreto");
  });

  const completo = {
    DATABASE_URL: "postgresql://usuario:clave@ejemplo.test/bd",
    BETTER_AUTH_SECRET: "x".repeat(32),
    APP_AWS_REGION: "eu-north-1",
    APP_AWS_ACCESS_KEY_ID: "AKIAEJEMPLO",
    APP_AWS_SECRET_ACCESS_KEY: "clave",
    EMAIL_REMITENTE: "remitente@ejemplo.test",
  };

  it("con todas las variables monta las cuentas", () => {
    const d = dependenciasDesdeEntorno(completo, { rutaBase: "/api", urlPorDefecto: LOCAL });
    expect(d.auth).toBeDefined();
  });

  it("sin APP_S3_BUCKET no hay almacén de ficheros, y lo avisa", () => {
    const lineas: string[] = [];
    const registro = crearRegistro((_n, l) => lineas.push(l));
    const d = dependenciasDesdeEntorno(completo, { rutaBase: "/api", urlPorDefecto: LOCAL, registro });
    expect(d.almacen).toBeUndefined();
    expect(lineas.join()).toContain("FALTA_APP_S3_BUCKET");
  });

  it("CRON_SECRET activa los procesos del cron de Vercel", () => {
    expect(dependenciasDesdeEntorno(completo, { rutaBase: "/api", urlPorDefecto: LOCAL }).secretoCron).toBeUndefined();
    const d = dependenciasDesdeEntorno({ ...completo, CRON_SECRET: "x".repeat(32) }, { rutaBase: "/api", urlPorDefecto: LOCAL });
    expect(d.secretoCron).toBe("x".repeat(32));
  });

  it("con APP_S3_BUCKET monta el almacén de ficheros", () => {
    const d = dependenciasDesdeEntorno(
      { ...completo, APP_S3_BUCKET: "inquilinus-pruebas" },
      { rutaBase: "/api", urlPorDefecto: LOCAL },
    );
    expect(d.almacen).toBeDefined();
  });
});
