// Ficheros en pantalla y subida directa al bucket (spec 007, R6b y R6c).
import type { PermisoSubida } from "@inquilinus/contracts";

/** Bytes a texto corto según el idioma: «820 KB», «2,4 MB». */
export function formatoTamano(bytes: number, idioma: string): string {
  const locale = idioma === "en" ? "en-GB" : "es-ES";
  const [valor, unidad] = bytes < 1024 * 1024 ? [bytes / 1024, "kilobyte"] : [bytes / (1024 * 1024), "megabyte"];
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: unidad,
    maximumFractionDigits: valor < 10 ? 1 : 0,
  }).format(Math.max(valor, 0.1));
}

/** Manda el fichero al bucket con el permiso firmado: primero los campos, el fichero al final. */
export async function subirAlBucket(permiso: PermisoSubida, fichero: File): Promise<boolean> {
  const formulario = new FormData();
  for (const [campo, valor] of Object.entries(permiso.campos)) formulario.append(campo, valor);
  formulario.append("file", fichero);
  try {
    const respuesta = await fetch(permiso.url, { method: "POST", body: formulario });
    return respuesta.ok;
  } catch {
    return false;
  }
}
