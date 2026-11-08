// Preferencias guardadas en cookies técnicas (sin consentimiento: spec 008, R9).
export const COOKIE_TEMA = "tema";
export const TEMAS = ["sistema", "claro", "oscuro"] as const;
export type Tema = (typeof TEMAS)[number];

export function esTema(valor: unknown): valor is Tema {
  return typeof valor === "string" && (TEMAS as readonly string[]).includes(valor);
}

/** Guarda una preferencia un año. Solo se usa en el navegador. */
export function guardarPreferencia(nombre: string, valor: string) {
  document.cookie = `${nombre}=${encodeURIComponent(valor)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
