import { describe, expect, it } from "vitest";
import { elegirIdioma } from "../src/i18n/idiomas";

describe("elegirIdioma", () => {
  it("usa el idioma elegido en los ajustes por encima del navegador", () => {
    expect(elegirIdioma({ cookie: "en", acceptLanguage: "es-ES,es;q=0.9" })).toBe("en");
  });

  it("ignora una cookie con un idioma no soportado", () => {
    expect(elegirIdioma({ cookie: "fr", acceptLanguage: "en-GB" })).toBe("en");
  });

  it("sigue el orden de preferencia del navegador", () => {
    expect(elegirIdioma({ acceptLanguage: "fr-FR,en;q=0.8,es;q=0.5" })).toBe("en");
    expect(elegirIdioma({ acceptLanguage: "en;q=0.4,es-ES;q=0.9" })).toBe("es");
  });

  it("descarta idiomas con peso cero", () => {
    expect(elegirIdioma({ acceptLanguage: "en;q=0,es;q=0.1" })).toBe("es");
    expect(elegirIdioma({ acceptLanguage: "en;q=0" })).toBe("es");
  });

  it("usa español por defecto", () => {
    expect(elegirIdioma({})).toBe("es");
    expect(elegirIdioma({ acceptLanguage: "de-DE,fr;q=0.9" })).toBe("es");
    expect(elegirIdioma({ acceptLanguage: null })).toBe("es");
  });
});
