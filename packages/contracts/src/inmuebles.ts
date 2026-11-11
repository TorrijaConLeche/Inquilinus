import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { RespuestaError } from './comunes.ts';

// Inmuebles, habitaciones e historial de precios (spec 007).
// Importes en céntimos enteros; meses como `YYYY-MM`.

export const Mes = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .meta({ id: 'Mes', description: 'Mes natural `YYYY-MM`.', example: '2027-01' });

export const Centimos = z
  .number()
  .int()
  .nonnegative()
  .meta({ id: 'Centimos', description: 'Importe en céntimos de euro.', example: 50_000 });

export const Modalidad = z.enum(['entero', 'habitaciones']).meta({ id: 'Modalidad' });
export const MesesParciales = z.enum(['prorrateo', 'mes_completo']).meta({ id: 'MesesParciales' });

const texto = z.string().max(200);

// --- Peticiones -------------------------------------------------------------

export const NuevaHabitacion = z
  .object({
    nombre: texto,
    precioMensual: Centimos,
    /** R3: por defecto, el mes del alta. */
    desdeMes: Mes.optional(),
  })
  .meta({ id: 'NuevaHabitacion' });
export type NuevaHabitacion = z.infer<typeof NuevaHabitacion>;

/** R1: alta del inmueble. Las reglas (nombre, al menos una habitación…) las valida el dominio. */
export const AltaInmueble = z
  .object({
    nombre: texto,
    direccion: texto.nullable().optional(),
    modalidad: Modalidad,
    mesesParciales: MesesParciales.optional(),
    diaCobro: z.number().int().optional(),
    habitaciones: z.array(NuevaHabitacion).max(50),
  })
  .meta({ id: 'AltaInmueble' });
export type AltaInmueble = z.infer<typeof AltaInmueble>;

/** R2: la modalidad no se puede cambiar; el resto, sí. */
export const EdicionInmueble = z
  .strictObject({
    nombre: texto.optional(),
    direccion: texto.nullable().optional(),
    mesesParciales: MesesParciales.optional(),
    diaCobro: z.number().int().optional(),
  })
  .meta({ id: 'EdicionInmueble' });
export type EdicionInmueble = z.infer<typeof EdicionInmueble>;

export const EdicionHabitacion = z.strictObject({ nombre: texto }).meta({ id: 'EdicionHabitacion' });
export type EdicionHabitacion = z.infer<typeof EdicionHabitacion>;

/** R4: precio desde un mes, para ese mes y los siguientes. */
export const CambioPrecio = z
  .strictObject({ desdeMes: Mes, precioMensual: Centimos })
  .meta({ id: 'CambioPrecio' });
export type CambioPrecio = z.infer<typeof CambioPrecio>;

// --- Respuestas -------------------------------------------------------------

export const PrecioDesde = z.object({ desdeMes: Mes, precioMensual: Centimos }).meta({ id: 'PrecioDesde' });

export const Habitacion = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    archivada: z.boolean(),
    /** Precio del mes en curso (hora de Madrid); null si aún no tiene precio este mes. */
    precioActual: Centimos.nullable(),
    /** Del más antiguo al más reciente. */
    historialPrecios: z.array(PrecioDesde),
  })
  .meta({ id: 'Habitacion' });
export type Habitacion = z.infer<typeof Habitacion>;

export const Inmueble = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    direccion: z.string().nullable(),
    modalidad: Modalidad,
    mesesParciales: MesesParciales,
    diaCobro: z.number().int(),
    archivado: z.boolean(),
    bloqueado: z.boolean(),
    habitaciones: z.array(Habitacion),
  })
  .meta({ id: 'Inmueble' });
export type Inmueble = z.infer<typeof Inmueble>;

export const ResumenInmueble = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    direccion: z.string().nullable(),
    modalidad: Modalidad,
    archivado: z.boolean(),
    bloqueado: z.boolean(),
    numeroHabitaciones: z.number().int(),
  })
  .meta({ id: 'ResumenInmueble' });
export type ResumenInmueble = z.infer<typeof ResumenInmueble>;

export const ListaInmuebles = z.object({ inmuebles: z.array(ResumenInmueble) }).meta({ id: 'ListaInmuebles' });
export type ListaInmuebles = z.infer<typeof ListaInmuebles>;

// --- Rutas ------------------------------------------------------------------

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const errores = {
  '400': json(RespuestaError, 'Datos no válidos (el campo `error` lleva el código)'),
  '401': json(RespuestaError, 'Sin sesión'),
  '404': json(RespuestaError, 'No existe o es de otra cuenta'),
};
const cuerpo = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const idInmueble = z.object({ idInmueble: z.uuid() });
const idHabitacion = z.object({ idInmueble: z.uuid(), idHabitacion: z.uuid() });

export const rutasInmuebles = {
  '/inmuebles': {
    get: {
      operationId: 'listarInmuebles',
      summary: 'Inmuebles de la cuenta (sin los archivados, salvo ?archivados=true)',
      tags: ['Inmuebles'],
      requestParams: { query: z.object({ archivados: z.enum(['true', 'false']).optional() }) },
      responses: { '200': json(ListaInmuebles, 'Lista'), '401': errores['401'] },
    },
    post: {
      operationId: 'crearInmueble',
      summary: 'Alta del inmueble con sus habitaciones (spec 007, R1)',
      tags: ['Inmuebles'],
      requestBody: cuerpo(AltaInmueble),
      responses: { '201': json(Inmueble, 'Creado'), '400': errores['400'], '401': errores['401'] },
    },
  },
  '/inmuebles/{idInmueble}': {
    get: {
      operationId: 'verInmueble',
      summary: 'Detalle del inmueble con habitaciones e historial de precios',
      tags: ['Inmuebles'],
      requestParams: { path: idInmueble },
      responses: { '200': json(Inmueble, 'Detalle'), ...errores },
    },
    patch: {
      operationId: 'editarInmueble',
      summary: 'Editar nombre, dirección, meses parciales o día de cobro (la modalidad no, R2)',
      tags: ['Inmuebles'],
      requestParams: { path: idInmueble },
      requestBody: cuerpo(EdicionInmueble),
      responses: { '200': json(Inmueble, 'Editado'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/habitaciones': {
    post: {
      operationId: 'crearHabitacion',
      summary: 'Añadir una habitación con su precio (R3)',
      tags: ['Inmuebles'],
      requestParams: { path: idInmueble },
      requestBody: cuerpo(NuevaHabitacion),
      responses: { '201': json(Inmueble, 'Inmueble con la habitación nueva'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/habitaciones/{idHabitacion}': {
    patch: {
      operationId: 'editarHabitacion',
      summary: 'Renombrar una habitación',
      tags: ['Inmuebles'],
      requestParams: { path: idHabitacion },
      requestBody: cuerpo(EdicionHabitacion),
      responses: { '200': json(Inmueble, 'Editada'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/habitaciones/{idHabitacion}/precios': {
    post: {
      operationId: 'cambiarPrecio',
      summary: 'Precio desde un mes, para ese mes y los siguientes (R4)',
      tags: ['Inmuebles'],
      requestParams: { path: idHabitacion },
      requestBody: cuerpo(CambioPrecio),
      responses: { '200': json(Inmueble, 'Precio registrado'), ...errores },
    },
  },
} satisfies ZodOpenApiPathsObject;
