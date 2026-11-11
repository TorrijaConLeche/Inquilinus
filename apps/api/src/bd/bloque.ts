// Varias escrituras como una sola: o se guardan todas o ninguna.
//
// El driver HTTP de Neon no admite transacciones interactivas, pero sí un lote
// de consultas en una transacción (`batch`). Por eso los ids se generan antes
// (crypto.randomUUID) y las consultas no dependen unas de otras. PGlite (los
// tests) no tiene `batch`: allí se usa una transacción normal.
//
// Las consultas se construyen con la conexión que se recibe (`bd` en el lote,
// la de la transacción en PGlite): si se construyeran sobre otra, esperarían a
// que terminase la transacción y esta a ellas.
import type { BatchItem } from "drizzle-orm/batch";
import type { ConexionBd } from "./cliente.ts";

type ConBatch = { batch: (consultas: [BatchItem<"pg">, ...BatchItem<"pg">[]]) => Promise<unknown> };

export async function ejecutarEnBloque(
  bd: ConexionBd,
  construir: (conexion: ConexionBd) => BatchItem<"pg">[],
): Promise<void> {
  if ("batch" in bd && typeof (bd as unknown as ConBatch).batch === "function") {
    const consultas = construir(bd);
    if (consultas.length > 0) await (bd as unknown as ConBatch).batch(consultas as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    return;
  }
  await bd.transaction(async (tx) => {
    for (const consulta of construir(tx as unknown as ConexionBd)) await consulta;
  });
}
