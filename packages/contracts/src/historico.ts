import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Centimos, Mes } from './inmuebles.ts';

// Histórico del inmueble (spec 012). Solo se añade; nada se edita ni se borra (R3).

export const GrupoActividad = z
  .enum(['alquiler', 'gastos', 'liquidaciones', 'pagos', 'inquilinos', 'inmueble', 'fianza', 'enlaces'])
  .meta({ id: 'GrupoActividad' });
export type GrupoActividad = z.infer<typeof GrupoActividad>;

export const TipoActividad = z
  .enum([
    'cobro_generado',
    'cobro_editado',
    'cobro_movido',
    'cobro_quitado',
    'cobro_restaurado',
    'cobro_recalculado',
    'factura_subida',
    'factura_repartida',
    'reparto_recalculado',
    'reparto_deshecho',
    'liquidacion_creada',
    'liquidacion_renombrada',
    'liquidacion_factura_anadida',
    'liquidacion_factura_quitada',
    'liquidacion_borrada',
    'cobro_pagado',
    'cobro_desmarcado',
    'parte_pagada',
    'parte_desmarcada',
    'todo_pagado',
    'liquidacion_pagada',
    'inquilino_alta',
    'entrada',
    'salida',
    'estancia_corregida',
    'cambio_habitacion',
    'inquilino_borrado',
    'precio_cambiado',
    'dia_cobro_cambiado',
    'opciones_cambiadas',
    'habitacion_creada',
    'habitacion_archivada',
    'tipo_gasto_creado',
    'tipo_gasto_archivado',
    'fianza_recibida',
    'fianza_devuelta',
  ])
  .meta({ id: 'TipoActividad' });
export type TipoActividad = z.infer<typeof TipoActividad>;

/** Un cobro de alquiler o una parte de factura al que se refiere una actividad (R7b). */
export const ConceptoActividad = z
  .object({ tipo: z.enum(['cobro', 'parte']), id: z.uuid(), inquilinoId: z.uuid(), importe: Centimos })
  .meta({ id: 'ConceptoActividad' });
export type ConceptoActividad = z.infer<typeof ConceptoActividad>;

/**
 * Lo que se guarda de cada actividad. Solo ids, importes, fechas y nombres que
 * no son datos personales (habitaciones, tipos de gasto, liquidaciones): el
 * nombre del inquilino se busca al leer (R10).
 */
export const DetalleActividad = z
  .object({
    cobroId: z.uuid(),
    mes: Mes,
    origen: z.enum(['auto', 'manual']),
    importe: Centimos,
    /** R4: valor anterior y nuevo. */
    antes: z.number().int(),
    despues: z.number().int(),
    /** Fecha de negocio: pago, entrada, salida, recepción… */
    fecha: Fecha,
    fechaAntes: Fecha,
    fechaDespues: Fecha,
    facturaId: z.uuid(),
    facturaIds: z.array(z.uuid()),
    cantidad: z.number().int(),
    periodoInicio: Fecha,
    periodoFin: Fecha,
    liquidacionId: z.uuid(),
    nombre: z.string(),
    nombreAntes: z.string(),
    habitacionId: z.uuid(),
    habitacionAntesId: z.uuid(),
    desdeMes: Mes,
    conceptos: z.array(ConceptoActividad),
    /** Lo ocurrido antes de que existiera el histórico (R3b). */
    reconstruida: z.boolean(),
  })
  .partial()
  .meta({ id: 'DetalleActividad' });
export type DetalleActividad = z.infer<typeof DetalleActividad>;

export const Actividad = z
  .object({
    id: z.uuid(),
    tipo: TipoActividad,
    grupo: GrupoActividad,
    ocurridaEn: z.iso.datetime(),
    /** Día en que ocurrió, en hora de Madrid (R5). */
    fecha: Fecha,
    inquilinoId: z.uuid().nullable(),
    tipoGastoId: z.uuid().nullable(),
    /** `alquiler`, el id del tipo de gasto o null si no es de dinero (filtro R6). */
    gasto: z.string().nullable(),
    detalle: DetalleActividad,
    /** R7b: el estado de hoy de sus conceptos; null si no se refiere a ninguno. */
    estadoPago: z.enum(['pagado', 'pendiente']).nullable(),
  })
  .meta({ id: 'Actividad' });
export type Actividad = z.infer<typeof Actividad>;

/** R6: filtros combinables (en la URL, los de lista se repiten: `?inquilino=a&inquilino=b`). */
export const FiltrosHistorico = z
  .object({
    inquilino: z.array(z.uuid()).optional(),
    /** `alquiler` o ids de tipos de gasto. */
    gasto: z.array(z.union([z.literal('alquiler'), z.uuid()])).optional(),
    grupo: z.array(GrupoActividad).optional(),
    estado: z.enum(['pagado', 'pendiente']).optional(),
    desde: Fecha.optional(),
    hasta: Fecha.optional(),
  })
  .meta({ id: 'FiltrosHistorico' });
export type FiltrosHistorico = z.infer<typeof FiltrosHistorico>;

export const Historico = z
  .object({
    /** Lo más reciente primero (R5). */
    actividades: z.array(Actividad),
    /** R7: con filtros, lo cobrado y lo pendiente de lo filtrado; sin filtros, null. */
    resumen: z.object({ pagado: Centimos, pendiente: Centimos }).nullable(),
  })
  .meta({ id: 'Historico' });
export type Historico = z.infer<typeof Historico>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export const rutasHistorico = {
  '/inmuebles/{idInmueble}/historico': {
    get: {
      operationId: 'verHistorico',
      summary: 'Histórico del inmueble, lo más reciente primero, con filtros y resumen (spec 012)',
      tags: ['Histórico'],
      requestParams: { path: z.object({ idInmueble: z.uuid() }), query: FiltrosHistorico },
      responses: {
        '200': json(Historico, 'Histórico'),
        '400': json(RespuestaError, 'Filtros no válidos'),
        '401': json(RespuestaError, 'Sin sesión'),
        '404': json(RespuestaError, 'No existe o es de otra cuenta'),
      },
    },
  },
} satisfies ZodOpenApiPathsObject;
