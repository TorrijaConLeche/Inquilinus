import { PRECIOS } from "@inquilinus/domain";
import { describe, expect, it } from "vitest";
import { preciosDePlanes } from "../src/lib/precios";

// Intl separa la cifra y el símbolo con un espacio duro.
const texto = (s: string | null) => s?.replace(/\s/g, " ") ?? null;

describe("Spec 010 · Página de precios", () => {
  it("C27 · los precios de la página son los de la app (R16, R16c)", () => {
    const planes = preciosDePlanes("es").map((p) => ({ ...p, mensual: texto(p.mensual), anual: texto(p.anual) }));
    expect(planes).toEqual([
      { plan: "starter", mensual: null, anual: null, mesesGratis: null, inmuebles: 1, facturasIaAlMes: 5 },
      { plan: "plus", mensual: "4,99 €", anual: "49,90 €", mesesGratis: 2, inmuebles: 3, facturasIaAlMes: 100 },
      { plan: "advanced", mensual: "9,99 €", anual: "99,90 €", mesesGratis: 2, inmuebles: 10, facturasIaAlMes: 100 },
    ]);
    // Salen de packages/domain: si cambia el precio, cambia la página.
    expect(PRECIOS.plus.mensual).toBe(499);
    expect(texto(preciosDePlanes("en")[1]!.mensual)).toBe("€4.99");
  });
});
