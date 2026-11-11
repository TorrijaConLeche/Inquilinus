// Códigos de error de la API → clave del texto en messages/*.json (sección "Errores").
// Los mensajes de Better Auth vienen en inglés; en pantalla siempre va nuestro texto.

const POR_CODIGO: Record<string, ClaveError> = {
  INVALID_EMAIL_OR_PASSWORD: "credenciales",
  EMAIL_NOT_VERIFIED: "emailSinVerificar",
  DEMASIADOS_INTENTOS: "demasiadosIntentos",
  TOO_MANY_REQUESTS: "demasiadosIntentos",
  ACCOUNT_TEMPORARILY_LOCKED: "demasiadosIntentos",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "demasiadosIntentos",
  PASSWORD_TOO_SHORT: "contrasenaCorta",
  PASSWORD_TOO_LONG: "contrasenaLarga",
  INVALID_PASSWORD: "contrasenaIncorrecta",
  TERMINOS_NO_ACEPTADOS: "terminos",
  INVALID_TOKEN: "enlaceNoValido",
  TOKEN_EXPIRED: "enlaceNoValido",
  INVALID_CODE: "codigoIncorrecto",
  INVALID_BACKUP_CODE: "codigoIncorrecto",
  OTP_HAS_EXPIRED: "codigoCaducado",
  INVALID_TWO_FACTOR_COOKIE: "sesionCaducada",
  ACCOUNT_NOT_LINKED: "cuentaNoVinculada",
  // Inmuebles e inquilinos (spec 007).
  NOMBRE_OBLIGATORIO: "nombreObligatorio",
  SIN_HABITACIONES: "sinHabitaciones",
  IMPORTE_INVALIDO: "importeInvalido",
  DIA_COBRO_INVALIDO: "diaCobroInvalido",
  PRECIO_INICIAL_FUTURO: "precioInicialFuturo",
  FECHA_INVALIDA: "fechaInvalida",
  OCUPACION_INVALIDA: "salidaAntesDeEntrada",
  SOLAPE_OCUPACIONES: "solape",
  HABITACION_DESCONOCIDA: "generico",
  DATOS_INVALIDOS: "datosInvalidos",
  SIN_ESTANCIA_ABIERTA: "sinEstanciaAbierta",
  MISMA_HABITACION: "mismaHabitacion",
  CAMBIO_ANTES_DE_LA_ENTRADA: "cambioAntesDeEntrada",
};

export type ClaveError =
  | "credenciales"
  | "emailSinVerificar"
  | "demasiadosIntentos"
  | "contrasenaCorta"
  | "contrasenaLarga"
  | "contrasenaIncorrecta"
  | "terminos"
  | "enlaceNoValido"
  | "codigoIncorrecto"
  | "codigoCaducado"
  | "sesionCaducada"
  | "cuentaNoVinculada"
  | "nombreObligatorio"
  | "sinHabitaciones"
  | "importeInvalido"
  | "diaCobroInvalido"
  | "precioInicialFuturo"
  | "fechaInvalida"
  | "salidaAntesDeEntrada"
  | "solape"
  | "datosInvalidos"
  | "sinEstanciaAbierta"
  | "mismaHabitacion"
  | "cambioAntesDeEntrada"
  | "generico";

/** Acepta el código tal cual llega (`account_not_linked` en la URL tras Google, por ejemplo). */
export function claveDeError(codigo: string | null | undefined): ClaveError {
  if (!codigo) return "generico";
  return POR_CODIGO[codigo.toUpperCase()] ?? "generico";
}
