import { ErrorValidacion } from './errores.ts';

/** Día natural en formato `YYYY-MM-DD`, sin hora ni zona horaria. */
export type Fecha = string;

/** Mes natural en formato `YYYY-MM`. */
export type Mes = string;

const MS_POR_DIA = 86_400_000;
const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_MES = /^(\d{4})-(\d{2})$/;

/** Convierte una fecha en un número de día (días desde 1970-01-01, UTC). */
export function aDia(fecha: Fecha): number {
  const m = RE_FECHA.exec(fecha);
  if (!m) throw new ErrorValidacion('FECHA_INVALIDA', `Fecha inválida: ${fecha}`);
  const [, y, mes, d] = m;
  const ms = Date.UTC(Number(y), Number(mes) - 1, Number(d));
  if (desdeDia(ms / MS_POR_DIA) !== fecha) {
    throw new ErrorValidacion('FECHA_INVALIDA', `Fecha inexistente: ${fecha}`);
  }
  return ms / MS_POR_DIA;
}

export function desdeDia(dia: number): Fecha {
  return new Date(dia * MS_POR_DIA).toISOString().slice(0, 10);
}

const FORMATO_MADRID = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día natural en hora de Madrid de un instante (procesos diarios y contadores mensuales). */
export function fechaEnMadrid(instante: Date | string): Fecha {
  return FORMATO_MADRID.format(typeof instante === 'string' ? new Date(instante) : instante);
}

/** Mes (`YYYY-MM`) al que pertenece una fecha. */
export function mesDe(fecha: Fecha): Mes {
  aDia(fecha);
  return fecha.slice(0, 7);
}

/** Día del mes (1-31) de una fecha. */
export function diaDelMes(fecha: Fecha): number {
  aDia(fecha);
  return Number(fecha.slice(8, 10));
}

/** Fecha de un día concreto de un mes. Si el mes no tiene ese día, el último del mes. */
export function fechaEnMes(mes: Mes, dia: number): Fecha {
  const { inicio, dias } = rangoDelMes(mes);
  return desdeDia(inicio + Math.min(dia, dias) - 1);
}

/** Suma meses a una fecha. Si el día no existe en el mes de destino, se usa el último día. */
export function sumarMeses(fecha: Fecha, meses: number): Fecha {
  aDia(fecha);
  const total = Number(fecha.slice(0, 4)) * 12 + Number(fecha.slice(5, 7)) - 1 + meses;
  const mes = `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
  return fechaEnMes(mes, diaDelMes(fecha));
}

/** Primer y último día del mes (ambos inclusive) y número de días. */
export function rangoDelMes(mes: Mes): { inicio: number; fin: number; dias: number } {
  const m = RE_MES.exec(mes);
  const numMes = m ? Number(m[2]) : 0;
  if (!m || numMes < 1 || numMes > 12) {
    throw new ErrorValidacion('MES_INVALIDO', `Mes inválido: ${mes}`);
  }
  const anio = Number(m[1]);
  const inicio = Date.UTC(anio, numMes - 1, 1) / MS_POR_DIA;
  const fin = Date.UTC(anio, numMes, 1) / MS_POR_DIA - 1;
  return { inicio, fin, dias: fin - inicio + 1 };
}
