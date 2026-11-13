export { ErrorValidacion, type CodigoError } from './errores.ts';
export type { Fecha, Mes } from './fechas.ts';
export { aDia, desdeDia } from './fechas.ts';
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
  MAXIMO_FACTURAS_POR_LOTE,
  validarTamanoLote,
  normalizarLectura,
  type FacturaConfirmada,
  type FacturaExistente,
  type LecturaFactura,
  type PropuestaFactura,
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
export {
  validarDiaCobro,
  validarNombre,
  normalizarAltaInmueble,
  validarInquilino,
  precioVigente,
  mesesAfectadosPorCambioDePrecio,
  accionAlEliminar,
  nombreAnonimo,
  confirmaBorradoInmueble,
  estanciaVigente,
  esInquilinoAntiguo,
  TAMANO_MAXIMO_DOCUMENTO,
  LONGITUD_MAXIMA_NOTAS_FIANZA,
  validarDocumento,
  validarFianza,
  type DatosFianza,
  type FianzaValida,
  type AltaInmueble,
  type InmuebleNuevo,
  type PrecioDesde,
} from './gestion.ts';
export {
  cobrosQueFaltan,
  cobrosAGenerarHoy,
  inquilinosConCobroDesactualizado,
  recalcularPideConfirmacion,
  habitacionesDelMes,
  validarMesGenerable,
  validarFechaPago,
  validarFecha,
  importesEditados,
  cobroManual,
  type CobroGenerado,
  type EntradaCobros,
} from './cobros.ts';
/** Spec 001 R8 y spec 007 R7: valida las ocupaciones y devuelve sus tramos de presencia. */
export { calcularTramos as validarOcupaciones, type Tramo } from './presencia.ts';
export { fechaEnMadrid } from './fechas.ts';
export {
  LIMITES,
  PRECIOS,
  IVA_ESPANA,
  altaDeInmueble,
  puedeLeerConIa,
  mesDeUsoIa,
  inmueblesTrasBajada,
  puedeElegirInmuebleActivo,
  desgloseIva,
  type Plan,
  type Periodicidad,
} from './planes.ts';
