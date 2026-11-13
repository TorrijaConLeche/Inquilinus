import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { RespuestaError } from './comunes.ts';
import { Centimos, Mes } from './inmuebles.ts';

// Panel principal (spec 009, R1–R5b). Sin inmuebles archivados; los bloqueados no cuentan.

export const ConceptoPendiente = z
  .object({
    id: z.uuid(),
    /** Hasta la fase 5 solo hay alquileres. */
    tipo: z.enum(['alquiler', 'gasto']),
    /** Nombre del tipo de gasto («Luz»); null en el alquiler. */
    nombreGasto: z.string().nullable(),
    mes: Mes,
    importe: Centimos,
    /** De un mes anterior al actual (R3): va destacado y primero. */
    atrasado: z.boolean(),
  })
  .meta({ id: 'ConceptoPendiente' });
export type ConceptoPendiente = z.infer<typeof ConceptoPendiente>;

export const Panel = z
  .object({
    /** R1: todo lo pendiente de cobro. */
    totalPendiente: Centimos,
    /** R1: lo marcado como cobrado este mes. */
    cobradoEsteMes: Centimos,
    /** R2 y R3: solo inmuebles con pendientes, de mayor a menor. */
    pendientes: z.array(
      z.object({
        inmuebleId: z.uuid(),
        nombre: z.string(),
        total: Centimos,
        inquilinos: z.array(
          z.object({ inquilinoId: z.uuid(), nombre: z.string(), total: Centimos, conceptos: z.array(ConceptoPendiente) }),
        ),
      }),
    ),
    /** R5: una tarjeta por inmueble activo (ni archivado ni bloqueado). */
    inmuebles: z.array(z.object({ id: z.uuid(), nombre: z.string(), pendiente: Centimos })),
    /** R4 y R5b. */
    avisos: z.object({
      desactualizados: z.array(z.object({ inmuebleId: z.uuid(), nombre: z.string(), cobros: z.int() })),
      /** Facturas subidas que faltan por confirmar, por inmueble. */
      porRevisar: z.array(z.object({ inmuebleId: z.uuid(), nombre: z.string(), facturas: z.int() })),
      bloqueados: z.int(),
    }),
  })
  .meta({ id: 'Panel' });
export type Panel = z.infer<typeof Panel>;

export const rutasPanel = {
  '/panel': {
    get: {
      operationId: 'verPanel',
      summary: 'Panel principal: totales, pendientes por inmueble e inquilino, tarjetas y avisos (spec 009)',
      tags: ['Panel'],
      responses: {
        '200': { description: 'Panel', content: { 'application/json': { schema: Panel } } },
        '401': { description: 'Sin sesión', content: { 'application/json': { schema: RespuestaError } } },
      },
    },
  },
} satisfies ZodOpenApiPathsObject;
