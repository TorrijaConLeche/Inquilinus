// Lectura de facturas con IA (spec 003, R2, R8 y R10). La implementación con
// Amazon Bedrock está en extractor-bedrock.ts y se activa con APP_BEDROCK_MODELO;
// sin ella no hay extractor y las facturas quedan para rellenarlas a mano (R8b).
// En los tests se usa uno simulado.
import type { LecturaFactura } from "@inquilinus/domain";

export interface ExtractorFacturas {
  /**
   * Lee una factura. R10: solo recibe el PDF y los nombres de los tipos de
   * gasto del inmueble, nunca otros datos del inmueble ni de los inquilinos.
   */
  leer(pdf: Uint8Array, tiposGasto: string[]): Promise<LecturaFactura>;
}

/** R8: si la IA tarda más de 60 segundos, se rellena a mano. */
export const LIMITE_LECTURA_MS = 60_000;

/** R12: cuántas facturas se leen a la vez, tope del lote y espera inicial antes de reintentar. */
export interface AjustesLectura {
  aLaVez: number;
  limiteLoteMs: number;
  esperaBaseMs: number;
}

export const AJUSTES_LECTURA: AjustesLectura = { aLaVez: 3, limiteLoteMs: 120_000, esperaBaseMs: 1_000 };

/** Lee con un límite de tiempo: si se pasa, falla como cualquier otro error. */
export async function leerConLimite(
  extractor: ExtractorFacturas,
  pdf: Uint8Array,
  tiposGasto: string[],
  limiteMs = LIMITE_LECTURA_MS,
): Promise<LecturaFactura> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error("LECTURA_LENTA")), limiteMs);
  });
  try {
    return await Promise.race([extractor.leer(pdf, tiposGasto), limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

/** Bedrock frena por exceso de peticiones (cuota por minuto de la cuenta). */
const esFrenada = (error: unknown) => (error as { codigo?: string } | null)?.codigo === "HTTP_429";

/**
 * R8 y R12: lee una factura y, si Bedrock frena, espera (1 s, 2 s, 4 s…, hasta 10 s, con algo
 * de azar para no reintentar todas a la vez) y lo vuelve a intentar. Nunca pasa de los 60 s.
 */
export async function leerConReintentos(
  extractor: ExtractorFacturas,
  pdf: Uint8Array,
  tiposGasto: string[],
  { limiteMs = LIMITE_LECTURA_MS, esperaBaseMs = AJUSTES_LECTURA.esperaBaseMs } = {},
): Promise<LecturaFactura> {
  const fin = Date.now() + limiteMs;
  for (let intento = 0; ; intento++) {
    const quedan = fin - Date.now();
    if (quedan <= 0) throw new Error("LECTURA_LENTA");
    try {
      return await leerConLimite(extractor, pdf, tiposGasto, quedan);
    } catch (error) {
      const espera = Math.min(esperaBaseMs * 2 ** intento, 10_000) * (0.75 + Math.random() / 2);
      if (!esFrenada(error) || Date.now() + espera >= fin) throw error;
      await new Promise((resolver) => setTimeout(resolver, espera));
    }
  }
}

/**
 * R12: lee los elementos de `aLaVez` en `aLaVez` (en cuanto acaba uno, empieza el siguiente).
 * Pasado `limiteLoteMs` ya no empieza ninguno más; devuelve los que se han quedado sin empezar.
 * `leer` no debe lanzar: cada lectura gestiona su propio fallo (R8).
 */
export async function leerEnTandas<T>(
  elementos: readonly T[],
  leer: (elemento: T) => Promise<void>,
  { aLaVez, limiteLoteMs }: Pick<AjustesLectura, "aLaVez" | "limiteLoteMs">,
): Promise<T[]> {
  const inicio = Date.now();
  let siguiente = 0;
  const lector = async () => {
    while (siguiente < elementos.length && Date.now() - inicio < limiteLoteMs) {
      await leer(elementos[siguiente++]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(aLaVez, elementos.length) }, lector));
  return elementos.slice(siguiente);
}
