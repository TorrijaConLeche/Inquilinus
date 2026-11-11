import { describe, expect, it } from "vitest";
import { formatoFecha, formatoMes } from "../src/lib/fechas";

describe("formato de meses y fechas", () => {
  it("meses según el idioma", () => {
    expect(formatoMes("2027-01", "es")).toBe("enero de 2027");
    expect(formatoMes("2027-01", "en")).toBe("January 2027");
  });

  it("fechas según el idioma, sin cambiar de día por la zona horaria", () => {
    expect(formatoFecha("2026-10-15", "es")).toMatch(/^15 oct\.? 2026$/);
    expect(formatoFecha("2026-10-15", "en")).toBe("15 Oct 2026");
    expect(formatoFecha("2026-01-01", "es")).toMatch(/^1 ene\.? 2026$/);
  });
});
