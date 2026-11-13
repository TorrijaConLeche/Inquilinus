import { ErrorValidacion } from './errores.ts';
import { aDia, desdeDia, type Fecha } from './fechas.ts';
import { calcularTramos, ordenInquilinos, presentesPorDia, type Ocupacion } from './presencia.ts';
import { mcm, repartirConTotal, repartirMayorResto } from './redondeo.ts';

export interface EntradaRepartoSuministro {
  /** Primer día de la factura (inclusive). */
  inicio: Fecha;
  /** Último día de la factura (inclusive). */
  fin: Fecha;
  /** Importe total en céntimos. */
  importe: number;
  ocupaciones: readonly Ocupacion[];
}

export interface LineaRepartoSuministro {
  inquilinoId: string;
  dias: number;
  /** Céntimos. */
  importe: number;
}

/** Días seguidos con los mismos inquilinos presentes (detalle del cálculo, spec 004 R7). */
export interface TramoReparto {
  desde: Fecha;
  hasta: Fecha;
  dias: number;
  /** Inquilinos presentes, en el orden de las líneas. Vacío = sin ocupar. */
  presentes: string[];
  /** Parte de cada presente en este tramo, en céntimos. Por inquilino, suma su importe total. */
  partes: { inquilinoId: string; importe: number }[];
}

export interface ResultadoRepartoSuministro {
  lineas: LineaRepartoSuministro[];
  sinOcupar: { dias: number; importe: number };
  tramos: TramoReparto[];
}

/** Spec 001 · Reparto de suministros prorrateado por días entre los inquilinos presentes. */
export function repartirSuministro(entrada: EntradaRepartoSuministro): ResultadoRepartoSuministro {
  const inicio = aDia(entrada.inicio);
  const fin = aDia(entrada.fin);
  if (fin < inicio) {
    throw new ErrorValidacion('PERIODO_INVALIDO', 'La fecha de fin es anterior a la de inicio');
  }
  if (!Number.isSafeInteger(entrada.importe) || entrada.importe < 0) {
    throw new ErrorValidacion('IMPORTE_INVALIDO', 'El importe debe ser un número entero de céntimos no negativo');
  }

  const tramos = calcularTramos(entrada.ocupaciones);
  const dias = presentesPorDia(tramos, inicio, fin);
  const numDias = BigInt(dias.length);
  const importe = BigInt(entrada.importe);

  // Importe exacto de cada inquilino = importe × Σ 1 / (numDias × presentes del día).
  // Se trabaja con denominador común numDias × L, donde L es el mcm de los presentes por día.
  const L = dias.reduce((acc, p) => (p.size > 0 ? mcm(acc, BigInt(p.size)) : acc), 1n);
  const numeradores = new Map<string, bigint>();
  const diasPorInquilino = new Map<string, number>();
  let diasSinOcupar = 0;

  for (const presentes of dias) {
    if (presentes.size === 0) {
      diasSinOcupar++;
      continue;
    }
    const parte = (importe * L) / BigInt(presentes.size);
    for (const id of presentes) {
      numeradores.set(id, (numeradores.get(id) ?? 0n) + parte);
      diasPorInquilino.set(id, (diasPorInquilino.get(id) ?? 0) + 1);
    }
  }

  const orden = ordenInquilinos(tramos).filter((id) => numeradores.has(id));
  const redondeados = repartirMayorResto(
    [...orden.map((id) => numeradores.get(id)!), importe * L * BigInt(diasSinOcupar)],
    numDias * L,
  );

  // Detalle por tramos: días seguidos con los mismos presentes. La parte redondeada de cada
  // inquilino se reparte entre sus tramos, para que el detalle sume exactamente su importe.
  const posicion = new Map(orden.map((id, i) => [id, i]));
  const segmentos: { desde: number; hasta: number; presentes: string[] }[] = [];
  dias.forEach((presentes, d) => {
    const ids = [...presentes].sort((a, b) => posicion.get(a)! - posicion.get(b)!);
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.presentes.join('\u0000') === ids.join('\u0000')) ultimo.hasta = d;
    else segmentos.push({ desde: d, hasta: d, presentes: ids });
  });
  const partes = segmentos.map(() => new Map<string, number>());
  orden.forEach((id, i) => {
    const indices: number[] = [];
    const exactos: bigint[] = [];
    segmentos.forEach((seg, j) => {
      if (!seg.presentes.includes(id)) return;
      indices.push(j);
      exactos.push((importe * L * BigInt(seg.hasta - seg.desde + 1)) / BigInt(seg.presentes.length));
    });
    const reparto = repartirConTotal(exactos, numDias * L, redondeados[i]!);
    indices.forEach((j, k) => partes[j]!.set(id, reparto[k]!));
  });

  return {
    tramos: segmentos.map((seg, j) => ({
      desde: desdeDia(inicio + seg.desde),
      hasta: desdeDia(inicio + seg.hasta),
      dias: seg.hasta - seg.desde + 1,
      presentes: seg.presentes,
      partes: seg.presentes.map((id) => ({ inquilinoId: id, importe: partes[j]!.get(id)! })),
    })),
    lineas: orden.map((id, i) => ({
      inquilinoId: id,
      dias: diasPorInquilino.get(id)!,
      importe: redondeados[i]!,
    })),
    sinOcupar: { dias: diasSinOcupar, importe: redondeados[orden.length]! },
  };
}

/** Spec 001, R13: ¿cambia el reparto? Cuenta lo de cada inquilino y lo sin ocupar, no el orden. */
export function repartosDistintos(a: ResultadoRepartoSuministro, b: ResultadoRepartoSuministro): boolean {
  const clave = (r: ResultadoRepartoSuministro) =>
    [...r.lineas.map((l) => `${l.inquilinoId}:${l.dias}:${l.importe}`).sort(), `sin:${r.sinOcupar.dias}:${r.sinOcupar.importe}`].join("|");
  return clave(a) !== clave(b);
}
