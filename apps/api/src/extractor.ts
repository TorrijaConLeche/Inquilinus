// Lectura de facturas con IA (spec 003, R2, R8 y R10). La implementación con
// Amazon Bedrock llega con la tarea 5.1; hasta entonces no hay extractor y las
// facturas quedan para rellenarlas a mano (R8b). En los tests se usa uno simulado.
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
