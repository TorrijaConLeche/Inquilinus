// Spec 010, R16c: precios y límites de cada plan para la página de precios, siempre
// desde packages/domain (los mismos que usa la app), nunca escritos a mano.
import { LIMITES, PRECIOS, type Plan } from "@inquilinus/domain";
import { formatoEuros } from "./dinero";

export interface PrecioPlan {
  plan: Plan;
  /** Con IVA incluido; null en Starter (gratis). */
  mensual: string | null;
  anual: string | null;
  /** Meses que se ahorran pagando al año. */
  mesesGratis: number | null;
  inmuebles: number;
  facturasIaAlMes: number;
}

const PLANES: readonly Plan[] = ["starter", "plus", "advanced"];

export function preciosDePlanes(idioma: string): PrecioPlan[] {
  return PLANES.map((plan) => {
    const precio = plan === "starter" ? null : PRECIOS[plan];
    return {
      plan,
      mensual: precio ? formatoEuros(precio.mensual, idioma) : null,
      anual: precio ? formatoEuros(precio.anual, idioma) : null,
      mesesGratis: precio ? Math.round((precio.mensual * 12 - precio.anual) / precio.mensual) : null,
      inmuebles: LIMITES[plan].inmueblesActivos,
      facturasIaAlMes: LIMITES[plan].facturasIaAlMes,
    };
  });
}
