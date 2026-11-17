import { COLORES_GASTO, primerColorLibre } from "@inquilinus/contracts";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";

// Spec 006, R7–R9 y docs/estilo.md («Colores de gasto»).
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const modulo = readFileSync(new URL("../src/componentes/colores.module.css", import.meta.url), "utf8");

/** Los tokens de cada bloque de tema: claro, oscuro del dispositivo y oscuro fijado. */
function bloques(): { claro: Map<string, string>; oscuroDispositivo: Map<string, string>; oscuroFijado: Map<string, string> } {
  const leer = (texto: string) =>
    new Map([...texto.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
  const claro = css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)"));
  const oscuroDispositivo = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf(':root[data-tema="oscuro"]'));
  const resto = css.slice(css.indexOf(':root[data-tema="oscuro"]'));
  const oscuroFijado = resto.slice(0, resto.indexOf("}"));
  return { claro: leer(claro), oscuroDispositivo: leer(oscuroDispositivo), oscuroFijado: leer(oscuroFijado) };
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const colores = [...COLORES_GASTO.map((c) => `gasto-${c}`), "alquiler"];

describe("paleta de colores de gasto (spec 006, R7)", () => {
  it("cada color y el del alquiler tienen versión clara y oscura, también con el tema fijado", () => {
    for (const [tema, tokens] of Object.entries(bloques())) {
      for (const color of colores) {
        expect(tokens.get(color), `${tema}: --${color}`).toBeDefined();
        expect(tokens.get(`${color}-suave`), `${tema}: --${color}-suave`).toBeDefined();
      }
    }
  });

  it("el oscuro fijado es igual que el oscuro del dispositivo", () => {
    const { oscuroDispositivo, oscuroFijado } = bloques();
    for (const color of colores) {
      expect(oscuroFijado.get(color)).toBe(oscuroDispositivo.get(color));
      expect(oscuroFijado.get(`${color}-suave`)).toBe(oscuroDispositivo.get(`${color}-suave`));
    }
  });

  it("los colores se distinguen entre sí y el del alquiler no es de ningún gasto", () => {
    for (const tokens of Object.values(bloques())) {
      const fuertes = colores.map((c) => tokens.get(c));
      expect(new Set(fuertes).size).toBe(colores.length);
      expect(fuertes).not.toContain(tokens.get("primario"));
    }
  });

  it("contraste: el color con la superficie al menos 3:1 y el texto sobre el suave al menos 4,5:1", () => {
    for (const [tema, tokens] of Object.entries(bloques())) {
      for (const color of colores) {
        expect(contraste(tokens.get(color)!, tokens.get("superficie")!), `${tema}: ${color}`).toBeGreaterThanOrEqual(3);
        expect(contraste(tokens.get("texto")!, tokens.get(`${color}-suave`)!), `${tema}: ${color}-suave`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it("cada color tiene su clase y su nombre en es y en (R9: nunca va solo)", () => {
    for (const color of [...COLORES_GASTO, "alquiler"]) expect(modulo).toContain(`.${color} {`);
    for (const color of COLORES_GASTO) {
      expect(es.Detalle.colores[color]).toBeTruthy();
      expect(en.Detalle.colores[color]).toBeTruthy();
    }
  });
});

describe("color por defecto (spec 006, R7)", () => {
  it("C9 · un tipo nuevo recibe el primer color libre, nunca el del alquiler", () => {
    expect(primerColorLibre([])).toBe("ambar");
    expect(primerColorLibre(["ambar", "violeta"])).toBe("azul");
    expect(COLORES_GASTO).not.toContain("alquiler");
    // Con los ocho ocupados vuelve a empezar.
    expect(primerColorLibre([...COLORES_GASTO])).toBe("ambar");
    expect(primerColorLibre([...COLORES_GASTO, "ambar"])).toBe("azul");
  });
});
