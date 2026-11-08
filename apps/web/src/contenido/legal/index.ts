// Textos legales por idioma (tarea 2.8). Son contenido, no textos de interfaz:
// van aquí, fuera de los componentes, uno por idioma.
import type { Idioma } from "@inquilinus/contracts/idiomas";
import * as en from "./en";
import * as es from "./es";

export type DocumentoLegal = "privacidad" | "terminos";

const TEXTOS: Record<Idioma, Record<DocumentoLegal, string>> = { es, en };

export function textoLegal(documento: DocumentoLegal, idioma: Idioma): string {
  return TEXTOS[idioma][documento];
}
