// Fechas de negocio en hora de Madrid (spec 010, R3): la app es para España.

const formato = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día de hoy en Madrid, `YYYY-MM-DD`. */
export function hoyEnMadrid(ahora: Date = new Date()): string {
  return formato.format(ahora);
}

/** Mes en curso en Madrid, `YYYY-MM`. */
export function mesEnMadrid(ahora: Date = new Date()): string {
  return hoyEnMadrid(ahora).slice(0, 7);
}
