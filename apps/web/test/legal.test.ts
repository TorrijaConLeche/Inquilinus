import { IDIOMAS } from "@inquilinus/contracts/idiomas";
import { describe, expect, it } from "vitest";
import { textoLegal, type DocumentoLegal } from "../src/contenido/legal";

const DOCUMENTOS: DocumentoLegal[] = ["privacidad", "terminos"];
const secciones = (texto: string) => texto.split("\n").filter((l) => /^#{2,3} /.test(l)).length;

describe("textos legales", () => {
  it("existen en todos los idiomas", () => {
    for (const documento of DOCUMENTOS) {
      for (const idioma of IDIOMAS) expect(textoLegal(documento, idioma).trim().length).toBeGreaterThan(500);
    }
  });

  it("la traducción tiene las mismas secciones que el español", () => {
    for (const documento of DOCUMENTOS) {
      const es = secciones(textoLegal(documento, "es"));
      for (const idioma of IDIOMAS) expect(secciones(textoLegal(documento, idioma))).toBe(es);
    }
  });

  it("los huecos pendientes están marcados igual en cada idioma", () => {
    const huecos = (texto: string) => (texto.match(/\[(pendiente|pending):/g) ?? []).length;
    for (const documento of DOCUMENTOS) {
      const es = huecos(textoLegal(documento, "es"));
      for (const idioma of IDIOMAS) expect(huecos(textoLegal(documento, idioma))).toBe(es);
    }
  });
});
