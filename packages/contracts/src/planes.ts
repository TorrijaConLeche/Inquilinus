import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';

// Planes y límites (spec 010).

export const Plan = z.enum(['starter', 'plus', 'advanced']).meta({ id: 'Plan' });
export type Plan = z.infer<typeof Plan>;

/** R1: no se crea el inmueble y se dice el paso siguiente (subir de plan o escribir a soporte). */
export const RespuestaLimiteInmuebles = z
  .object({
    error: z.literal('LIMITE_INMUEBLES'),
    plan: Plan,
    limite: z.number().int(),
    siguiente: z.enum(['subir_de_plan', 'contactar_soporte']),
    /** Planes a los que se puede subir; vacío en Advanced. */
    planes: z.array(Plan),
  })
  .meta({ id: 'RespuestaLimiteInmuebles' });
export type RespuestaLimiteInmuebles = z.infer<typeof RespuestaLimiteInmuebles>;

/** Plan de la cuenta, sus límites y lo usado (ajustes y elección de inmuebles). */
export const EstadoPlan = z
  .object({
    plan: Plan,
    /** R15c: Advanced de cortesía vigente; `hasta` es su último día, o null si no caduca. */
    cortesia: z.object({ hasta: Fecha.nullable(), avisarFin: z.boolean() }).nullable(),
    limites: z.object({ inmuebles: z.number().int(), facturasIaAlMes: z.number().int() }),
    /** Lecturas con IA del mes en curso (hora de Madrid). */
    lecturasIa: z.object({ usadas: z.number().int(), disponibles: z.number().int() }),
    /** Inmuebles sin archivar: activos y bloqueados (R10), de más antiguo a más nuevo. */
    inmuebles: z.object({ activos: z.array(z.uuid()), bloqueados: z.array(z.uuid()) }),
    /** R10c: tiene más inmuebles de los que admite el plan y aún no ha elegido con él. */
    puedeElegir: z.boolean(),
  })
  .meta({ id: 'EstadoPlan' });
export type EstadoPlan = z.infer<typeof EstadoPlan>;

/** R10c: los inmuebles que siguen activos, tantos como admite el plan. */
export const EleccionInmuebles = z
  .strictObject({ inmuebles: z.array(z.uuid()).min(1).max(10) })
  .meta({ id: 'EleccionInmuebles' });
export type EleccionInmuebles = z.infer<typeof EleccionInmuebles>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export const rutasPlanes = {
  '/cuenta/plan': {
    get: {
      operationId: 'verPlan',
      summary: 'Plan de la cuenta, límites, lecturas con IA del mes e inmuebles bloqueados (spec 010)',
      tags: ['Cuenta'],
      responses: { '200': json(EstadoPlan, 'Estado del plan'), '401': json(RespuestaError, 'Sin sesión') },
    },
  },
  '/cuenta/inmuebles-activos': {
    post: {
      operationId: 'elegirInmueblesActivos',
      summary: 'Elegir qué inmuebles siguen activos; una sola vez con cada plan (spec 010, R10c)',
      tags: ['Cuenta'],
      requestBody: { content: { 'application/json': { schema: EleccionInmuebles } } },
      responses: {
        '200': json(EstadoPlan, 'Estado del plan tras elegir'),
        '400': json(RespuestaError, '`ELECCION_INVALIDA` o `ELECCION_NO_DISPONIBLE`'),
        '401': json(RespuestaError, 'Sin sesión'),
        '403': json(RespuestaError, 'Petición desde otro origen'),
      },
    },
  },
} satisfies ZodOpenApiPathsObject;
