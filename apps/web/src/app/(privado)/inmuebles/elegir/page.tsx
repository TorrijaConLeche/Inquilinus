import { getTranslations } from "next-intl/server";
import Link from "next/link";
import formulario from "../../../../componentes/formulario.module.css";
import { inmueblesDe, planDe, usuarioActual } from "../../../../servidor/api";
import estilos from "../../privado.module.css";
import { Eleccion } from "./Eleccion";

export async function generateMetadata() {
  const t = await getTranslations("Elegir");
  return { title: t("titulo") };
}

/** Spec 010, R10 y R10c: la usuaria elige, una vez con cada plan, qué inmuebles siguen activos. */
export default async function ElegirInmuebles() {
  const t = await getTranslations("Elegir");
  const tp = await getTranslations("Plan");
  const usuario = await usuarioActual();
  const [plan, inmuebles] = usuario ? await Promise.all([planDe(usuario), inmueblesDe(usuario)]) : [null, []];

  return (
    <>
      <h1 className={estilos.titulo}>{t("titulo")}</h1>
      {!plan?.puedeElegir ? (
        <section className={estilos.seccion}>
          <p>{t("noDisponible")}</p>
          <div>
            <Link href="/inmuebles" className={formulario.botonSecundario}>
              {t("volver")}
            </Link>
          </div>
        </section>
      ) : (
        <section className={estilos.seccion}>
          <p>{t("explicacion", { plan: tp(`nombres.${plan.plan}`), n: plan.limites.inmuebles })}</p>
          <p className={estilos.suave}>
            {t("unaVez")} {t("provisional")}
          </p>
          <Eleccion
            inmuebles={inmuebles.filter((i) => !i.archivado).map((i) => ({ id: i.id, nombre: i.nombre }))}
            activos={plan.inmuebles.activos}
            limite={plan.limites.inmuebles}
          />
        </section>
      )}
    </>
  );
}
