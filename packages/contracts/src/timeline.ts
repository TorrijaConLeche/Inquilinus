import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Centimos, Mes } from './inmuebles.ts';
import { TipoGasto } from './inquilinos.ts';

// Timeline del inmueble (spec 006): lo justo para dibujarlo. Lo de cada fila
// (orden, posiciones, chinchetas) lo calcula el dominio.

export const DatosTimeline = z
  .object({
    /** R2 y R7: en orden de creación, con su color (también los archivados; R2b decide si tienen fila). */
    tiposGasto: z.array(TipoGasto),
    /** R5: cada inquilino con sus estancias, por entrada. */
    inquilinos: z.array(
      z.object({
        id: z.uuid(),
        nombre: z.string(),
        ocupaciones: z.array(z.object({ habitacionId: z.uuid(), entrada: Fecha, salida: Fecha.nullable() })),
      }),
    ),
    /** R3 y R3b: los cobros no quitados. */
    cobros: z.array(
      z.object({ id: z.uuid(), inquilinoId: z.uuid(), mes: Mes, fechaCobro: Fecha, importe: Centimos, pagadoEn: Fecha.nullable() }),
    ),
    /** R4 y R4b: las facturas repartidas, con la parte de cada inquilino (R10). */
    facturas: z.array(
      z.object({
        id: z.uuid(),
        tipoGastoId: z.uuid().nullable(),
        periodoInicio: Fecha,
        periodoFin: Fecha,
        importeTotal: Centimos,
        liquidacionId: z.uuid().nullable(),
        partes: z.array(z.object({ inquilinoId: z.uuid(), importe: Centimos, pagadoEn: Fecha.nullable() })),
      }),
    ),
  })
  .meta({ id: 'DatosTimeline' });
export type DatosTimeline = z.infer<typeof DatosTimeline>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export const rutasTimeline = {
  '/inmuebles/{idInmueble}/timeline': {
    get: {
      operationId: 'verTimeline',
      summary: 'Lo que dibuja el timeline del inmueble: tipos de gasto, estancias, cobros y facturas repartidas (spec 006)',
      tags: ['Timeline'],
      requestParams: { path: z.object({ idInmueble: z.uuid() }) },
      responses: {
        '200': json(DatosTimeline, 'Datos del timeline'),
        '401': json(RespuestaError, 'Sin sesión'),
        '404': json(RespuestaError, 'No existe o es de otra cuenta'),
      },
    },
  },
} satisfies ZodOpenApiPathsObject;
