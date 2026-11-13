import { z } from 'zod';
import { Fecha } from './comunes.ts';
import { Centimos, Mes } from './inmuebles.ts';

// Reparto guardado de una factura (spec 001, R10–R15). Lo usan las facturas, los cobros y el panel.

/** R11: la parte de un inquilino, pendiente o pagada. */
export const ParteReparto = z
  .object({
    id: z.uuid(),
    inquilinoId: z.uuid(),
    dias: z.int(),
    importe: Centimos,
    pagadoEn: Fecha.nullable(),
  })
  .meta({ id: 'ParteReparto' });
export type ParteReparto = z.infer<typeof ParteReparto>;

/** El reparto de una factura, sin el detalle por tramos. */
export const ResumenReparto = z
  .object({
    /** R12: mes del primer reparto, en hora de Madrid. */
    mes: Mes,
    desactualizado: z.boolean(),
    /** R5 de la spec 001: lo que asume la propietaria. */
    sinOcupar: z.object({ dias: z.int(), importe: Centimos }),
    partes: z.array(ParteReparto),
  })
  .meta({ id: 'ResumenReparto' });
export type ResumenReparto = z.infer<typeof ResumenReparto>;

/** Con el detalle por tramos (para la ventana de la factura, spec 006, R12). */
export const RepartoFactura = ResumenReparto.extend({
  calculadoEn: z.iso.datetime(),
  tramos: z.array(
    z.object({
      desde: Fecha,
      hasta: Fecha,
      dias: z.int(),
      presentes: z.array(z.uuid()),
      partes: z.array(z.object({ inquilinoId: z.uuid(), importe: Centimos })),
    }),
  ),
}).meta({ id: 'RepartoFactura' });
export type RepartoFactura = z.infer<typeof RepartoFactura>;

/** Una parte de gasto vista desde los cobros y el panel (spec 009, R8). */
export const ParteGasto = ParteReparto.extend({
  facturaId: z.uuid(),
  tipoGastoId: z.uuid().nullable(),
  periodoInicio: Fecha,
  periodoFin: Fecha,
  mes: Mes,
}).meta({ id: 'ParteGasto' });
export type ParteGasto = z.infer<typeof ParteGasto>;

/** R11: marcar pagada (fecha no posterior a hoy) o pendiente (null). */
export const EdicionParte = z.strictObject({ pagadoEn: Fecha.nullable() }).meta({ id: 'EdicionParte' });
export type EdicionParte = z.infer<typeof EdicionParte>;
