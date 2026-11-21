import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';

// Enlace del inquilino (spec 004, R1–R3b). Del token solo se guarda su hash:
// se ve una vez, al generarlo o regenerarlo (R2c).

/** El enlace vigente de un inquilino, sin el token. */
export const EnlaceInquilino = z
  .object({
    creadoEn: z.iso.datetime(),
    /** R2b: si el inquilino puede descargar las facturas. */
    permiteDescarga: z.boolean(),
    /** R3 y R3b: último día en que funciona; null mientras tenga una estancia sin salida. */
    caducaEl: Fecha.nullable(),
    /** Si hoy funciona (no ha caducado). */
    disponible: z.boolean(),
  })
  .meta({ id: 'EnlaceInquilino' });
export type EnlaceInquilino = z.infer<typeof EnlaceInquilino>;

/** R2c: el token, solo en la respuesta de generar o regenerar. */
export const EnlaceGenerado = z
  .object({ token: z.string(), enlace: EnlaceInquilino })
  .meta({ id: 'EnlaceGenerado' });
export type EnlaceGenerado = z.infer<typeof EnlaceGenerado>;

/** R2b: habilitar o deshabilitar la descarga de facturas. */
export const EdicionEnlace = z.strictObject({ permiteDescarga: z.boolean() }).meta({ id: 'EdicionEnlace' });
export type EdicionEnlace = z.infer<typeof EdicionEnlace>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const errores = {
  '400': json(RespuestaError, 'No se puede (`ENLACE_EXISTENTE`, `INQUILINO_ANONIMIZADO`…)'),
  '401': json(RespuestaError, 'Sin sesión'),
  '404': json(RespuestaError, 'No existe o es de otra cuenta'),
};
const ruta = z.object({ idInmueble: z.uuid(), idInquilino: z.uuid() });

export const rutasEnlaces = {
  '/inmuebles/{idInmueble}/inquilinos/{idInquilino}/enlace': {
    post: {
      operationId: 'generarEnlace',
      summary: 'Genera el enlace del inquilino; el token solo viene en esta respuesta (R1, R2c)',
      tags: ['Enlaces'],
      requestParams: { path: ruta },
      responses: { '201': json(EnlaceGenerado, 'Generado'), ...errores },
    },
    patch: {
      operationId: 'editarEnlace',
      summary: 'Habilita o deshabilita la descarga de facturas (R2b)',
      tags: ['Enlaces'],
      requestParams: { path: ruta },
      requestBody: { content: { 'application/json': { schema: EdicionEnlace } } },
      responses: { '200': json(EnlaceInquilino, 'Editado'), ...errores },
    },
    delete: {
      operationId: 'revocarEnlace',
      summary: 'Revoca el enlace: deja de funcionar (R2)',
      tags: ['Enlaces'],
      requestParams: { path: ruta },
      responses: { '204': { description: 'Revocado' }, ...errores },
    },
  },
  '/inmuebles/{idInmueble}/inquilinos/{idInquilino}/enlace/regenerar': {
    post: {
      operationId: 'regenerarEnlace',
      summary: 'Revoca el enlace vigente y genera otro, que conserva el permiso de descarga (R2)',
      tags: ['Enlaces'],
      requestParams: { path: ruta },
      responses: { '201': json(EnlaceGenerado, 'Regenerado'), ...errores },
    },
  },
} satisfies ZodOpenApiPathsObject;
