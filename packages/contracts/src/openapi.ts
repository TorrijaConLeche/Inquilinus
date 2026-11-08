import { createDocument } from 'zod-openapi';
import { RespuestaError } from './comunes.ts';
import { rutasSalud } from './salud.ts';

/** Documento OpenAPI de la API, generado a partir de los esquemas Zod. */
export function generarOpenApi() {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Inquilinus API',
      version: '0.0.0',
    },
    components: {
      schemas: { RespuestaError },
    },
    paths: {
      ...rutasSalud,
    },
  });
}
