import { ErrorValidacion } from './errores.ts';
import { aDia, type Fecha } from './fechas.ts';
import { calcularTramos, ordenInquilinos, presentesPorDia, type Ocupacion } from './presencia.ts';
import { mcm, repartirMayorResto } from './redondeo.ts';

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

export interface ResultadoRepartoSuministro {
  lineas: LineaRepartoSuministro[];
  sinOcupar: { dias: number; importe: number };
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

  return {
    lineas: orden.map((id, i) => ({
      inquilinoId: id,
      dias: diasPorInquilino.get(id)!,
      importe: redondeados[i]!,
    })),
    sinOcupar: { dias: diasSinOcupar, importe: redondeados[orden.length]! },
  };
}
