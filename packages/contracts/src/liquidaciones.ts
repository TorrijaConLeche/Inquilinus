import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Centimos, Mes } from './inmuebles.ts';
import { ParteGasto } from './repartos.ts';

// Liquidaciones (spec 011): facturas repartidas agrupadas con número y nombre.

// --- Peticiones -------------------------------------------------------------

/** R4 y R5: con unas facturas repartidas y sueltas. Sin nombre, el automático (R2) en `idioma` (R2b). */
export const NuevaLiquidacion = z
  .strictObject({
    facturaIds: z.array(z.uuid()).min(1).max(100),
    nombre: z.string().max(200).optional(),
    idioma: z.enum(['es', 'en']).optional(),
  })
  .meta({ id: 'NuevaLiquidacion' });
export type NuevaLiquidacion = z.infer<typeof NuevaLiquidacion>;

/** R2 y R6: renombrar, añadir o quitar facturas; con partes pagadas, cambiar facturas pide `confirmar`. */
export const EdicionLiquidacion = z
  .strictObject({
    nombre: z.string().max(200).optional(),
    anadir: z.array(z.uuid()).max(100).optional(),
    quitar: z.array(z.uuid()).max(100).optional(),
    confirmar: z.boolean().optional(),
  })
  .meta({ id: 'EdicionLiquidacion' });
export type EdicionLiquidacion = z.infer<typeof EdicionLiquidacion>;

/** R10: «Marcar pagada» para un inquilino (por defecto, hoy). */
export const PagoLiquidacion = z
  .strictObject({ inquilinoId: z.uuid(), fecha: Fecha.optional() })
  .meta({ id: 'PagoLiquidacion' });
export type PagoLiquidacion = z.infer<typeof PagoLiquidacion>;

// --- Respuestas -------------------------------------------------------------

export const EstadoLiquidacion = z.enum(['pagada', 'parcial', 'pendiente']).meta({ id: 'EstadoLiquidacion' });

/** R8 y R9: lo de un inquilino en la liquidación. */
export const InquilinoEnLiquidacion = z
  .object({
    inquilinoId: z.uuid(),
    total: Centimos,
    pagado: Centimos,
    pendiente: Centimos,
    estado: EstadoLiquidacion,
    partes: z.array(ParteGasto),
  })
  .meta({ id: 'InquilinoEnLiquidacion' });
export type InquilinoEnLiquidacion = z.infer<typeof InquilinoEnLiquidacion>;

export const Liquidacion = z
  .object({
    id: z.uuid(),
    numero: z.int(),
    nombre: z.string(),
    /** R11: el mes en que se creó. */
    mes: Mes,
    facturas: z.array(
      z.object({
        facturaId: z.uuid(),
        tipoGastoId: z.uuid().nullable(),
        periodoInicio: Fecha,
        periodoFin: Fecha,
        importeTotal: Centimos,
        nombreFichero: z.string(),
      }),
    ),
    /** R8: suma de sus facturas; lo sin ocupar (que asume la propietaria) va aparte. */
    total: Centimos,
    sinOcupar: Centimos,
    inquilinos: z.array(InquilinoEnLiquidacion),
  })
  .meta({ id: 'Liquidacion' });
export type Liquidacion = z.infer<typeof Liquidacion>;

export const ListaLiquidaciones = z.object({ liquidaciones: z.array(Liquidacion) }).meta({ id: 'ListaLiquidaciones' });
export type ListaLiquidaciones = z.infer<typeof ListaLiquidaciones>;

/** Lo marcado por «Marcar pagada», para poder deshacerlo (R10). */
export const ResultadoPagoLiquidacion = z
  .object({ partes: z.array(ParteGasto) })
  .meta({ id: 'ResultadoPagoLiquidacion' });
export type ResultadoPagoLiquidacion = z.infer<typeof ResultadoPagoLiquidacion>;

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
const conLiquidacion = enInmueble.extend({ idLiquidacion: z.uuid() });

export const rutasLiquidaciones = {
  '/inmuebles/{idInmueble}/liquidaciones': {
    get: {
      operationId: 'listarLiquidaciones',
      summary: 'Liquidaciones del inmueble con sus facturas y lo de cada inquilino (R8, R9)',
      tags: ['Liquidaciones'],
      requestParams: { path: enInmueble },
      responses: { '200': json(ListaLiquidaciones, 'Lista'), ...errores },
    },
    post: {
      operationId: 'crearLiquidacion',
      summary: 'Crea una liquidación con facturas repartidas y sueltas; número correlativo y nombre automático (R1–R5)',
      tags: ['Liquidaciones'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(NuevaLiquidacion),
      responses: { '201': json(Liquidacion, 'Creada'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/liquidaciones/{idLiquidacion}': {
    patch: {
      operationId: 'editarLiquidacion',
      summary: 'Renombrar, añadir o quitar facturas; con pagos, cambiar facturas pide confirmar (R2, R6, R6b)',
      tags: ['Liquidaciones'],
      requestParams: { path: conLiquidacion },
      requestBody: cuerpo(EdicionLiquidacion),
      responses: { '200': json(Liquidacion, 'Editada'), ...errores },
    },
    delete: {
      operationId: 'borrarLiquidacion',
      summary: 'Borra la liquidación; sus facturas quedan sueltas y los pagos se conservan (R7)',
      tags: ['Liquidaciones'],
      requestParams: { path: conLiquidacion },
      responses: { '204': { description: 'Borrada' }, ...errores },
    },
  },
  '/inmuebles/{idInmueble}/liquidaciones/{idLiquidacion}/pagar': {
    post: {
      operationId: 'pagarLiquidacion',
      summary: '«Marcar pagada» para un inquilino: todas sus partes pendientes de la liquidación (R10)',
      tags: ['Liquidaciones'],
      requestParams: { path: conLiquidacion },
      requestBody: cuerpo(PagoLiquidacion),
      responses: { '200': json(ResultadoPagoLiquidacion, 'Partes marcadas'), ...errores },
    },
  },
} satisfies ZodOpenApiPathsObject;
