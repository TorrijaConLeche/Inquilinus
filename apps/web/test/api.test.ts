import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/[[...ruta]]/route";

describe("API montada en /api", () => {
  it("responde al chequeo de salud", async () => {
    const respuesta = await GET(new Request("http://localhost/api/salud"));
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ estado: "ok" });
  });

  it("devuelve 404 de la API para rutas desconocidas bajo /api", async () => {
    const respuesta = await GET(new Request("http://localhost/api/no-existe"));
    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toEqual({ error: "no-encontrado" });
  });
});
