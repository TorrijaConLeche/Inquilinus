import { describe, expect, it } from 'vitest';
import { generarOpenApi, RespuestaError, RespuestaSalud } from '../src/index.ts';

describe('OpenAPI', () => {
  it('genera un documento 3.1 con la ruta de salud', () => {
    const documento = generarOpenApi();
    expect(documento.openapi).toBe('3.1.0');
    expect(documento.paths?.['/salud']?.get?.operationId).toBe('consultarSalud');
  });

  it('registra los esquemas como componentes reutilizables', () => {
    const esquemas = generarOpenApi().components?.schemas ?? {};
    expect(Object.keys(esquemas)).toEqual(expect.arrayContaining(['RespuestaSalud', 'RespuestaError']));
    expect(esquemas['RespuestaSalud']).toMatchObject({
      type: 'object',
      required: ['estado'],
    });
  });

  it('cada operación tiene un operationId único', () => {
    const ids = Object.values(generarOpenApi().paths ?? {}).flatMap((ruta) =>
      Object.values(ruta ?? {}).flatMap((operacion) =>
        typeof operacion === 'object' && operacion && 'operationId' in operacion
          ? [operacion.operationId]
          : [],
      ),
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('esquemas', () => {
  it('RespuestaSalud acepta la respuesta sin base de datos y con ella', () => {
    expect(RespuestaSalud.parse({ estado: 'ok' })).toEqual({ estado: 'ok' });
    expect(RespuestaSalud.parse({ estado: 'error', baseDatos: 'error' })).toEqual({
      estado: 'error',
      baseDatos: 'error',
    });
  });

  it('RespuestaSalud rechaza estados desconocidos', () => {
    expect(RespuestaSalud.safeParse({ estado: 'regular' }).success).toBe(false);
  });

  it('RespuestaError solo admite el código de error', () => {
    expect(RespuestaError.parse({ error: 'interno', mensaje: 'x' })).toEqual({ error: 'interno' });
  });
});
