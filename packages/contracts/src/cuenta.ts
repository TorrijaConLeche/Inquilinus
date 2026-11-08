import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { RespuestaError } from './comunes.ts';

/**
 * Versión vigente de la política de privacidad y los términos (spec 008, R4).
 * Se cambia al publicar textos nuevos (tarea 2.8); el registro debe enviarla.
 */
export const VERSION_TERMINOS = '2026-11-borrador';

/** Longitud mínima de la contraseña, sin reglas de composición (R5). */
export const LONGITUD_MINIMA_CONTRASENA = 12;

// --- Exportar y borrar la cuenta (R14) --------------------------------------

/**
 * Todos los datos de la cuenta, tabla a tabla, sin secretos (hash de la
 * contraseña, tokens, clave del doble factor). Las fechas van en ISO 8601.
 */
export const ExportacionCuenta = z
  .object({
    formato: z.literal('inquilinus-exportacion'),
    version: z.literal(1),
    exportadoEn: z.string().meta({ example: '2026-11-08T20:00:00.000Z' }),
    tablas: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  })
  .meta({ id: 'ExportacionCuenta', description: 'Datos de la cuenta (spec 008, R14).' });
export type ExportacionCuenta = z.infer<typeof ExportacionCuenta>;

/** Para borrar la cuenta hay que escribir su email (R14). */
export const PeticionBorrarCuenta = z
  .object({ email: z.string().trim().min(1) })
  .meta({ id: 'PeticionBorrarCuenta' });
export type PeticionBorrarCuenta = z.infer<typeof PeticionBorrarCuenta>;

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: RespuestaError } },
});

export const rutasCuenta = {
  '/cuenta/exportacion': {
    get: {
      operationId: 'exportarCuenta',
      summary: 'Descargar todos los datos de la cuenta',
      tags: ['Cuenta'],
      responses: {
        '200': {
          description: 'Fichero JSON con los datos',
          content: { 'application/json': { schema: ExportacionCuenta } },
        },
        '401': error('Sin sesión'),
      },
    },
  },
  '/cuenta/borrar': {
    post: {
      operationId: 'borrarCuenta',
      summary: 'Borrar la cuenta y todos sus datos',
      tags: ['Cuenta'],
      requestBody: { content: { 'application/json': { schema: PeticionBorrarCuenta } } },
      responses: {
        '204': { description: 'Cuenta borrada; las sesiones quedan cerradas' },
        '400': error('El email no coincide con el de la cuenta'),
        '401': error('Sin sesión'),
        '403': error('Petición desde otro origen'),
      },
    },
  },
} satisfies ZodOpenApiPathsObject;
