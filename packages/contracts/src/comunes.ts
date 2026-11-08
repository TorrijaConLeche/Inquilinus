import { z } from 'zod';

/** Cuerpo de cualquier respuesta de error. Nunca incluye datos personales. */
export const RespuestaError = z
  .object({
    error: z.string().meta({ example: 'no-encontrado' }),
  })
  .meta({ id: 'RespuestaError', description: 'Error sin detalles internos ni datos personales.' });
export type RespuestaError = z.infer<typeof RespuestaError>;
