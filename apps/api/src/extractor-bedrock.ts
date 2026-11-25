// Lectura de facturas con Claude en Amazon Bedrock (spec 003, R2, R4, R8, R10 y R10b).
//
// - R10: a la IA solo llegan el PDF y los nombres de los tipos de gasto del inmueble.
// - R10b: solo en la UE. Se niega a montarse con una región o un modelo de fuera.
// - R4: la IA devuelve null en lo que no encuentra y lo que devuelve se valida aquí
//   y en `normalizarLectura`; nunca se completa nada por nuestra cuenta.
// - R8: cualquier fallo (rechazo, respuesta cortada o JSON que no encaja) lanza un
//   error y la factura queda para rellenar a mano. Los errores llevan solo un código:
//   nunca el contenido de la factura ni la respuesta de la IA (docs/rgpd.md).
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { importeDesdeTexto, type LecturaFactura } from "@inquilinus/domain";
import { z } from "zod";
import { LIMITE_LECTURA_MS, type ExtractorFacturas } from "./extractor.ts";
import type { Registro } from "./registro.ts";

/** Lo que el extractor manda a la IA: se construye aquí y se comprueba en los tests (R10). */
export interface PeticionLectura {
  model: string;
  max_tokens: number;
  system: string;
  messages: [
    {
      role: "user";
      content: [
        { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } },
        { type: "text"; text: string },
      ];
    },
  ];
  output_config: { effort?: "low"; format: { type: "json_schema"; schema: Record<string, unknown> } };
}

/** Lo que se usa de la respuesta de la IA. */
export interface RespuestaLectura {
  stop_reason: string | null;
  content: ReadonlyArray<{ type: string; text?: string }>;
}

/** El cliente de la IA, reducido a lo que se usa, para poder simularlo en los tests. */
export type EnviarLectura = (peticion: PeticionLectura) => Promise<RespuestaLectura>;

export class ErrorLectura extends Error {
  readonly codigo: string;
  constructor(codigo: string) {
    super(codigo);
    this.name = "ErrorLectura";
    this.codigo = codigo;
  }
}

/** Con el razonamiento adaptativo, el máximo incluye lo que piensa antes de responder. */
const MAXIMO_TOKENS = 4000;

const INSTRUCCIONES = `Lees facturas de suministros de una vivienda en España (luz, agua, gas, internet, comunidad…) y devuelves solo tres datos y una sugerencia.

- inicio y fin: el periodo de consumo que cubre la factura, en formato AAAA-MM-DD. Si la factura indica el periodo de facturación o de consumo con fechas, usa exactamente esas fechas. Solo si no lo indica, pero sí da las fechas de la lectura anterior y de la lectura actual, el periodo va de la lectura anterior a la actual. No son la fecha de emisión ni la de cargo, ni una etiqueta del periodo como "2025/4" o "4.º trimestre".
- importe: lo que de verdad se paga, es decir, el total a pagar con IVA después de descuentos, abonos, compensaciones y créditos. Cópialo tal como aparece escrito (por ejemplo "87,45"), sin el símbolo del euro. Si el total a pagar es cero, devuelve "0,00".
- tipoGasto: cuál de los tipos de gasto de la lista que te pasan corresponde a la factura, copiado exactamente como está en la lista.

Si un dato no aparece en la factura o no estás seguro de él, devuelve null en ese campo: la propietaria lo rellenará a mano, así que es mejor un null que un dato deducido. Si ningún tipo de la lista encaja con la factura, tipoGasto es null.`;

const textoONulo = (descripcion: string) => ({ anyOf: [{ type: "string", description: descripcion }, { type: "null" }] });
const fechaONula = (descripcion: string) => ({
  anyOf: [{ type: "string", format: "date", description: descripcion }, { type: "null" }],
});

/** Esquema fijo (la lista de tipos va en el mensaje) para que la IA lo reutilice entre facturas. */
const ESQUEMA = {
  type: "object",
  properties: {
    inicio: fechaONula("Primer día del periodo de la factura"),
    fin: fechaONula("Último día del periodo de la factura"),
    importe: textoONulo("Total a pagar tal como aparece escrito"),
    tipoGasto: textoONulo("Tipo de gasto copiado de la lista, o null si ninguno encaja"),
  },
  required: ["inicio", "fin", "importe", "tipoGasto"],
  additionalProperties: false,
} as const;

const Salida = z.object({
  inicio: z.string().nullable(),
  fin: z.string().nullable(),
  importe: z.string().nullable(),
  tipoGasto: z.string().nullable(),
});

/**
 * R10b: Claude Haiku 4.5 (el modelo provisional mientras AWS no habilite Haiku 5.5)
 * no admite el nivel de esfuerzo y responde con un 400 si se le pide.
 */
export function admiteEsfuerzo(modelo: string): boolean {
  return !modelo.includes("claude-haiku-4-5");
}

/** R10: la petición lleva el PDF y los nombres de los tipos de gasto; nada más. */
export function peticionLectura(modelo: string, pdf: Uint8Array, tiposGasto: string[]): PeticionLectura {
  return {
    model: modelo,
    max_tokens: MAXIMO_TOKENS,
    system: INSTRUCCIONES,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") },
          },
          { type: "text", text: `Tipos de gasto de la vivienda: ${JSON.stringify(tiposGasto)}` },
        ],
      },
    ],
    output_config: {
      ...(admiteEsfuerzo(modelo) ? { effort: "low" as const } : {}),
      format: { type: "json_schema", schema: ESQUEMA },
    },
  };
}

/** Pasa la respuesta de la IA a `LecturaFactura`, o lanza `ErrorLectura` si no se puede usar. */
export function lecturaDesdeRespuesta(respuesta: RespuestaLectura): LecturaFactura {
  if (respuesta.stop_reason === "refusal") throw new ErrorLectura("IA_RECHAZO");
  if (respuesta.stop_reason !== "end_turn") throw new ErrorLectura("IA_RESPUESTA_INCOMPLETA");
  const texto = respuesta.content.find((bloque) => bloque.type === "text")?.text;
  if (!texto) throw new ErrorLectura("IA_SIN_RESPUESTA");
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorLectura("IA_RESPUESTA_INVALIDA");
  }
  const salida = Salida.safeParse(datos);
  if (!salida.success) throw new ErrorLectura("IA_RESPUESTA_INVALIDA");
  const { inicio, fin, importe, tipoGasto } = salida.data;
  // R4: un importe que no se entiende sin ambigüedad se queda vacío.
  return { inicio, fin, importe: importe === null ? null : importeDesdeTexto(importe), tipoGasto };
}

export function crearExtractorBedrock(opciones: {
  modelo: string;
  enviar: EnviarLectura;
  registro?: Registro;
}): ExtractorFacturas {
  return {
    async leer(pdf, tiposGasto) {
      try {
        return lecturaDesdeRespuesta(await opciones.enviar(peticionLectura(opciones.modelo, pdf, tiposGasto)));
      } catch (error) {
        // Solo el código o el estado HTTP: el mensaje puede llevar parte de la respuesta.
        const codigo =
          error instanceof ErrorLectura
            ? error.codigo
            : typeof (error as { status?: unknown }).status === "number"
              ? `HTTP_${(error as { status: number }).status}`
              : "IA_NO_DISPONIBLE";
        opciones.registro?.aviso("lectura_ia_fallida", { codigo });
        throw error instanceof ErrorLectura ? error : new ErrorLectura(codigo);
      }
    },
  };
}

/**
 * R10b: solo regiones de la UE y modelos con el identificador base (`anthropic.…`)
 * o el perfil de inferencia de la UE (`eu.anthropic.…`), con o sin versión al final
 * (`…-v1:0`). El perfil global o los de
 * otras zonas (`global.`, `us.`…) podrían procesar la factura fuera de la UE.
 */
export function comprobarBedrockEnUe(region: string, modelo: string): void {
  if (!/^eu-[a-z]+-\d$/.test(region)) throw new ErrorLectura("BEDROCK_REGION_FUERA_DE_LA_UE");
  if (!/^(eu\.)?anthropic\.[a-z0-9.-]+(:\d+)?$/.test(modelo)) throw new ErrorLectura("BEDROCK_MODELO_FUERA_DE_LA_UE");
}

export interface ConfiguracionBedrock {
  region: string;
  modelo: string;
  idClave: string;
  claveSecreta: string;
  registro?: Registro;
}

/**
 * Usa el endpoint `bedrock-runtime` (InvokeModel): en la UE, Claude Haiku 5.5 no se
 * sirve por `bedrock-mantle` y solo está disponible con el perfil `eu.anthropic.…`.
 * Lo mismo vale para Claude Haiku 4.5, el modelo provisional.
 */
export function crearExtractorBedrockAws(configuracion: ConfiguracionBedrock): ExtractorFacturas {
  comprobarBedrockEnUe(configuracion.region, configuracion.modelo);
  const cliente = new AnthropicBedrock({
    awsRegion: configuracion.region,
    awsAccessKey: configuracion.idClave,
    awsSecretKey: configuracion.claveSecreta,
    // Sin esto, el SDK usaría AWS_BEARER_TOKEN_BEDROCK si existiera en el entorno.
    apiKey: null,
    // R8: más allá de 60 s la factura se rellena a mano; no tiene sentido esperar más.
    timeout: LIMITE_LECTURA_MS,
    maxRetries: 1,
  });
  return crearExtractorBedrock({
    modelo: configuracion.modelo,
    ...(configuracion.registro ? { registro: configuracion.registro } : {}),
    enviar: (peticion) => cliente.messages.create(peticion),
  });
}
