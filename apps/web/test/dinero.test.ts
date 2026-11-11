import { describe, expect, it } from "vitest";
import { eurosACentimos, formatoEuros } from "../src/lib/dinero";

describe("eurosACentimos", () => {
  it("entiende las formas habituales de escribir un importe", () => {
    expect(eurosACentimos("500")).toBe(50_000);
    expect(eurosACentimos("500,5")).toBe(50_050);
    expect(eurosACentimos("500,50")).toBe(50_050);
    expect(eurosACentimos("500.50")).toBe(50_050);
    expect(eurosACentimos("1.250,00")).toBe(125_000);
    expect(eurosACentimos("1,250.00")).toBe(125_000);
    expect(eurosACentimos("1.250")).toBe(125_000);
    expect(eurosACentimos("5,555")).toBe(555_500); // coma de miles, como "1.250"
    expect(eurosACentimos(" 45 € ")).toBe(4_500);
    expect(eurosACentimos("0")).toBe(0);
  });

  it("rechaza lo que no es un importe", () => {
    for (const malo of ["", "abc", "-5", "5,5555", "1..2", "5e3", "12,3,4"]) expect(eurosACentimos(malo), malo).toBeNull();
  });

  it("nunca pierde céntimos por los decimales de coma flotante", () => {
    expect(eurosACentimos("0,29")).toBe(29);
    expect(eurosACentimos("1234567,89")).toBe(123_456_789);
  });
});

describe("formatoEuros", () => {
  it("formatea según el idioma", () => {
    expect(formatoEuros(103_045, "es").replace(/\s/g, " ")).toBe("1030,45 €");
    expect(formatoEuros(50_000, "es").replace(/\s/g, " ")).toBe("500 €");
    expect(formatoEuros(103_045, "en")).toBe("€1,030.45");
  });
});
