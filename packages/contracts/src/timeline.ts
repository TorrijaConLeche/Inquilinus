import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Cobro } from './cobros.ts';
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
    /** R13 y spec 011, R14: las liquidaciones, para la lista de movimientos y la ventana de cada factura. */
    liquidaciones: z.array(z.object({ id: z.uuid(), numero: z.int(), nombre: z.string(), mes: Mes, total: Centimos })),
  })
  .meta({ id: 'DatosTimeline' });

/**
 * R11: el desglose de un mes de alquiler. Lo guardado (cada cobro, una foto
 * fija) y el cálculo de hoy con la explicación de los días vacíos.
 */
export const DesgloseAlquiler = z
  .object({
    mes: Mes,
    habitaciones: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
    lineas: z.array(
      z.object({
        inquilinoId: z.uuid(),
        /** Las habitaciones en que vivió ese mes. */
        habitacionIds: z.array(z.uuid()),
        /** El cobro guardado (no quitado), o null si no se ha generado. */
        cobro: Cobro.nullable(),
        /** Lo que sale hoy del cálculo (spec 002); null si no vivió allí ese mes. */
        calculado: z.object({ renta: Centimos, recargoVacios: Centimos, importe: Centimos }).nullable(),
      }),
    ),
    /** Días vacíos por habitación; `entre`, los inquilinos que los pagan (vacío: los asume la propietaria). */
    vacios: z.array(z.object({ habitacionId: z.uuid(), desde: Fecha, hasta: Fecha, entre: z.array(z.uuid()) })),
    /** Lo que asume la propietaria según el cálculo; null si no se puede calcular (sin precio). */
    propietario: Centimos.nullable(),
  })
  .meta({ id: 'DesgloseAlquiler' });
export type DesgloseAlquiler = z.infer<typeof DesgloseAlquiler>;
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
  '/inmuebles/{idInmueble}/alquiler/{mes}': {
    get: {
      operationId: 'verDesgloseAlquiler',
      summary: 'Desglose de un mes de alquiler: cobros, cálculo y explicación de los días vacíos (spec 006, R11)',
      tags: ['Timeline'],
      requestParams: { path: z.object({ idInmueble: z.uuid(), mes: Mes }) },
      responses: {
        '200': json(DesgloseAlquiler, 'Desglose del mes'),
        '401': json(RespuestaError, 'Sin sesión'),
        '404': json(RespuestaError, 'No existe o es de otra cuenta'),
      },
    },
  },
} satisfies ZodOpenApiPathsObject;
