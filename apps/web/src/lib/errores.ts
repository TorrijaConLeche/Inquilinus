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
  INVALID_TWO_FACTOR_COOKIE: "sesionCaducada",
  ACCOUNT_NOT_LINKED: "cuentaNoVinculada",
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
  | "sesionCaducada"
  | "cuentaNoVinculada"
  | "generico";

/** Acepta el código tal cual llega (`account_not_linked` en la URL tras Google, por ejemplo). */
export function claveDeError(codigo: string | null | undefined): ClaveError {
  if (!codigo) return "generico";
  return POR_CODIGO[codigo.toUpperCase()] ?? "generico";
}
