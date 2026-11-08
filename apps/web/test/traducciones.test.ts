import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";

type Mensajes = { [clave: string]: string | Mensajes };

function claves(mensajes: Mensajes, prefijo = ""): string[] {
  return Object.entries(mensajes).flatMap(([clave, valor]) =>
    typeof valor === "string" ? [prefijo + clave] : claves(valor, `${prefijo}${clave}.`),
  );
}

function textos(mensajes: Mensajes): string[] {
  return Object.values(mensajes).flatMap((v) => (typeof v === "string" ? [v] : textos(v)));
}

describe("traducciones", () => {
  it("es y en tienen exactamente las mismas claves", () => {
    expect(claves(en).sort()).toEqual(claves(es).sort());
  });

  it("ningún texto está vacío", () => {
    for (const mensajes of [es, en]) {
      for (const texto of textos(mensajes)) expect(texto.trim()).not.toBe("");
    }
  });
});
