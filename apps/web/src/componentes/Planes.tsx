import { LIMITES, PRECIOS, type Plan } from "@inquilinus/domain";
import { getLocale, getTranslations } from "next-intl/server";
import { formatoEuros } from "../lib/dinero";
import estilos from "./planes.module.css";

const PLANES: readonly Plan[] = ["starter", "plus", "advanced"];

/**
 * Spec 010: los tres planes con su precio y sus límites. Hasta que llegue el pago con
 * Paddle, en lugar del botón de suscribirse dice que llegará pronto.
 */
export async function Planes({ actual }: { actual: Plan }) {
  const t = await getTranslations("Plan");
  const idioma = await getLocale();
  const euros = (centimos: number) => formatoEuros(centimos, idioma);
  return (
    <div className={estilos.planes}>
      <ul className={estilos.lista}>
        {PLANES.map((plan) => (
          <li key={plan} className={plan === actual ? estilos.planActual : estilos.plan}>
            <div className={estilos.cabecera}>
              <strong>{t(`nombres.${plan}`)}</strong>
              {plan === actual && <span className={estilos.etiqueta}>{t("tuPlan")}</span>}
            </div>
            <span className={estilos.precio}>
              {plan === "starter"
                ? t("gratis")
                : t("precio", { mensual: euros(PRECIOS[plan].mensual), anual: euros(PRECIOS[plan].anual) })}
            </span>
            <ul className={estilos.limites}>
              <li>{t("limiteInmuebles", { n: LIMITES[plan].inmueblesActivos })}</li>
              <li>{plan === "starter" ? t("iaStarter", { n: LIMITES.starter.facturasIaAlMes }) : t("iaSinLimite")}</li>
            </ul>
          </li>
        ))}
      </ul>
      <p className={estilos.pronto}>{t("muyPronto")}</p>
    </div>
  );
}
