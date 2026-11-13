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
  // Documentos y fianza (spec 007, R6b–R6d).
  FICHERO_INVALIDO: "ficheroInvalido",
  SUBIDA_NO_ENCONTRADA: "subidaCaducada",
  "ALMACEN-NO-CONFIGURADO": "almacenNoConfigurado",
  DEVOLUCION_INCOMPLETA: "devolucionIncompleta",
  DEVOLUCION_MAYOR_QUE_FIANZA: "devolucionMayor",
  DEVOLUCION_ANTES_DE_RECEPCION: "devolucionAntesDeRecepcion",
  NOTAS_DEMASIADO_LARGAS: "notasLargas",
  // Archivar y borrar (spec 007, R11–R13).
  ALGUIEN_VIVIENDO: "alguienViviendo",
  ULTIMA_HABITACION: "ultimaHabitacion",
  HABITACION_CON_ESTANCIAS: "habitacionConEstancias",
  TIPO_GASTO_CON_FACTURAS: "tipoGastoConFacturas",
  INQUILINO_VIVIENDO: "inquilinoViviendo",
  INQUILINO_ANONIMIZADO: "inquilinoAnonimizado",
  CONFIRMACION_INCORRECTA: "confirmacionIncorrecta",
  // Cobros (spec 005).
  CONFIRMACION_NECESARIA: "confirmacionNecesaria",
  SIN_ESTANCIA_EN_EL_MES: "sinEstanciaEnElMes",
  MES_FUTURO: "mesFuturo",
  PAGO_FUTURO: "pagoFuturo",
  RENTA_OBLIGATORIA: "rentaObligatoria",
  COBRO_EXISTENTE: "cobroExistente",
  SIN_PRECIO: "sinPrecio",
  // Facturas (spec 003).
  DEMASIADAS_FACTURAS: "demasiadasFacturas",
  FACTURA_CONFIRMADA: "facturaConfirmada",
  CAMPO_OBLIGATORIO: "campoObligatorio",
  PERIODO_INVALIDO: "periodoInvalido",
  TIPO_GASTO_DESCONOCIDO: "tipoGastoDesconocido",
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
  | "ficheroInvalido"
  | "subidaCaducada"
  | "subidaFallida"
  | "almacenNoConfigurado"
  | "devolucionIncompleta"
  | "devolucionMayor"
  | "devolucionAntesDeRecepcion"
  | "notasLargas"
  | "alguienViviendo"
  | "ultimaHabitacion"
  | "habitacionConEstancias"
  | "tipoGastoConFacturas"
  | "inquilinoViviendo"
  | "inquilinoAnonimizado"
  | "confirmacionIncorrecta"
  | "confirmacionNecesaria"
  | "sinEstanciaEnElMes"
  | "mesFuturo"
  | "pagoFuturo"
  | "rentaObligatoria"
  | "cobroExistente"
  | "sinPrecio"
  | "demasiadasFacturas"
  | "facturaConfirmada"
  | "campoObligatorio"
  | "periodoInvalido"
  | "tipoGastoDesconocido"
  | "generico";

/** Acepta el código tal cual llega (`account_not_linked` en la URL tras Google, por ejemplo). */
export function claveDeError(codigo: string | null | undefined): ClaveError {
  if (!codigo) return "generico";
  return POR_CODIGO[codigo.toUpperCase()] ?? "generico";
}
