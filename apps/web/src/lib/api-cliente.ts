"use client";
// Llamadas a la API (/api) desde el navegador. La cookie de sesión y la
// cabecera Origin las pone el navegador solo (misma web).
import { claveDeError, type ClaveError } from "./errores";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: ClaveError };

export async function pedirApi<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<Resultado<T>> {
  const metodo = opciones.metodo ?? (opciones.cuerpo === undefined ? "GET" : "POST");
  try {
    const respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: opciones.cuerpo === undefined ? {} : { "content-type": "application/json" },
      ...(opciones.cuerpo === undefined ? {} : { body: JSON.stringify(opciones.cuerpo) }),
    });
    const datos = await respuesta.json().catch(() => null);
    if (respuesta.ok) return { ok: true, datos: datos as T };
    return { ok: false, error: claveDeError((datos as { error?: string } | null)?.error) };
  } catch {
    return { ok: false, error: "generico" };
  }
}
