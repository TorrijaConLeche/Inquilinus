import { z } from 'zod';

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
