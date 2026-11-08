import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';

export const RespuestaSalud = z
  .object({
    estado: z.enum(['ok', 'error']),
    baseDatos: z.enum(['ok', 'error']).optional(),
  })
  .meta({
    id: 'RespuestaSalud',
    description: '`baseDatos` solo aparece cuando la API tiene base de datos configurada.',
  });
export type RespuestaSalud = z.infer<typeof RespuestaSalud>;

export const rutasSalud = {
  '/salud': {
    get: {
      operationId: 'consultarSalud',
      summary: 'Chequeo de salud',
      tags: ['Sistema'],
      responses: {
        '200': {
          description: 'La API funciona',
          content: { 'application/json': { schema: RespuestaSalud } },
        },
        '503': {
          description: 'La base de datos no responde',
          content: { 'application/json': { schema: RespuestaSalud } },
        },
      },
    },
  },
} satisfies ZodOpenApiPathsObject;
