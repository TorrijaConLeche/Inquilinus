import { describe, expect, it } from "vitest";
import { crearApp } from "../src/app.ts";
import { crearRegistro, describirError, type Campos, type Nivel } from "../src/registro.ts";

function capturar() {
  const lineas: { nivel: Nivel; datos: Record<string, unknown>; texto: string }[] = [];
  const registro = crearRegistro((nivel, texto) => lineas.push({ nivel, datos: JSON.parse(texto), texto }));
  return { registro, lineas, todo: () => lineas.map((l) => l.texto).join("\n") };
}

class ErrorConCodigo extends Error {
  readonly codigo: string;

  constructor(mensaje: string, codigo: string) {
    super(mensaje);
    this.name = "ErrorValidacion";
    this.codigo = codigo;
  }
}

describe("registro", () => {
  it("escribe una línea JSON con momento, nivel, evento y campos", () => {
    const { registro, lineas } = capturar();
    registro.aviso("algo_paso", { ruta: "/salud", estado: 503 });
    expect(lineas).toHaveLength(1);
    expect(lineas[0]!.nivel).toBe("aviso");
    expect(lineas[0]!.datos).toMatchObject({ nivel: "aviso", evento: "algo_paso", ruta: "/salud", estado: 503 });
    expect(typeof lineas[0]!.datos["momento"]).toBe("string");
  });

  it("descarta los campos que no están en la lista permitida", () => {
    const { registro, todo } = capturar();
    const conIntrusos = { ruta: "/x", nombre: "Ana García", email: "ana@ejemplo.test" } as Campos;
    registro.info("peticion", conIntrusos);
    expect(todo()).not.toContain("Ana");
    expect(todo()).not.toContain("ejemplo.test");
  });

  it("no acepta texto libre como evento", () => {
    const { registro, lineas } = capturar();
    registro.error("Falló el inquilino Ana García");
    expect(lineas[0]!.datos["evento"]).toBe("evento_no_valido");
  });
});

describe("describirError", () => {
  it("guarda el tipo, el código de dominio y la pila, nunca el mensaje", () => {
    const campos = describirError(new ErrorConCodigo("DNI 12345678Z no válido", "FECHA_INVALIDA"));
    expect(campos.tipoError).toBe("ErrorValidacion");
    expect(campos.codigo).toBe("FECHA_INVALIDA");
    expect(campos.pila).toMatch(/^at /);
    expect(JSON.stringify(campos)).not.toContain("12345678Z");
  });

  it("toma el SQLSTATE y el tipo de la causa cuando un error envuelve a otro", () => {
    const causa = Object.assign(new Error("password authentication failed for user neondb_owner"), {
      name: "NeonDbError",
      code: "28P01",
    });
    const campos = describirError(new Error("Failed query: select 1", { cause: causa }));
    expect(campos).toMatchObject({ tipoError: "Error", tipoCausa: "NeonDbError", codigo: "28P01" });
    expect(JSON.stringify(campos)).not.toMatch(/neondb_owner|select 1/);
  });

  it("ignora códigos que no tienen forma de código", () => {
    const raro = Object.assign(new Error("x"), { codigo: "ana@ejemplo.test", code: "secreto123" });
    expect(describirError(raro).codigo).toBeUndefined();
  });

  it("describe valores que no son errores sin mostrarlos", () => {
    expect(describirError("Ana García")).toEqual({ tipoError: "string" });
  });
});

describe("registro en la API", () => {
  it("registra cada petición con el patrón de la ruta, nunca la URL real", async () => {
    const { registro, lineas } = capturar();
    const app = crearApp({ registro }, { rutaBase: "/api" });
    app.get("/inquilinos/:token", (c) => c.json({}));

    const respuesta = await app.request("/api/inquilinos/token-secreto?nombre=Ana");

    const linea = lineas.find((l) => l.datos["evento"] === "peticion")!;
    expect(linea.datos).toMatchObject({ metodo: "GET", ruta: "/api/inquilinos/:token", estado: 200 });
    expect(typeof linea.datos["duracionMs"]).toBe("number");
    expect(linea.texto).not.toMatch(/token-secreto|Ana/);
    expect(respuesta.headers.get("x-id-peticion")).toBe(linea.datos["idPeticion"]);
  });

  it("usa el id de petición de Vercel cuando llega", async () => {
    const { registro, lineas } = capturar();
    await crearApp({ registro }).request("/salud", { headers: { "x-vercel-id": "fra1::abc" } });
    expect(lineas[0]!.datos["idPeticion"]).toBe("fra1::abc");
  });

  it("registra los errores no controlados sin su mensaje", async () => {
    const { registro, lineas, todo } = capturar();
    const app = crearApp({ registro });
    app.get("/explota", () => {
      throw new Error("Factura de Ana García, DNI 12345678Z");
    });

    expect((await app.request("/explota")).status).toBe(500);

    const error = lineas.find((l) => l.nivel === "error")!;
    expect(error.datos).toMatchObject({ evento: "error_no_controlado", tipoError: "Error", ruta: "/explota" });
    expect(lineas.find((l) => l.datos["evento"] === "peticion")!.datos["estado"]).toBe(500);
    expect(todo()).not.toMatch(/Ana|12345678Z/);
  });

  it("registra por qué falla la base de datos sin datos de conexión", async () => {
    const { registro, lineas, todo } = capturar();
    const app = crearApp({
      registro,
      comprobarBaseDatos: async () => {
        throw Object.assign(new Error("postgres://usuaria:secreto@host/bd"), { code: "28P01" });
      },
    });

    expect((await app.request("/salud")).status).toBe(503);

    expect(lineas.find((l) => l.nivel === "aviso")!.datos).toMatchObject({
      evento: "base_datos_no_responde",
      codigo: "28P01",
    });
    expect(todo()).not.toContain("secreto");
  });
});
