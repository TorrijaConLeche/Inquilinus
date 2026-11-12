import { describe, expect, it } from "vitest";
import { formatoTamano } from "../src/lib/ficheros";

describe("tamaño de los ficheros", () => {
  it("en KB por debajo de 1 MB y en MB por encima, según el idioma", () => {
    expect(formatoTamano(840_000, "es")).toBe("820 kB");
    expect(formatoTamano(2.4 * 1024 * 1024, "es")).toBe("2,4 MB");
    expect(formatoTamano(2.4 * 1024 * 1024, "en")).toBe("2.4 MB");
    expect(formatoTamano(12, "en")).toBe("0.1 kB");
  });
});
