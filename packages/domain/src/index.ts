export { ErrorValidacion, type CodigoError } from './errores.ts';
export type { Fecha, Mes } from './fechas.ts';
export type { Ocupacion } from './presencia.ts';
export {
  repartirSuministro,
  type EntradaRepartoSuministro,
  type LineaRepartoSuministro,
  type ResultadoRepartoSuministro,
} from './suministros.ts';
export {
  calcularAlquilerMes,
  type EntradaAlquilerMes,
  type Habitacion,
  type LineaAlquiler,
  type MesesParciales,
  type Modalidad,
  type ResultadoAlquilerMes,
} from './alquiler.ts';
export type { TramoReparto } from './suministros.ts';
export { mesDe, diaDelMes, fechaEnMes, sumarMeses } from './fechas.ts';
export {
  TAMANO_MAXIMO_FACTURA,
  validarFicheroFactura,
  importeDesdeTexto,
  validarConfirmacion,
  facturasSolapadas,
  type BorradorFactura,
  type FacturaConfirmada,
  type FacturaExistente,
} from './facturas.ts';
export { MESES_VIGENCIA_TRAS_SALIDA, caducidadEnlace, enlaceDisponible } from './enlace.ts';
export {
  totalPendiente,
  cobradoEnMes,
  resumenPanel,
  marcarPagado,
  marcarTodoPagado,
  type Concepto,
  type PendientesInmueble,
  type PendientesInquilino,
  type ResumenPanel,
} from './pagos.ts';
