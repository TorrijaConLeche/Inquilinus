import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { Fecha, RespuestaError } from './comunes.ts';
import { Centimos, Mes } from './inmuebles.ts';
import { DatosTimeline } from './timeline.ts';

// Vista del inquilino con su enlace (spec 004, R4–R12). Solo lo suyo: nunca
// lo que han pagado o deben los demás (R7b), ni documentos ni contacto (R9).

export const VistaInquilino = z
  .object({
    inquilino: z.object({ id: z.uuid(), nombre: z.string() }),
    /** R11b: con el inmueble bloqueado por el plan, la vista avisa de que no está al día. */
    inmueble: z.object({ nombre: z.string(), bloqueado: z.boolean() }),
    /** R2b y R8: si puede descargar las facturas. */
    permiteDescarga: z.boolean(),
    /** R5: lo que le falta por pagar (alquiler y gastos). */
    pendiente: Centimos,
    /** R6: sus cobros de alquiler (foto fija, R10), con la explicación de los días vacíos que paga. */
    cobros: z.array(
      z.object({
        id: z.uuid(),
        mes: Mes,
        renta: Centimos,
        recargoVacios: Centimos,
        importe: Centimos,
        fechaCobro: Fecha,
        pagadoEn: Fecha.nullable(),
        vacios: z.array(z.object({ habitacion: z.string(), desde: Fecha, hasta: Fecha, entre: z.int() })),
      }),
    ),
    /** R6 y R7: su parte de cada gasto, con el cálculo por tramos (los demás, solo por su nombre de pila). */
    gastos: z.array(
      z.object({
        parteId: z.uuid(),
        facturaId: z.uuid(),
        tipoGastoId: z.uuid().nullable(),
        periodoInicio: Fecha,
        periodoFin: Fecha,
        importeFactura: Centimos,
        importe: Centimos,
        dias: z.int(),
        pagadoEn: Fecha.nullable(),
        liquidacionId: z.uuid().nullable(),
        mes: Mes,
        tramos: z.array(z.object({ desde: Fecha, hasta: Fecha, dias: z.int(), conQuien: z.array(z.string()), importe: Centimos })),
      }),
    ),
    /** Spec 011, R15: sus liquidaciones con su total y su estado. */
    liquidaciones: z.array(
      z.object({
        id: z.uuid(),
        nombre: z.string(),
        mes: Mes,
        total: Centimos,
        pendiente: Centimos,
        estado: z.enum(['pagada', 'parcial', 'pendiente']),
      }),
    ),
    fianza: z
      .object({ importe: Centimos, recibidaEn: Fecha.nullable(), devueltaEn: Fecha.nullable(), importeDevuelto: Centimos.nullable() })
      .nullable(),
    /** R6c: el timeline con las estancias de todos y, de dinero, solo lo suyo. */
    timeline: DatosTimeline,
  })
  .meta({ id: 'VistaInquilino' });
export type VistaInquilino = z.infer<typeof VistaInquilino>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const conToken = z.object({ token: z.string() });

export const rutasPublico = {
  '/publico/{token}': {
    get: {
      operationId: 'verVistaInquilino',
      summary: 'Vista del inquilino con su enlace; revocado, caducado o inexistente dan el mismo 404 (spec 004, R4)',
      tags: ['Vista del inquilino'],
      requestParams: { path: conToken },
      responses: {
        '200': json(VistaInquilino, 'Su vista'),
        '404': json(RespuestaError, 'Enlace no disponible'),
      },
    },
  },
  '/publico/{token}/facturas/{idFactura}/pdf': {
    get: {
      operationId: 'descargarFacturaInquilino',
      summary: 'Redirige al PDF con una URL firmada de 5 minutos si la descarga está habilitada y la factura es suya (R8)',
      tags: ['Vista del inquilino'],
      requestParams: { path: conToken.extend({ idFactura: z.uuid() }) },
      responses: {
        '302': { description: 'Al PDF' },
        '404': json(RespuestaError, 'No disponible'),
      },
    },
  },
} satisfies ZodOpenApiPathsObject;
