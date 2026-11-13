import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Documento, Fianza } from './documentos.ts';

// Inquilinos, ocupaciones y tipos de gasto (spec 007). Fechas como día natural `YYYY-MM-DD`.

export { Fecha };

/**
 * Colores de los tipos de gasto (spec 006, R7), en el orden en que se asignan
 * por defecto. Son nombres: el tono exacto, en claro y oscuro, lo define la
 * paleta de la web (tarea 6.1). El alquiler tiene su color propio, fuera de esta lista.
 */
export const COLORES_GASTO = ['ambar', 'azul', 'violeta', 'rosa', 'turquesa', 'oliva', 'coral', 'pizarra'] as const;
export const ColorGasto = z.enum(COLORES_GASTO).meta({ id: 'ColorGasto' });
export type ColorGasto = z.infer<typeof ColorGasto>;

const texto = z.string().max(200);

// --- Peticiones -------------------------------------------------------------

export const NuevaOcupacion = z
  .strictObject({ habitacionId: z.uuid(), entrada: Fecha, salida: Fecha.nullable().optional() })
  .meta({ id: 'NuevaOcupacion' });
export type NuevaOcupacion = z.infer<typeof NuevaOcupacion>;

/** R6: del inquilino solo el nombre. Se puede dar de alta ya con su primera estancia. */
export const NuevoInquilino = z
  .strictObject({ nombre: texto, ocupacion: NuevaOcupacion.optional() })
  .meta({ id: 'NuevoInquilino' });
export type NuevoInquilino = z.infer<typeof NuevoInquilino>;

export const EdicionInquilino = z.strictObject({ nombre: texto }).meta({ id: 'EdicionInquilino' });
export type EdicionInquilino = z.infer<typeof EdicionInquilino>;

/** Corregir fechas o poner la salida (R9). `salida: null` la quita. */
export const EdicionOcupacion = z
  .strictObject({ entrada: Fecha.optional(), salida: Fecha.nullable().optional() })
  .meta({ id: 'EdicionOcupacion' });
export type EdicionOcupacion = z.infer<typeof EdicionOcupacion>;

/** R8: cerrar la estancia actual el día anterior a `fecha` y abrir otra en la habitación nueva desde `fecha`. */
export const CambioHabitacion = z
  .strictObject({ habitacionId: z.uuid(), fecha: Fecha })
  .meta({ id: 'CambioHabitacion' });
export type CambioHabitacion = z.infer<typeof CambioHabitacion>;

export const NuevoTipoGasto = z
  .strictObject({ nombre: texto, color: ColorGasto.optional() })
  .meta({ id: 'NuevoTipoGasto' });
export type NuevoTipoGasto = z.infer<typeof NuevoTipoGasto>;

/** R10: se puede renombrar y cambiar de color. R11: archivar o restaurar. */
export const EdicionTipoGasto = z
  .strictObject({ nombre: texto.optional(), color: ColorGasto.optional(), archivado: z.boolean().optional() })
  .meta({ id: 'EdicionTipoGasto' });
export type EdicionTipoGasto = z.infer<typeof EdicionTipoGasto>;

// --- Respuestas -------------------------------------------------------------

export const Ocupacion = z
  .object({ id: z.uuid(), habitacionId: z.uuid(), entrada: Fecha, salida: Fecha.nullable() })
  .meta({ id: 'Ocupacion' });
export type Ocupacion = z.infer<typeof Ocupacion>;

export const Inquilino = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    /** R12: borrado con historial; ya no se puede editar. */
    anonimizado: z.boolean(),
    /** R12: con cobros o repartos, borrarlo lo anonimiza; sin ellos, lo borra del todo. */
    conHistorial: z.boolean(),
    /** Ordenadas por entrada. */
    ocupaciones: z.array(Ocupacion),
    /** Como mucho uno de cada tipo (R6b). */
    documentos: z.array(Documento),
    fianza: Fianza.nullable(),
  })
  .meta({ id: 'Inquilino' });
export type Inquilino = z.infer<typeof Inquilino>;

export const ListaInquilinos = z.object({ inquilinos: z.array(Inquilino) }).meta({ id: 'ListaInquilinos' });
export type ListaInquilinos = z.infer<typeof ListaInquilinos>;

export const TipoGasto = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    color: ColorGasto,
    archivado: z.boolean(),
    /** R11: con facturas solo se puede archivar; sin ellas, borrar. */
    conFacturas: z.boolean(),
  })
  .meta({ id: 'TipoGasto' });
export type TipoGasto = z.infer<typeof TipoGasto>;

export const ListaTiposGasto = z.object({ tiposGasto: z.array(TipoGasto) }).meta({ id: 'ListaTiposGasto' });
export type ListaTiposGasto = z.infer<typeof ListaTiposGasto>;

/** R12: qué ha pasado al borrar un inquilino. */
export const BorradoInquilino = z
  .object({ resultado: z.enum(['anonimizado', 'borrado']) })
  .meta({ id: 'BorradoInquilino' });
export type BorradoInquilino = z.infer<typeof BorradoInquilino>;

// --- Rutas ------------------------------------------------------------------

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const cuerpo = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const errores = {
  '400': json(RespuestaError, 'Datos no válidos (el campo `error` lleva el código)'),
  '401': json(RespuestaError, 'Sin sesión'),
  '404': json(RespuestaError, 'No existe o es de otra cuenta'),
};
const enInmueble = z.object({ idInmueble: z.uuid() });
const conInquilino = enInmueble.extend({ idInquilino: z.uuid() });
const conOcupacion = enInmueble.extend({ idOcupacion: z.uuid() });
const conTipo = enInmueble.extend({ idTipoGasto: z.uuid() });

export const rutasInquilinos = {
  '/inmuebles/{idInmueble}/inquilinos': {
    get: {
      operationId: 'listarInquilinos',
      summary: 'Inquilinos del inmueble con sus estancias',
      tags: ['Inquilinos'],
      requestParams: { path: enInmueble },
      responses: { '200': json(ListaInquilinos, 'Lista'), ...errores },
    },
    post: {
      operationId: 'crearInquilino',
      summary: 'Alta de un inquilino, opcionalmente con su primera estancia (R6, R7)',
      tags: ['Inquilinos'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(NuevoInquilino),
      responses: { '201': json(Inquilino, 'Creado'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/inquilinos/{idInquilino}': {
    patch: {
      operationId: 'editarInquilino',
      summary: 'Cambiar el nombre',
      tags: ['Inquilinos'],
      requestParams: { path: conInquilino },
      requestBody: cuerpo(EdicionInquilino),
      responses: { '200': json(Inquilino, 'Editado'), ...errores },
    },
    delete: {
      operationId: 'borrarInquilino',
      summary: 'Derecho de supresión: anonimiza si tiene historial; si no, lo borra del todo (R12)',
      tags: ['Inquilinos'],
      requestParams: { path: conInquilino },
      responses: { '200': json(BorradoInquilino, 'Resultado'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/inquilinos/{idInquilino}/ocupaciones': {
    post: {
      operationId: 'crearOcupacion',
      summary: 'Nueva estancia en una habitación, sin solapes (R7)',
      tags: ['Inquilinos'],
      requestParams: { path: conInquilino },
      requestBody: cuerpo(NuevaOcupacion),
      responses: { '201': json(Inquilino, 'Inquilino con la estancia nueva'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/inquilinos/{idInquilino}/cambio-habitacion': {
    post: {
      operationId: 'cambiarHabitacion',
      summary: 'Cambio de habitación: cierra la estancia abierta y abre otra (R8)',
      tags: ['Inquilinos'],
      requestParams: { path: conInquilino },
      requestBody: cuerpo(CambioHabitacion),
      responses: { '200': json(Inquilino, 'Inquilino con las dos estancias'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/ocupaciones/{idOcupacion}': {
    patch: {
      operationId: 'editarOcupacion',
      summary: 'Corregir fechas o poner la salida (R9)',
      tags: ['Inquilinos'],
      requestParams: { path: conOcupacion },
      requestBody: cuerpo(EdicionOcupacion),
      responses: { '200': json(Inquilino, 'Inquilino actualizado'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/tipos-gasto': {
    get: {
      operationId: 'listarTiposGasto',
      summary: 'Tipos de gasto del inmueble',
      tags: ['Tipos de gasto'],
      requestParams: { path: enInmueble },
      responses: { '200': json(ListaTiposGasto, 'Lista'), ...errores },
    },
    post: {
      operationId: 'crearTipoGasto',
      summary: 'Nuevo tipo de gasto; sin color, recibe el primero libre (spec 006, R7)',
      tags: ['Tipos de gasto'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(NuevoTipoGasto),
      responses: { '201': json(TipoGasto, 'Creado'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/tipos-gasto/{idTipoGasto}': {
    patch: {
      operationId: 'editarTipoGasto',
      summary: 'Renombrar, cambiar de color, archivar o restaurar (R10, R11)',
      tags: ['Tipos de gasto'],
      requestParams: { path: conTipo },
      requestBody: cuerpo(EdicionTipoGasto),
      responses: { '200': json(TipoGasto, 'Editado'), ...errores },
    },
    delete: {
      operationId: 'borrarTipoGasto',
      summary: 'Borra un tipo de gasto sin facturas (R11)',
      tags: ['Tipos de gasto'],
      requestParams: { path: conTipo },
      responses: { '204': { description: 'Borrado' }, ...errores },
    },
  },
} satisfies ZodOpenApiPathsObject;
