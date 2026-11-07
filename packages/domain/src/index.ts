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
