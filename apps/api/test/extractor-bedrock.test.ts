// Spec 003 · tarea 5.2: extractor con Claude en Amazon Bedrock, con el cliente simulado.
import { describe, expect, it } from "vitest";
import { dependenciasDesdeEntorno } from "../src/configuracion.ts";
import {
  comprobarBedrockEnUe,
  crearExtractorBedrock,
  peticionLectura,
  ErrorLectura,
  lecturaDesdeRespuesta,
  type PeticionLectura,
  type RespuestaLectura,
} from "../src/extractor-bedrock.ts";
import { crearRegistro } from "../src/registro.ts";

const MODELO = "eu.anthropic.claude-haiku-5-5";
const pdf = new TextEncoder().encode("%PDF-1.7\nFactura de luz de Ana Pérez, calle Mayor 3\n%%EOF");
const respuesta = (datos: unknown, stop_reason = "end_turn"): RespuestaLectura => ({
  stop_reason,
  content: [{ type: "text", text: typeof datos === "string" ? datos : JSON.stringify(datos) }],
});

function simulado(r: RespuestaLectura | Error) {
  const peticiones: PeticionLectura[] = [];
  const lineas: string[] = [];
  const extractor = crearExtractorBedrock({
    modelo: MODELO,
    registro: crearRegistro((_n, l) => lineas.push(l)),
    enviar: async (p) => {
      peticiones.push(p);
      if (r instanceof Error) throw r;
      return r;
    },
  });
  return { extractor, peticiones, lineas };
}

describe("Spec 003 · Extractor con Bedrock", () => {
  it("C1 · la lectura de la IA pasa a fechas e importe en céntimos", async () => {
    const { extractor } = simulado(respuesta({ inicio: "2026-09-01", fin: "2026-09-30", importe: "87,45", tipoGasto: "Luz" }));
    await expect(extractor.leer(pdf, ["Luz", "Gas"])).resolves.toEqual({
      inicio: "2026-09-01",
      fin: "2026-09-30",
      importe: 8745,
      tipoGasto: "Luz",
    });
  });

  it("C2 · lo que la IA no encuentra, o un importe que no se entiende, se queda vacío (R4)", () => {
    expect(lecturaDesdeRespuesta(respuesta({ inicio: null, fin: null, importe: "unos 80", tipoGasto: null }))).toEqual({
      inicio: null,
      fin: null,
      importe: null,
      tipoGasto: null,
    });
    expect(lecturaDesdeRespuesta(respuesta({ inicio: null, fin: null, importe: "1.234,56 €", tipoGasto: null })).importe).toBe(
      123456,
    );
  });

  it("C22 · a la IA solo llegan el PDF y los nombres de los tipos de gasto (R10)", async () => {
    const { extractor, peticiones } = simulado(respuesta({ inicio: null, fin: null, importe: null, tipoGasto: null }));
    await extractor.leer(pdf, ["Luz", "Agua"]);
    expect(peticiones).toHaveLength(1);
    const p = peticiones[0]!;
    expect(p.model).toBe(MODELO);
    expect(p.messages).toHaveLength(1);
    const [documento, texto] = p.messages[0].content;
    expect(Buffer.from(documento.source.data, "base64").equals(Buffer.from(pdf))).toBe(true);
    expect(documento.source.media_type).toBe("application/pdf");
    expect(texto.text).toBe('Tipos de gasto de la vivienda: ["Luz","Agua"]');
    // Sin parámetros de muestreo (Claude Haiku 5.5 los rechaza) y con salida estructurada.
    expect(Object.keys(p).sort()).toEqual(["max_tokens", "messages", "model", "output_config", "system"]);
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.output_config.effort).toBe("low");
  });

  it("C23 · si la IA rechaza, corta la respuesta o devuelve algo que no encaja, falla con un código y sin datos (R8)", async () => {
    const casos: [RespuestaLectura | Error, string][] = [
      [respuesta({}, "refusal"), "IA_RECHAZO"],
      [respuesta('{"inicio": "2026-09-01"', "max_tokens"), "IA_RESPUESTA_INCOMPLETA"],
      [{ stop_reason: "end_turn", content: [] }, "IA_SIN_RESPUESTA"],
      [respuesta("no es JSON"), "IA_RESPUESTA_INVALIDA"],
      [respuesta({ inicio: 20260901, fin: null, importe: null, tipoGasto: null }), "IA_RESPUESTA_INVALIDA"],
      [Object.assign(new Error("Ana Pérez, calle Mayor 3"), { status: 503 }), "HTTP_503"],
      [new Error("Ana Pérez, calle Mayor 3"), "IA_NO_DISPONIBLE"],
    ];
    for (const [r, codigo] of casos) {
      const { extractor, lineas } = simulado(r);
      const error = await extractor.leer(pdf, ["Luz"]).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorLectura);
      expect((error as ErrorLectura).message).toBe(codigo);
      expect(lineas.join()).toContain(codigo);
      expect(lineas.join()).not.toContain("Ana");
    }
  });

  it("C24 · solo se activa en la UE: región europea y modelo base o perfil de la UE (R10b)", () => {
    expect(() => comprobarBedrockEnUe("eu-north-1", "eu.anthropic.claude-haiku-5-5")).not.toThrow();
    expect(() => comprobarBedrockEnUe("eu-central-1", "anthropic.claude-haiku-5-5")).not.toThrow();
    expect(() => comprobarBedrockEnUe("us-east-1", "anthropic.claude-haiku-5-5")).toThrow("BEDROCK_REGION_FUERA_DE_LA_UE");
    expect(() => comprobarBedrockEnUe("eu-north-1", "global.anthropic.claude-haiku-5-5")).toThrow(
      "BEDROCK_MODELO_FUERA_DE_LA_UE",
    );
    expect(() => comprobarBedrockEnUe("eu-north-1", "us.anthropic.claude-haiku-5-5")).toThrow("BEDROCK_MODELO_FUERA_DE_LA_UE");

    const completo = {
      DATABASE_URL: "postgresql://usuario:clave@ejemplo.test/bd",
      BETTER_AUTH_SECRET: "x".repeat(32),
      APP_AWS_REGION: "eu-north-1",
      APP_AWS_ACCESS_KEY_ID: "AKIAEJEMPLO",
      APP_AWS_SECRET_ACCESS_KEY: "clave",
      EMAIL_REMITENTE: "remitente@ejemplo.test",
    };
    const opciones = { rutaBase: "/api", urlPorDefecto: "http://localhost:3000" };
    // R8b: sin APP_BEDROCK_MODELO no hay lectura con IA.
    expect(dependenciasDesdeEntorno(completo, opciones).extractor).toBeUndefined();
    expect(dependenciasDesdeEntorno({ ...completo, APP_BEDROCK_MODELO: MODELO }, opciones).extractor).toBeDefined();
    const lineas: string[] = [];
    const fuera = dependenciasDesdeEntorno(
      { ...completo, APP_BEDROCK_MODELO: MODELO, APP_BEDROCK_REGION: "us-east-1" },
      { ...opciones, registro: crearRegistro((_n, l) => lineas.push(l)) },
    );
    expect(fuera.extractor).toBeUndefined();
    expect(lineas.join()).toContain("BEDROCK_REGION_FUERA_DE_LA_UE");
  });

  it("C24b · el modelo provisional Haiku 4.5 se admite y su petición va sin nivel de esfuerzo (R10b)", () => {
    const provisional = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";
    expect(() => comprobarBedrockEnUe("eu-north-1", provisional)).not.toThrow();
    expect(() => comprobarBedrockEnUe("eu-north-1", "anthropic.claude-haiku-4-5-20251001-v1:0")).not.toThrow();
    expect(() => comprobarBedrockEnUe("eu-north-1", "global.anthropic.claude-haiku-4-5-20251001-v1:0")).toThrow(
      "BEDROCK_MODELO_FUERA_DE_LA_UE",
    );

    const conHaiku45 = peticionLectura(provisional, pdf, ["Luz"]);
    expect(conHaiku45.output_config).not.toHaveProperty("effort");
    expect(conHaiku45.output_config.format.type).toBe("json_schema");
    expect(peticionLectura(MODELO, pdf, ["Luz"]).output_config.effort).toBe("low");
  });
});
