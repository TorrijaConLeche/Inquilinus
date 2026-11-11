// Meses y fechas de negocio en pantalla, según el idioma. Las fechas son días
// naturales (`YYYY-MM-DD`) sin zona horaria: se formatean en UTC para que no
// cambie el día.

const localeDe = (idioma: string) => (idioma === "en" ? "en-GB" : "es-ES");

/** `2027-01` → «enero de 2027» / «January 2027». */
export function formatoMes(mes: string, idioma: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  return new Intl.DateTimeFormat(localeDe(idioma), { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(anio!, numero! - 1, 1)),
  );
}

/** `2026-10-15` → «15 oct 2026» / «15 Oct 2026». */
export function formatoFecha(fecha: string, idioma: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat(localeDe(idioma), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(anio!, mes! - 1, dia!)),
  );
}
