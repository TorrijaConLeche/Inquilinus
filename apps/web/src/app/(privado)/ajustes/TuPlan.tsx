import type { EstadoPlan } from "@inquilinus/contracts";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Aviso } from "../../../componentes/Aviso";
import formulario from "../../../componentes/formulario.module.css";
import { Planes } from "../../../componentes/Planes";
import { formatoFecha } from "../../../lib/fechas";
import estilos from "../privado.module.css";

/** Spec 010: el plan de la cuenta, la cortesía (R15c), lo usado y los planes. */
export async function TuPlan({ estado }: { estado: EstadoPlan }) {
  const t = await getTranslations("Plan");
  const tp = await getTranslations("Panel");
  const idioma = await getLocale();
  const { cortesia, limites, lecturasIa, inmuebles } = estado;
  return (
    <section id="plan" className={estilos.seccion} aria-labelledby="titulo-plan">
      <h2 id="titulo-plan">{t("titulo")}</h2>
      <p>
        {cortesia
          ? cortesia.hasta
            ? t("cortesiaHasta", { fecha: formatoFecha(cortesia.hasta, idioma) })
            : t("cortesiaSinFin")
          : t("actual", { plan: t(`nombres.${estado.plan}`) })}
      </p>
      {cortesia?.avisarFin && cortesia.hasta && (
        <Aviso tipo="info">{tp("avisoFinCortesia", { fecha: formatoFecha(cortesia.hasta, idioma) })}</Aviso>
      )}
      <ul className={estilos.suave}>
        <li>{t("inmuebles", { activos: inmuebles.activos.length, limite: limites.inmuebles })}</li>
        <li>{t("lecturas", { usadas: Math.min(lecturasIa.usadas, limites.facturasIaAlMes), limite: limites.facturasIaAlMes })}</li>
        {inmuebles.bloqueados.length > 0 && <li>{t("bloqueados", { n: inmuebles.bloqueados.length })}</li>}
      </ul>
      {estado.puedeElegir && (
        <div>
          <Link href="/inmuebles/elegir" className={formulario.botonSecundario}>
            {t("elegir")}
          </Link>
        </div>
      )}
      <h3>{t("planes")}</h3>
      <Planes actual={estado.plan} />
      {/* Spec 010, R16d */}
      <p>
        <Link href="/precios" className={formulario.enlace}>
          {t("verPrecios")}
        </Link>
      </p>
    </section>
  );
}
