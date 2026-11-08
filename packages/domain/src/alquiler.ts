import { ErrorValidacion } from './errores.ts';
import { rangoDelMes, type Mes } from './fechas.ts';
import { calcularTramos, ordenInquilinos, presentesPorDia, type Ocupacion } from './presencia.ts';
import { mcm, repartirMayorResto } from './redondeo.ts';

export type Modalidad = 'entero' | 'habitaciones';
export type MesesParciales = 'prorrateo' | 'mes_completo';

export interface Habitacion {
  id: string;
  /** Precio mensual en céntimos. */
  precioMensual: number;
}

export interface EntradaAlquilerMes {
  mes: Mes;
  modalidad: Modalidad;
  mesesParciales: MesesParciales;
  habitaciones: readonly Habitacion[];
  ocupaciones: readonly Ocupacion[];
}

export interface LineaAlquiler {
  inquilinoId: string;
  /** Renta de su habitación, en céntimos. */
  renta: number;
  /** Parte de la renta de habitaciones vacías (solo en modo entero), en céntimos. */
  recargoVacios: number;
  /** renta + recargoVacios. */
  importe: number;
}

export interface ResultadoAlquilerMes {
  lineas: LineaAlquiler[];
  /** Renta de habitaciones vacías que asume el propietario, en céntimos. */
  propietario: number;
  /** Suma de los precios de las habitaciones; solo informativa (R10). */
  rentaTotal: number;
}

/** Spec 002 · Cálculo del alquiler mensual. */
export function calcularAlquilerMes(entrada: EntradaAlquilerMes): ResultadoAlquilerMes {
  const { inicio, fin, dias: diasMes } = rangoDelMes(entrada.mes);
  const habitaciones = new Map<string, Habitacion>();
  for (const h of entrada.habitaciones) {
    if (!Number.isSafeInteger(h.precioMensual) || h.precioMensual < 0) {
      throw new ErrorValidacion('IMPORTE_INVALIDO', `Precio inválido en la habitación ${h.id}`);
    }
    habitaciones.set(h.id, h);
  }
  for (const o of entrada.ocupaciones) {
    if (!habitaciones.has(o.habitacionId)) {
      throw new ErrorValidacion('HABITACION_DESCONOCIDA', `Habitación desconocida: ${o.habitacionId}`);
    }
  }

  const tramos = calcularTramos(entrada.ocupaciones).filter((t) => t.hasta >= inicio && t.desde <= fin);
  const presentesInmueble = presentesPorDia(tramos, inicio, fin);
  const M = BigInt(diasMes);

  // Primera pasada: qué paga cada habitación y qué días queda vacía.
  interface Reparto {
    precio: bigint;
    diasOcupante: Map<string, number>;
    completo: boolean;
    diasVacios: number[];
  }
  const repartos: Reparto[] = [];
  for (const h of habitaciones.values()) {
    const diasOcupante = new Map<string, number>();
    const diasVacios: number[] = [];
    for (let d = 0; d < diasMes; d++) {
      const dia = inicio + d;
      const t = tramos.find((x) => x.habitacionId === h.id && x.desde <= dia && dia <= x.hasta);
      if (t) diasOcupante.set(t.inquilinoId, (diasOcupante.get(t.inquilinoId) ?? 0) + 1);
      else diasVacios.push(d);
    }
    // R3 / R3b: mes completo solo si un único inquilino ocupa la habitación ese mes.
    const completo = entrada.mesesParciales === 'mes_completo' && diasOcupante.size === 1;
    repartos.push({
      precio: BigInt(h.precioMensual),
      diasOcupante,
      completo,
      // R7: una habitación pagada como mes completo no tiene días vacíos ese mes.
      diasVacios: completo ? [] : diasVacios,
    });
  }

  // Denominador común: M × L, con L el mcm de los inquilinos presentes en días con vacíos a repartir.
  let L = 1n;
  if (entrada.modalidad === 'entero') {
    for (const r of repartos)
      for (const d of r.diasVacios) {
        const k = presentesInmueble[d]!.size;
        if (k > 0) L = mcm(L, BigInt(k));
      }
  }

  const renta = new Map<string, bigint>();
  const recargo = new Map<string, bigint>();
  let propietario = 0n;
  const sumar = (m: Map<string, bigint>, id: string, v: bigint) => m.set(id, (m.get(id) ?? 0n) + v);

  for (const r of repartos) {
    for (const [id, dias] of r.diasOcupante) {
      sumar(renta, id, r.completo ? r.precio * M * L : r.precio * BigInt(dias) * L);
    }
    for (const d of r.diasVacios) {
      const presentes = presentesInmueble[d]!;
      if (entrada.modalidad === 'entero' && presentes.size > 0) {
        // R5: a partes iguales entre los presentes ese día.
        const parte = (r.precio * L) / BigInt(presentes.size);
        for (const id of presentes) sumar(recargo, id, parte);
      } else {
        // R5 sin presentes, o R6 (por habitaciones): lo asume el propietario.
        propietario += r.precio * L;
      }
    }
  }

  const orden = ordenInquilinos(tramos);
  const redondeados = repartirMayorResto(
    [...orden.flatMap((id) => [renta.get(id) ?? 0n, recargo.get(id) ?? 0n]), propietario],
    M * L,
  );

  return {
    lineas: orden.map((id, i) => {
      const r = redondeados[2 * i]!;
      const v = redondeados[2 * i + 1]!;
      return { inquilinoId: id, renta: r, recargoVacios: v, importe: r + v };
    }),
    propietario: redondeados[orden.length * 2]!,
    rentaTotal: entrada.habitaciones.reduce((s, h) => s + h.precioMensual, 0),
  };
}
