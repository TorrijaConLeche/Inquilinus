import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Centimos } from './inmuebles.ts';


// Documentos y fianza del inquilino (spec 007, R6b–R6e).

/** R6b: solo estos dos tipos, uno de cada por inquilino. */
export const TIPOS_DOCUMENTO = ['contrato', 'justificante_fianza'] as const;
export const TipoDocumento = z.enum(TIPOS_DOCUMENTO).meta({ id: 'TipoDocumento' });
export type TipoDocumento = z.infer<typeof TipoDocumento>;

// --- Peticiones -------------------------------------------------------------

/** Tras subir el PDF al bucket con el permiso de `/subidas`, se confirma con su id. */
export const ConfirmacionDocumento = z
  .strictObject({ subidaId: z.uuid(), nombre: z.string().trim().min(1).max(200) })
  .meta({ id: 'ConfirmacionDocumento' });
export type ConfirmacionDocumento = z.infer<typeof ConfirmacionDocumento>;

/** R6d. La devolución va con fecha e importe juntos; las reglas finas las aplica el dominio. */
export const PeticionFianza = z
  .strictObject({
    importe: Centimos,
    recibidaEn: Fecha.nullable().optional(),
    devueltaEn: Fecha.nullable().optional(),
    importeDevuelto: Centimos.nullable().optional(),
    notas: z.string().max(2000).nullable().optional(),
  })
  .meta({ id: 'PeticionFianza' });
export type PeticionFianza = z.infer<typeof PeticionFianza>;

// --- Respuestas -------------------------------------------------------------

export const PermisoSubida = z
  .object({
    subidaId: z.uuid(),
    /** El navegador manda aquí un formulario multipart: primero `campos`, después `file`. */
    url: z.url(),
    campos: z.record(z.string(), z.string()),
    tamanoMaximo: z.int(),
    caducaEn: z.iso.datetime(),
  })
  .meta({ id: 'PermisoSubida' });
export type PermisoSubida = z.infer<typeof PermisoSubida>;

export const Documento = z
  .object({ tipo: TipoDocumento, nombre: z.string(), tamanoBytes: z.int(), subidoEn: z.iso.datetime() })
  .meta({ id: 'Documento' });
export type Documento = z.infer<typeof Documento>;

export const Fianza = z
  .object({
    importe: Centimos,
    recibidaEn: Fecha.nullable(),
    devueltaEn: Fecha.nullable(),
    importeDevuelto: Centimos.nullable(),
    notas: z.string().nullable(),
  })
  .meta({ id: 'Fianza' });
export type Fianza = z.infer<typeof Fianza>;

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
const conInquilino = z.object({ idInmueble: z.uuid(), idInquilino: z.uuid() });
const conDocumento = conInquilino.extend({ tipo: TipoDocumento });
const base = '/inmuebles/{idInmueble}/inquilinos/{idInquilino}';

export const rutasDocumentos = {
  [`${base}/subidas`]: {
    post: {
      operationId: 'prepararSubida',
      summary: 'Permiso firmado para subir un PDF al bucket privado (R6c), válido 5 minutos',
      tags: ['Documentos'],
      requestParams: { path: conInquilino },
      responses: { '201': json(PermisoSubida, 'Permiso'), ...errores },
    },
  },
  [`${base}/documentos/{tipo}`]: {
    get: {
      operationId: 'verDocumento',
      summary: 'Redirige a una URL firmada del PDF, válida 5 minutos (R6c)',
      tags: ['Documentos'],
      requestParams: { path: conDocumento },
      responses: { '302': { description: 'Redirección a la URL firmada' }, ...errores },
    },
    put: {
      operationId: 'guardarDocumento',
      summary: 'Confirma la subida: comprueba que es un PDF y reemplaza el anterior del mismo tipo (R6b)',
      tags: ['Documentos'],
      requestParams: { path: conDocumento },
      requestBody: { content: { 'application/json': { schema: ConfirmacionDocumento } } },
      responses: { '200': json(Documento, 'Guardado'), ...errores },
    },
    delete: {
      operationId: 'borrarDocumento',
      summary: 'Borra el documento y su fichero',
      tags: ['Documentos'],
      requestParams: { path: conDocumento },
      responses: { '204': { description: 'Borrado' }, ...errores },
    },
  },
  [`${base}/fianza`]: {
    put: {
      operationId: 'guardarFianza',
      summary: 'Crea o actualiza la fianza (R6d)',
      tags: ['Documentos'],
      requestParams: { path: conInquilino },
      requestBody: { content: { 'application/json': { schema: PeticionFianza } } },
      responses: { '200': json(Fianza, 'Guardada'), ...errores },
    },
    delete: {
      operationId: 'borrarFianza',
      summary: 'Borra la fianza',
      tags: ['Documentos'],
      requestParams: { path: conInquilino },
      responses: { '204': { description: 'Borrada' }, ...errores },
    },
  },
} satisfies ZodOpenApiPathsObject;
