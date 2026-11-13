import { describe, expect, it } from "vitest";
import { esMes, formatoFecha, formatoMes, mesVecino } from "../src/lib/fechas";

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

describe("moverse entre meses", () => {
  it("mes anterior y siguiente, cambiando de año", () => {
    expect(mesVecino("2026-12", 1)).toBe("2027-01");
    expect(mesVecino("2026-01", -1)).toBe("2025-12");
    expect(mesVecino("2026-10", 0)).toBe("2026-10");
  });

  it("solo acepta meses válidos", () => {
    expect(esMes("2026-10")).toBe(true);
    expect(esMes("2026-13")).toBe(false);
    expect(esMes(undefined)).toBe(false);
  });
});
