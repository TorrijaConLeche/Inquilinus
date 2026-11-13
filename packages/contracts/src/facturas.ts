import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { PermisoSubida } from './documentos.ts';
import { Centimos } from './inmuebles.ts';
import { EdicionParte, ParteReparto, RepartoFactura, ResumenReparto } from './repartos.ts';

// Facturas de suministros (spec 003). Importes en céntimos; periodos como días naturales.

export const EstadoFactura = z
  .enum(['subida', 'propuesta', 'error_extraccion', 'confirmada', 'repartida'])
  .meta({ id: 'EstadoFactura' });
export type EstadoFactura = z.infer<typeof EstadoFactura>;

// --- Peticiones -------------------------------------------------------------

/** R1: un permiso de subida por PDF, de 1 a 20. */
export const PeticionSubidasFacturas = z
  .strictObject({ cantidad: z.int().min(1).max(100) })
  .meta({ id: 'PeticionSubidasFacturas' });
export type PeticionSubidasFacturas = z.infer<typeof PeticionSubidasFacturas>;

/** Tras subir los PDF al bucket, se registran todos juntos (un lote). */
export const NuevasFacturas = z
  .strictObject({
    subidas: z
      .array(z.strictObject({ subidaId: z.uuid(), nombre: z.string().trim().min(1).max(200) }))
      .min(1)
      .max(100),
  })
  .meta({ id: 'NuevasFacturas' });
export type NuevasFacturas = z.infer<typeof NuevasFacturas>;

/** R5: la usuaria puede cambiar cualquier campo antes de confirmar; null lo vacía. */
export const EdicionFactura = z
  .strictObject({
    tipoGastoId: z.uuid().nullable().optional(),
    periodoInicio: Fecha.nullable().optional(),
    periodoFin: Fecha.nullable().optional(),
    importeTotal: Centimos.nullable().optional(),
  })
  .meta({ id: 'EdicionFactura' });
export type EdicionFactura = z.infer<typeof EdicionFactura>;

/** R6: con solapes, solo se confirma si la usuaria decide continuar. */
export const ConfirmacionFactura = z
  .strictObject({ continuarConSolapes: z.boolean().optional() })
  .meta({ id: 'ConfirmacionFactura' });
export type ConfirmacionFactura = z.infer<typeof ConfirmacionFactura>;

/** Spec 001, R13 y R14: recalcular o deshacer con partes pagadas pide `confirmar: true`. */
export const ConfirmacionReparto = z.strictObject({ confirmar: z.boolean().optional() }).meta({ id: 'ConfirmacionReparto' });
export type ConfirmacionReparto = z.infer<typeof ConfirmacionReparto>;

/** R13: confirma las completas y sin solapes; con `lote`, solo las de ese lote. */
export const ConfirmacionTodas = z.strictObject({ lote: z.uuid().optional() }).meta({ id: 'ConfirmacionTodas' });
export type ConfirmacionTodas = z.infer<typeof ConfirmacionTodas>;

// --- Respuestas -------------------------------------------------------------

export const Factura = z
  .object({
    id: z.uuid(),
    /** Las subidas juntas comparten lote (R12). */
    lote: z.uuid(),
    estado: EstadoFactura,
    /** Nombre del PDF tal como se subió. */
    nombreFichero: z.string(),
    tipoGastoId: z.uuid().nullable(),
    periodoInicio: Fecha.nullable(),
    periodoFin: Fecha.nullable(),
    importeTotal: Centimos.nullable(),
    /** R7: lo que propuso la IA, para medir su acierto; null si no se leyó con IA. */
    propuestaIa: z
      .object({
        inicio: Fecha.nullable(),
        fin: Fecha.nullable(),
        importe: Centimos.nullable(),
        tipoGastoId: z.uuid().nullable(),
      })
      .nullable(),
    subidaEn: z.iso.datetime(),
    /** Spec 001, R10: el reparto de una factura repartida; null si aún no se ha repartido. */
    reparto: ResumenReparto.nullable(),
  })
  .meta({ id: 'Factura' });
export type Factura = z.infer<typeof Factura>;

export const ListaFacturas = z.object({ facturas: z.array(Factura) }).meta({ id: 'ListaFacturas' });
export type ListaFacturas = z.infer<typeof ListaFacturas>;

/** R6 y R14: la factura no se confirma porque se solapa con estas; la usuaria decide. */
export const RespuestaSolape = z
  .object({ error: z.literal('SOLAPE_FACTURAS'), solapadas: z.array(Factura) })
  .meta({ id: 'RespuestaSolape' });
export type RespuestaSolape = z.infer<typeof RespuestaSolape>;

/** R13 y R14b: lo confirmado y lo que sigue por revisar, con el motivo. */
export const ResultadoConfirmacionTodas = z
  .object({
    confirmadas: z.array(Factura),
    pendientes: z.array(
      z.object({ id: z.uuid(), motivo: z.enum(['incompleta', 'solape']), solapadas: z.array(z.uuid()) }),
    ),
  })
  .meta({ id: 'ResultadoConfirmacionTodas' });
export type ResultadoConfirmacionTodas = z.infer<typeof ResultadoConfirmacionTodas>;

export const PermisosSubida = z.object({ permisos: z.array(PermisoSubida) }).meta({ id: 'PermisosSubida' });
export type PermisosSubida = z.infer<typeof PermisosSubida>;

/** R1 y R12: las válidas quedan por revisar; las no válidas se rechazan sin afectar al resto. */
export const ResultadoSubidaFacturas = z
  .object({
    lote: z.uuid(),
    facturas: z.array(Factura),
    rechazadas: z.array(z.object({ nombre: z.string(), error: z.string() })),
  })
  .meta({ id: 'ResultadoSubidaFacturas' });
export type ResultadoSubidaFacturas = z.infer<typeof ResultadoSubidaFacturas>;

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
const conFactura = enInmueble.extend({ idFactura: z.uuid() });

export const rutasFacturas = {
  '/inmuebles/{idInmueble}/facturas/subidas': {
    post: {
      operationId: 'prepararSubidasFacturas',
      summary: 'Un permiso firmado (5 minutos) por PDF para subirlos al bucket privado; de 1 a 20 (R1, R16)',
      tags: ['Facturas'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(PeticionSubidasFacturas),
      responses: { '201': json(PermisosSubida, 'Permisos'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/facturas': {
    get: {
      operationId: 'listarFacturas',
      summary: 'Facturas del inmueble; con ?porRevisar=true, solo las que faltan por confirmar (R13)',
      tags: ['Facturas'],
      requestParams: { path: enInmueble, query: z.object({ porRevisar: z.enum(['true', 'false']).optional() }) },
      responses: { '200': json(ListaFacturas, 'Lista'), ...errores },
    },
    post: {
      operationId: 'crearFacturas',
      summary: 'Registra un lote de PDF ya subidos; los lee la IA si está activada (R1, R8, R8b, R12)',
      tags: ['Facturas'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(NuevasFacturas),
      responses: { '201': json(ResultadoSubidaFacturas, 'Lote'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/facturas/confirmar-todas': {
    post: {
      operationId: 'confirmarTodas',
      summary: '«Confirmar todas»: confirma las completas y sin solapes; las demás siguen por revisar (R13, R14b)',
      tags: ['Facturas'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(ConfirmacionTodas),
      responses: { '200': json(ResultadoConfirmacionTodas, 'Resultado'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/facturas/{idFactura}/confirmar': {
    post: {
      operationId: 'confirmarFactura',
      summary: 'Confirma una factura completa (R9); si se solapa con otra, avisa salvo que se decida continuar (R6, R14)',
      tags: ['Facturas'],
      requestParams: { path: conFactura },
      requestBody: cuerpo(ConfirmacionFactura),
      responses: {
        '200': json(Factura, 'Confirmada'),
        '409': json(RespuestaSolape, 'Se solapa con otras facturas del mismo tipo'),
        ...errores,
      },
    },
  },
  '/inmuebles/{idInmueble}/facturas/{idFactura}': {
    patch: {
      operationId: 'editarFactura',
      summary: 'Rellenar o corregir tipo, periodo e importe antes de confirmar (R5)',
      tags: ['Facturas'],
      requestParams: { path: conFactura },
      requestBody: cuerpo(EdicionFactura),
      responses: { '200': json(Factura, 'Editada'), ...errores },
    },
    delete: {
      operationId: 'descartarFactura',
      summary: 'Descarta una factura sin confirmar, con su PDF (R16)',
      tags: ['Facturas'],
      requestParams: { path: conFactura },
      responses: { '204': { description: 'Descartada' }, ...errores },
    },
  },
  '/inmuebles/{idInmueble}/facturas/{idFactura}/reparto': {
    get: {
      operationId: 'verReparto',
      summary: 'Reparto guardado de una factura con su detalle por tramos (spec 001, R10)',
      tags: ['Facturas'],
      requestParams: { path: conFactura },
      responses: { '200': json(RepartoFactura, 'Reparto'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/facturas/{idFactura}/recalcular': {
    post: {
      operationId: 'recalcularReparto',
      summary: 'Pone las partes del cálculo actual; cada inquilino conserva su pago; con partes pagadas pide confirmar (spec 001, R13)',
      tags: ['Facturas'],
      requestParams: { path: conFactura },
      requestBody: cuerpo(ConfirmacionReparto),
      responses: { '200': json(Factura, 'Recalculada'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/facturas/{idFactura}/deshacer': {
    post: {
      operationId: 'deshacerConfirmacion',
      summary: 'Devuelve la factura a por revisar y borra su reparto; con partes pagadas pide confirmar (spec 001, R14)',
      tags: ['Facturas'],
      requestParams: { path: conFactura },
      requestBody: cuerpo(ConfirmacionReparto),
      responses: { '200': json(Factura, 'Por revisar otra vez'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/partes/{idParte}': {
    patch: {
      operationId: 'editarParte',
      summary: 'Marcar una parte de gasto pagada o pendiente (spec 001, R11)',
      tags: ['Facturas'],
      requestParams: { path: enInmueble.extend({ idParte: z.uuid() }) },
      requestBody: cuerpo(EdicionParte),
      responses: { '200': json(ParteReparto, 'Parte'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/facturas/{idFactura}/pdf': {
    get: {
      operationId: 'verPdfFactura',
      summary: 'Redirige a una URL firmada del PDF, válida 5 minutos',
      tags: ['Facturas'],
      requestParams: { path: conFactura },
      responses: { '302': { description: 'Redirección a la URL firmada' }, ...errores },
    },
  },
} satisfies ZodOpenApiPathsObject;
