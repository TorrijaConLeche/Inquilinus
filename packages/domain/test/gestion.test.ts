import { describe, expect, it } from 'vitest';
import {
  accionAlEliminar,
  confirmaBorradoInmueble,
  esInquilinoAntiguo,
  estanciaVigente,
  ErrorValidacion,
  mesesAfectadosPorCambioDePrecio,
  nombreAnonimo,
  normalizarAltaInmueble,
  precioVigente,
  TAMANO_MAXIMO_DOCUMENTO,
  validarDocumento,
  validarFianza,
  validarInquilino,
  validarOcupaciones,
} from '../src/index.ts';

// Spec 007 · Gestión de inmuebles, habitaciones, inquilinos y ocupaciones (parte de dominio).
describe('Spec 007 · Gestión', () => {
  it('C1 · alta mínima con valores por defecto (R1)', () => {
    expect(
      normalizarAltaInmueble({
        nombre: ' Piso Centro ',
        modalidad: 'habitaciones',
        habitaciones: [{ nombre: 'H1', precioMensual: 50000 }],
      }),
    ).toEqual({
      nombre: 'Piso Centro',
      direccion: null,
      modalidad: 'habitaciones',
      mesesParciales: 'mes_completo',
      diaCobro: 1,
      habitaciones: [{ nombre: 'H1', precioMensual: 50000 }],
    });
  });

  it('C2 · sin habitaciones (R1)', () => {
    expect(() => normalizarAltaInmueble({ nombre: 'Piso', modalidad: 'entero', habitaciones: [] })).toThrow(
      ErrorValidacion,
    );
  });

  it('C3 · cambio de precio desde un mes (R4)', () => {
    const historial = [
      { desdeMes: '2026-01', precioMensual: 50000 },
      { desdeMes: '2027-01', precioMensual: 55000 },
    ];
    expect(precioVigente(historial, '2026-12')).toBe(50000);
    expect(precioVigente(historial, '2027-01')).toBe(55000);
    expect(() => precioVigente(historial, '2025-12')).toThrow(ErrorValidacion);
  });

  it('C4 · cambio de precio que afecta a meses con cobros (R5)', () => {
    expect(mesesAfectadosPorCambioDePrecio('2026-11', ['2026-10', '2026-11'])).toEqual(['2026-11']);
  });

  it('C5 · inquilino sin nombre (R6)', () => {
    expect(() => validarInquilino({ nombre: '   ' })).toThrow(ErrorValidacion);
    expect(validarInquilino({ nombre: ' Alex ' })).toEqual({ nombre: 'Alex' });
  });

  it('C6 · solape de ocupaciones (R7)', () => {
    expect(() =>
      validarOcupaciones([
        { habitacionId: 'H1', inquilinoId: 'A', entrada: '2026-09-01' },
        { habitacionId: 'H1', inquilinoId: 'B', entrada: '2026-10-01' },
      ]),
    ).toThrow(ErrorValidacion);
  });

  it('C7 · cambio de habitación (R8)', () => {
    expect(
      validarOcupaciones([
        { habitacionId: 'H1', inquilinoId: 'A', entrada: '2026-09-01', salida: '2026-10-14' },
        { habitacionId: 'H2', inquilinoId: 'A', entrada: '2026-10-15' },
      ]).length,
    ).toBe(2);
  });

  it('C8 · archivar o borrar (R11)', () => {
    expect(accionAlEliminar(true)).toBe('archivar');
    expect(accionAlEliminar(false)).toBe('borrar');
  });

  it('C9 · nombre anonimizado (R12)', () => {
    expect(nombreAnonimo(1)).toBe('Inquilino 1');
  });

  it('C16 · estancia vigente: sin salida, con salida desde hoy o futura (R11b)', () => {
    const hoy = '2026-11-15';
    expect(estanciaVigente({ salida: null }, hoy)).toBe(true);
    expect(estanciaVigente({ salida: '2026-11-15' }, hoy)).toBe(true);
    expect(estanciaVigente({ salida: '2026-12-31' }, hoy)).toBe(true);
    expect(estanciaVigente({ salida: '2026-11-14' }, hoy)).toBe(false);
  });

  it('C18 · inquilinos antiguos (R11d)', () => {
    const hoy = '2026-11-15';
    expect(esInquilinoAntiguo([{ salida: '2026-10-31' }], hoy)).toBe(true);
    expect(esInquilinoAntiguo([{ salida: '2026-10-31' }, { salida: '2026-11-30' }], hoy)).toBe(false);
    expect(esInquilinoAntiguo([{ salida: '2026-11-30' }], hoy)).toBe(false);
    // Sin estancias todavía no es antiguo: aún no ha entrado.
    expect(esInquilinoAntiguo([], hoy)).toBe(false);
  });

  it('C10 · confirmación al borrar un inmueble (R13)', () => {
    expect(confirmaBorradoInmueble('Piso Centro', 'Piso centro')).toBe(false);
    expect(confirmaBorradoInmueble('Piso Centro', 'Piso Centro')).toBe(true);
  });

  const bytes = (texto: string) => new TextEncoder().encode(texto);

  it('C11 · documento que no es PDF (R6b)', () => {
    expect(() => validarDocumento(bytes('Esto es un texto con extensión .pdf'))).toThrow(ErrorValidacion);
    expect(() => validarDocumento(bytes(''))).toThrow(ErrorValidacion);
    expect(() => validarDocumento(bytes('%PDF-1.7\n...'))).not.toThrow();
    // La cabecera puede ir detrás de algo de basura, pero dentro de los primeros 1024 bytes.
    expect(() => validarDocumento(bytes(`${' '.repeat(100)}%PDF-1.4`))).not.toThrow();
    expect(() => validarDocumento(bytes(`${' '.repeat(1100)}%PDF-1.4`))).toThrow(ErrorValidacion);
  });

  it('documento de más de 10 MB (R6b)', () => {
    const grande = new Uint8Array(TAMANO_MAXIMO_DOCUMENTO + 1);
    grande.set(bytes('%PDF-1.7'));
    expect(() => validarDocumento(grande)).toThrow(ErrorValidacion);
  });

  it('C14 · devolución mayor que la fianza (R6d)', () => {
    expect(() => validarFianza({ importe: 80_000, devueltaEn: '2027-07-01', importeDevuelto: 90_000 })).toThrow(
      expect.objectContaining({ codigo: 'DEVOLUCION_MAYOR_QUE_FIANZA' }),
    );
  });

  it('C15 · devolución sin fecha (R6d)', () => {
    expect(() => validarFianza({ importe: 80_000, importeDevuelto: 80_000 })).toThrow(
      expect.objectContaining({ codigo: 'DEVOLUCION_INCOMPLETA' }),
    );
    expect(() => validarFianza({ importe: 80_000, devueltaEn: '2027-07-01' })).toThrow(
      expect.objectContaining({ codigo: 'DEVOLUCION_INCOMPLETA' }),
    );
  });

  it('fianza válida, con devolución parcial y notas (R6d)', () => {
    expect(validarFianza({ importe: 80_000 })).toEqual({
      importe: 80_000,
      recibidaEn: null,
      devueltaEn: null,
      importeDevuelto: null,
      notas: null,
    });
    expect(
      validarFianza({
        importe: 80_000,
        recibidaEn: '2026-09-01',
        devueltaEn: '2027-07-10',
        importeDevuelto: 75_000,
        notas: '  Pintura del cuarto  ',
      }),
    ).toMatchObject({ importeDevuelto: 75_000, notas: 'Pintura del cuarto' });
  });

  it('fianza no válida (R6d)', () => {
    const codigo = (codigo: string) => expect.objectContaining({ codigo });
    expect(() => validarFianza({ importe: 0 })).toThrow(codigo('IMPORTE_INVALIDO'));
    expect(() => validarFianza({ importe: 800.5 })).toThrow(codigo('IMPORTE_INVALIDO'));
    expect(() =>
      validarFianza({ importe: 80_000, recibidaEn: '2026-09-01', devueltaEn: '2026-08-31', importeDevuelto: 0 }),
    ).toThrow(codigo('DEVOLUCION_ANTES_DE_RECEPCION'));
    expect(() => validarFianza({ importe: 80_000, recibidaEn: '2026-02-30' })).toThrow(codigo('FECHA_INVALIDA'));
    expect(() => validarFianza({ importe: 80_000, notas: 'x'.repeat(301) })).toThrow(codigo('NOTAS_DEMASIADO_LARGAS'));
  });
});
