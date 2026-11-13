import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Centimos, Mes } from './inmuebles.ts';

// Cobros de alquiler (spec 005). Importes en céntimos; el mes del cobro no cambia nunca.

// --- Peticiones -------------------------------------------------------------

/** R5: generar a mano los cobros que falten de un mes (no futuro). */
export const GeneracionCobros = z.strictObject({ mes: Mes }).meta({ id: 'GeneracionCobros' });
export type GeneracionCobros = z.infer<typeof GeneracionCobros>;

/** R10b: cobro a mano para un inquilino y un mes sin cobro. Sin renta, la calculada (si vivió allí). */
export const NuevoCobro = z
  .strictObject({
    inquilinoId: z.uuid(),
    mes: Mes,
    renta: Centimos.optional(),
    recargoVacios: Centimos.optional(),
    fechaCobro: Fecha.optional(),
  })
  .meta({ id: 'NuevoCobro' });
export type NuevoCobro = z.infer<typeof NuevoCobro>;

/**
 * R7, R10 y R11. Renta, recargo y fecha de cobro lo marcan como editado;
 * `quitado` lo quita o lo restaura; `pagadoEn` lo marca pagado (con fecha) o pendiente (null).
 */
export const EdicionCobro = z
  .strictObject({
    renta: Centimos.optional(),
    recargoVacios: Centimos.optional(),
    fechaCobro: Fecha.optional(),
    quitado: z.boolean().optional(),
    pagadoEn: Fecha.nullable().optional(),
  })
  .meta({ id: 'EdicionCobro' });
export type EdicionCobro = z.infer<typeof EdicionCobro>;

// --- Respuestas -------------------------------------------------------------

export const Cobro = z
  .object({
    id: z.uuid(),
    inquilinoId: z.uuid(),
    mes: Mes,
    renta: Centimos,
    recargoVacios: Centimos,
    /** renta + recargoVacios. */
    importe: Centimos,
    fechaCobro: Fecha,
    origen: z.enum(['auto', 'manual']),
    editado: z.boolean(),
    desactualizado: z.boolean(),
    quitado: z.boolean(),
    pagadoEn: Fecha.nullable(),
  })
  .meta({ id: 'Cobro' });
export type Cobro = z.infer<typeof Cobro>;

export const ListaCobros = z.object({ cobros: z.array(Cobro) }).meta({ id: 'ListaCobros' });
export type ListaCobros = z.infer<typeof ListaCobros>;

export const ResultadoGeneracion = z.object({ creados: z.array(Cobro) }).meta({ id: 'ResultadoGeneracion' });
export type ResultadoGeneracion = z.infer<typeof ResultadoGeneracion>;

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
const conCobro = enInmueble.extend({ idCobro: z.uuid() });

export const rutasCobros = {
  '/inmuebles/{idInmueble}/cobros': {
    get: {
      operationId: 'listarCobros',
      summary: 'Cobros del inmueble, por fecha de cobro. Sin los quitados, salvo ?quitados=true (R11)',
      tags: ['Cobros'],
      requestParams: {
        path: enInmueble,
        query: z.object({ mes: Mes.optional(), quitados: z.enum(['true', 'false']).optional() }),
      },
      responses: { '200': json(ListaCobros, 'Lista'), ...errores },
    },
    post: {
      operationId: 'crearCobro',
      summary: 'Añadir a mano un cobro para un inquilino y un mes sin cobro (R10, R10b)',
      tags: ['Cobros'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(NuevoCobro),
      responses: { '201': json(Cobro, 'Creado'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/cobros/generar': {
    post: {
      operationId: 'generarCobros',
      summary: 'Generar a mano los cobros que falten de un mes, también pasado (R5, R5b)',
      tags: ['Cobros'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(GeneracionCobros),
      responses: { '201': json(ResultadoGeneracion, 'Los creados (puede no haber ninguno)'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/cobros/{idCobro}': {
    patch: {
      operationId: 'editarCobro',
      summary: 'Cambiar renta, recargo o fecha; quitar o restaurar; marcar pagado o pendiente (R7, R10, R11)',
      tags: ['Cobros'],
      requestParams: { path: conCobro },
      requestBody: cuerpo(EdicionCobro),
      responses: { '200': json(Cobro, 'Editado'), ...errores },
    },
  },
} satisfies ZodOpenApiPathsObject;
