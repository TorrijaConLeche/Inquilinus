// Timeline del inmueble (spec 006): eje de días, rayitas de cada zoom,
// posiciones, carriles de facturas solapadas y chinchetas agrupadas.
// Las posiciones son índices de día dentro del eje (0 = su primer día).
import { aDia, desdeDia, rangoDelMes, sumarMeses, type Fecha } from './fechas.ts';

export type ZoomTimeline = 'mes' | 'trimestre' | 'anio';

/** R6b: cuántos días se ven de una vez con cada zoom (unos 2, 6 y 12 meses). */
export const DIAS_VISIBLES: Record<ZoomTimeline, number> = { mes: 61, trimestre: 183, anio: 365 };

export interface EjeTimeline {
  desde: Fecha;
  hasta: Fecha;
  /** Días del eje, ambos extremos incluidos. */
  dias: number;
}

/**
 * R6b: del primer mes con datos (o el anterior al de hoy, si es antes) al
 * último mes con datos (o el de hoy, si es después), meses completos. Si no
 * llega a `diasMinimos` (lo que se ve de una vez), empieza meses antes.
 */
export function ejeTimeline(fechas: readonly Fecha[], hoy: Fecha, diasMinimos = 0): EjeTimeline {
  const dias = [...fechas.map(aDia), aDia(sumarMeses(`${hoy.slice(0, 7)}-01`, -1)), aDia(hoy)];
  let desde = rangoDelMes(desdeDia(Math.min(...dias)).slice(0, 7)).inicio;
  const hasta = rangoDelMes(desdeDia(Math.max(...dias)).slice(0, 7)).fin;
  while (hasta - desde + 1 < diasMinimos) desde = aDia(sumarMeses(desdeDia(desde), -1));
  return { desde: desdeDia(desde), hasta: desdeDia(hasta), dias: hasta - desde + 1 };
}

/** Índice del día de `fecha` en el eje (puede quedar fuera: negativo o ≥ dias). */
export function diaEnEje(eje: EjeTimeline, fecha: Fecha): number {
  return aDia(fecha) - aDia(eje.desde);
}

export interface Marca {
  dia: number;
  fecha: Fecha;
  /** R1: el 1 y el 15 (zoom mes) o el 1 de cada mes (trimestre y año) son más largas. */
  larga: boolean;
  /** Qué etiqueta lleva: «1 sep» (`dia`) o el mes (`mes`); null, ninguna. */
  etiqueta: 'dia' | 'mes' | null;
}

/**
 * R1 y R6: mes, una rayita por día (el 1 y el 15, largas y con etiqueta);
 * trimestre, una por semana (los lunes) más el 1 de cada mes; año, el 1 de
 * cada mes. Con trimestre y año, el 1 de cada mes lleva la etiqueta del mes.
 */
export function marcasTimeline(eje: EjeTimeline, zoom: ZoomTimeline): Marca[] {
  const inicio = aDia(eje.desde);
  const marcas: Marca[] = [];
  for (let i = 0; i < eje.dias; i++) {
    const fecha = desdeDia(inicio + i);
    const diaMes = Number(fecha.slice(8, 10));
    // 1970-01-01 fue jueves: (día + 3) % 7 === 0 es lunes.
    const lunes = (((inicio + i + 3) % 7) + 7) % 7 === 0;
    if (zoom === 'mes') {
      const larga = diaMes === 1 || diaMes === 15;
      marcas.push({ dia: i, fecha, larga, etiqueta: larga ? 'dia' : null });
    } else if (diaMes === 1) {
      marcas.push({ dia: i, fecha, larga: true, etiqueta: 'mes' });
    } else if (zoom === 'trimestre' && lunes) {
      marcas.push({ dia: i, fecha, larga: false, etiqueta: null });
    }
  }
  return marcas;
}

/**
 * Un tramo [inicio, fin] (fin incluido) en índices del eje, recortado a él.
 * Sin fin llega al borde derecho (R5). Null si queda entero fuera.
 */
export function tramoEnEje(eje: EjeTimeline, inicio: Fecha, fin: Fecha | null): { desde: number; hasta: number } | null {
  const desde = diaEnEje(eje, inicio);
  const hasta = fin === null ? eje.dias - 1 : diaEnEje(eje, fin);
  if (hasta < 0 || desde > eje.dias - 1 || hasta < desde) return null;
  return { desde: Math.max(0, desde), hasta: Math.min(eje.dias - 1, hasta) };
}

/**
 * R4b: carril de cada tramo para que los que se solapan no se pisen (el
 * primero libre, por orden de inicio). Devuelve el carril de cada uno, en el
 * orden de entrada.
 */
export function carriles(tramos: readonly { inicio: Fecha; fin: Fecha }[]): number[] {
  const orden = tramos
    .map((t, i) => ({ i, inicio: aDia(t.inicio), fin: aDia(t.fin) }))
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin || a.i - b.i);
  const finDeCarril: number[] = [];
  const resultado = new Array<number>(tramos.length);
  for (const t of orden) {
    let carril = finDeCarril.findIndex((fin) => fin < t.inicio);
    if (carril === -1) carril = finDeCarril.length;
    finDeCarril[carril] = t.fin;
    resultado[t.i] = carril;
  }
  return resultado;
}

/** R10: «✓» si todos han pagado; si no, cuántos de cuántos. */
export interface EstadoPagoGrupo {
  pagados: number;
  total: number;
  completo: boolean;
}

export function estadoPagoGrupo(pagados: readonly boolean[]): EstadoPagoGrupo {
  const n = pagados.filter(Boolean).length;
  return { pagados: n, total: pagados.length, completo: pagados.length > 0 && n === pagados.length };
}

export interface ChinchetaAlquiler {
  fecha: Fecha;
  /** Suma de los cobros de esa fecha, en céntimos. */
  importe: number;
  ids: string[];
  estado: EstadoPagoGrupo;
}

/** R3 y R3b: una chincheta por fecha de cobro, con la suma y el estado del grupo. Por fecha. */
export function chinchetasAlquiler(
  cobros: readonly { id: string; fechaCobro: Fecha; importe: number; pagado: boolean }[],
): ChinchetaAlquiler[] {
  const porFecha = new Map<Fecha, (typeof cobros)[number][]>();
  for (const c of cobros) porFecha.set(c.fechaCobro, [...(porFecha.get(c.fechaCobro) ?? []), c]);
  return [...porFecha]
    .sort(([a], [b]) => aDia(a) - aDia(b))
    .map(([fecha, grupo]) => ({
      fecha,
      importe: grupo.reduce((s, c) => s + c.importe, 0),
      ids: grupo.map((c) => c.id),
      estado: estadoPagoGrupo(grupo.map((c) => c.pagado)),
    }));
}

export type FilaTimeline =
  | { tipo: 'alquiler' }
  | { tipo: 'gasto'; tipoGastoId: string }
  | { tipo: 'inquilino'; inquilinoId: string };

/**
 * R2 y R2b: Alquiler; los tipos de gasto en orden de creación (los archivados,
 * solo con facturas repartidas); los inquilinos que han tenido alguna estancia.
 */
export function filasTimeline(datos: {
  tiposGasto: readonly { id: string; archivado: boolean }[];
  conFacturas: ReadonlySet<string>;
  inquilinos: readonly { id: string; estancias: number }[];
}): FilaTimeline[] {
  return [
    { tipo: 'alquiler' },
    ...datos.tiposGasto
      .filter((tg) => !tg.archivado || datos.conFacturas.has(tg.id))
      .map((tg) => ({ tipo: 'gasto' as const, tipoGastoId: tg.id })),
    ...datos.inquilinos.filter((q) => q.estancias > 0).map((q) => ({ tipo: 'inquilino' as const, inquilinoId: q.id })),
  ];
}
