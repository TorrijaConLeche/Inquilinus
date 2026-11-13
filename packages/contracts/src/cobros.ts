import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Centimos, Mes } from './inmuebles.ts';
import { ParteGasto } from './repartos.ts';

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

/** R6 y R6b: un cobro pagado o editado solo se recalcula con `confirmar: true`. */
export const Recalculo = z.strictObject({ confirmar: z.boolean().optional() }).meta({ id: 'Recalculo' });
export type Recalculo = z.infer<typeof Recalculo>;

/** Spec 009, R10: «Todo pagado» de un inquilino en un mes (por defecto, con fecha de hoy). */
export const PagoTodo = z
  .strictObject({ inquilinoId: z.uuid(), mes: Mes, fecha: Fecha.optional() })
  .meta({ id: 'PagoTodo' });
export type PagoTodo = z.infer<typeof PagoTodo>;

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

/** Lo marcado por «Todo pagado» (alquiler y partes de gastos), para poder deshacerlo (spec 009, R10). */
export const ResultadoPagoTodo = z
  .object({ marcados: z.array(Cobro), partes: z.array(ParteGasto) })
  .meta({ id: 'ResultadoPagoTodo' });
export type ResultadoPagoTodo = z.infer<typeof ResultadoPagoTodo>;

/** Spec 009, R6–R12: todo lo de la pantalla de cobros de un mes del inmueble. */
export const CobrosDelMes = z
  .object({
    mes: Mes,
    /** Los del mes elegido, sin los quitados. */
    cobros: z.array(Cobro),
    /** Los quitados del mes elegido, para restaurarlos (R12). */
    quitados: z.array(Cobro),
    /** Pendientes de meses anteriores al mes en curso, sin el elegido (R7). */
    atrasados: z.array(Cobro),
    /** Renta de habitaciones vacías que asume la propietaria ese mes (R11); null si no se puede calcular. */
    asumePropietario: Centimos.nullable(),
    /** R8: partes de gastos de las facturas repartidas ese mes. */
    gastos: z.array(ParteGasto),
    /** R7: partes de gastos pendientes de meses anteriores al mes en curso, sin el elegido. */
    gastosAtrasados: z.array(ParteGasto),
    /** R11: lo sin ocupar de las facturas repartidas ese mes, que también asume la propietaria. */
    asumePropietarioGastos: Centimos,
  })
  .meta({ id: 'CobrosDelMes' });
export type CobrosDelMes = z.infer<typeof CobrosDelMes>;

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
  '/inmuebles/{idInmueble}/cobros/mes/{mes}': {
    get: {
      operationId: 'cobrosDelMes',
      summary: 'Pantalla de cobros de un mes: los del mes, quitados, atrasados y lo que asume la propietaria (spec 009)',
      tags: ['Cobros'],
      requestParams: { path: enInmueble.extend({ mes: Mes }) },
      responses: { '200': json(CobrosDelMes, 'Mes'), ...errores },
    },
  },
  '/inmuebles/{idInmueble}/cobros/pagar-todo': {
    post: {
      operationId: 'pagarTodo',
      summary: '«Todo pagado» de un inquilino en un mes; devuelve lo marcado para deshacerlo (spec 009, R10)',
      tags: ['Cobros'],
      requestParams: { path: enInmueble },
      requestBody: cuerpo(PagoTodo),
      responses: { '200': json(ResultadoPagoTodo, 'Marcados'), ...errores },
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
  '/inmuebles/{idInmueble}/cobros/{idCobro}/recalcular': {
    post: {
      operationId: 'recalcularCobro',
      summary: 'Pone los importes del cálculo actual; pagado o editado pide confirmar (R6, R6b)',
      tags: ['Cobros'],
      requestParams: { path: conCobro },
      requestBody: cuerpo(Recalculo),
      responses: { '200': json(Cobro, 'Recalculado'), ...errores },
    },
  },
} satisfies ZodOpenApiPathsObject;
