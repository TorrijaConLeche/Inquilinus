// Importes: en la app siempre céntimos enteros; en pantalla, euros.

/**
 * Convierte lo que escribe el usuario en euros a céntimos enteros, o null si
 * no es un importe válido. Acepta coma o punto decimal y separador de miles:
 * "500", "500,5", "500.50", "1.250,00", "1,250.00", "€ 45".
 */
export function eurosACentimos(texto: string): number | null {
  const limpio = texto.replace(/[€\s]/g, "");
  if (!/^\d{1,3}([.,]?\d{3})*([.,]\d{1,2})?$/.test(limpio) && !/^\d+([.,]\d{1,2})?$/.test(limpio)) return null;
  // El último separador seguido de 1 o 2 cifras es el decimal; los demás, de miles.
  const decimal = /[.,](\d{1,2})$/.exec(limpio);
  const entera = (decimal ? limpio.slice(0, decimal.index) : limpio).replace(/[.,]/g, "");
  const centimos = Number(entera) * 100 + (decimal ? Number(decimal[1]!.padEnd(2, "0")) : 0);
  return Number.isSafeInteger(centimos) ? centimos : null;
}

/** Céntimos a texto con euros según el idioma: 1.030,45 € (es) o €1,030.45 (en). */
export function formatoEuros(centimos: number, idioma: string): string {
  return new Intl.NumberFormat(idioma === "en" ? "en-IE" : "es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: centimos % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(centimos / 100);
}
