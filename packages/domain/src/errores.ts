export type CodigoError =
  | 'FECHA_INVALIDA'
  | 'MES_INVALIDO'
  | 'PERIODO_INVALIDO'
  | 'IMPORTE_INVALIDO'
  | 'OCUPACION_INVALIDA'
  | 'SOLAPE_OCUPACIONES'
  | 'HABITACION_DESCONOCIDA'
  | 'FICHERO_INVALIDO'
  | 'CAMPO_OBLIGATORIO'
  | 'NOMBRE_OBLIGATORIO'
  | 'SIN_HABITACIONES'
  | 'SIN_PRECIO'
  | 'DIA_COBRO_INVALIDO'
  | 'DEVOLUCION_INCOMPLETA'
  | 'DEVOLUCION_MAYOR_QUE_FIANZA'
  | 'DEVOLUCION_ANTES_DE_RECEPCION'
  | 'NOTAS_DEMASIADO_LARGAS'
  | 'MES_FUTURO'
  | 'PAGO_FUTURO'
  | 'RENTA_OBLIGATORIA';

/** Error de datos de entrada. Los cálculos nunca devuelven un resultado parcial. */
export class ErrorValidacion extends Error {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorValidacion';
    this.codigo = codigo;
  }
}
