export const IDIOMAS = ["es", "en"] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_POR_DEFECTO: Idioma = "es";

/** Cookie donde se guarda el idioma elegido en los ajustes. */
export const COOKIE_IDIOMA = "idioma";

export function esIdioma(valor: unknown): valor is Idioma {
  return typeof valor === "string" && (IDIOMAS as readonly string[]).includes(valor);
}

/**
 * El idioma elegido en los ajustes manda; si no hay, el del navegador
 * (cabecera Accept-Language, por orden de preferencia); si no, español.
 */
export function elegirIdioma(entrada: {
  cookie?: string | undefined;
  acceptLanguage?: string | null | undefined;
}): Idioma {
  if (esIdioma(entrada.cookie)) return entrada.cookie;

  const preferidos = (entrada.acceptLanguage ?? "")
    .split(",")
    .map((parte, posicion) => {
      const [etiqueta = "", ...parametros] = parte.trim().split(";");
      const q = parametros
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const peso = q ? Number(q.slice(2)) : 1;
      return {
        idioma: etiqueta.toLowerCase().split("-")[0],
        peso: Number.isNaN(peso) ? 0 : peso,
        posicion,
      };
    })
    .filter((p) => p.peso > 0)
    .sort((a, b) => b.peso - a.peso || a.posicion - b.posicion);

  return preferidos.map((p) => p.idioma).find(esIdioma) ?? IDIOMA_POR_DEFECTO;
}
