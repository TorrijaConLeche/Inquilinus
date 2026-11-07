export type CodigoError =
  | 'FECHA_INVALIDA'
  | 'MES_INVALIDO'
  | 'PERIODO_INVALIDO'
  | 'IMPORTE_INVALIDO'
  | 'OCUPACION_INVALIDA'
  | 'SOLAPE_OCUPACIONES'
  | 'HABITACION_DESCONOCIDA';

/** Error de datos de entrada. Los cálculos nunca devuelven un resultado parcial. */
export class ErrorValidacion extends Error {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorValidacion';
    this.codigo = codigo;
  }
}
