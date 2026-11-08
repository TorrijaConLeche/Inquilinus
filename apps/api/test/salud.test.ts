import { describe, expect, it, vi } from "vitest";
import { generarOpenApi, RespuestaError, RespuestaSalud } from "@inquilinus/contracts";
import { crearApp } from "../src/app.ts";

describe("chequeo de salud", () => {
  it("responde ok sin base de datos configurada", async () => {
    const respuesta = await crearApp().request("/salud");
    expect(respuesta.status).toBe(200);
    expect(RespuestaSalud.parse(await respuesta.json())).toEqual({ estado: "ok" });
  });

  it("responde ok cuando la base de datos contesta", async () => {
    const app = crearApp({ comprobarBaseDatos: async () => {} });
    const respuesta = await app.request("/salud");
    expect(respuesta.status).toBe(200);
    expect(RespuestaSalud.parse(await respuesta.json())).toEqual({ estado: "ok", baseDatos: "ok" });
  });

  it("responde 503 sin detalles cuando la base de datos falla", async () => {
    const app = crearApp({
      comprobarBaseDatos: async () => {
        throw new Error("postgres://usuario:secreto@host/bd");
      },
    });
    const respuesta = await app.request("/salud");
    expect(respuesta.status).toBe(503);
    const cuerpo = await respuesta.text();
    expect(RespuestaSalud.parse(JSON.parse(cuerpo))).toEqual({ estado: "error", baseDatos: "error" });
    expect(cuerpo).not.toContain("secreto");
  });
});

describe("errores", () => {
  it("devuelve 404 en JSON para rutas desconocidas", async () => {
    const respuesta = await crearApp().request("/no-existe");
    expect(respuesta.status).toBe(404);
    expect(RespuestaError.parse(await respuesta.json())).toEqual({ error: "no-encontrado" });
  });

  it("devuelve 500 genérico sin el mensaje del error ni en la respuesta ni en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = crearApp();
    app.get("/explota", () => {
      throw new Error("DNI 12345678Z");
    });
    const respuesta = await app.request("/explota");
    expect(respuesta.status).toBe(500);
    const cuerpo = await respuesta.text();
    expect(RespuestaError.parse(JSON.parse(cuerpo))).toEqual({ error: "interno" });
    expect(cuerpo).not.toContain("12345678Z");
    expect(log.mock.calls.flat().join(" ")).not.toContain("12345678Z");
    log.mockRestore();
  });
});

describe("OpenAPI", () => {
  it("sirve el documento generado desde los contratos", async () => {
    const respuesta = await crearApp().request("/openapi.json");
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual(JSON.parse(JSON.stringify(generarOpenApi())));
  });
});

describe("ruta base", () => {
  it("sirve todas las rutas bajo el prefijo indicado", async () => {
    const app = crearApp({}, { rutaBase: "/api" });
    expect((await app.request("/api/salud")).status).toBe(200);
    expect((await app.request("/api/openapi.json")).status).toBe(200);
    expect((await app.request("/salud")).status).toBe(404);
  });
});
