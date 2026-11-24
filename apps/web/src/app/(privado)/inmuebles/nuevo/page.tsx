import { hoyEnMadrid, mesEnMadrid } from "@inquilinus/api";
import { altaDeInmueble } from "@inquilinus/domain";
import { getTranslations } from "next-intl/server";
import { Planes } from "../../../../componentes/Planes";
import { CORREO_SOPORTE } from "../../../../lib/soporte";
import { planDe, usuarioActual } from "../../../../servidor/api";
import estilos from "../../privado.module.css";
import { Asistente } from "./Asistente";

export async function generateMetadata() {
  const t = await getTranslations("Asistente");
  return { title: t("titulo") };
}

/**
 * Asistente de alta del inmueble (spec 007, R1). Si el plan ya no admite más, en su lugar
 * se explica el límite y el paso siguiente (spec 010, R1); la API lo vuelve a comprobar.
 */
export default async function NuevoInmueble() {
  const t = await getTranslations("Asistente");
  const tp = await getTranslations("Plan");
  const usuario = await usuarioActual();
  const plan = usuario ? await planDe(usuario) : null;
  const paso = plan
    ? altaDeInmueble(plan.plan, plan.inmuebles.activos.length + plan.inmuebles.bloqueados.length)
    : "permitida";

  if (plan && paso !== "permitida") {
    return (
      <>
        <h1 className={estilos.titulo}>{tp("limiteTitulo")}</h1>
        <section className={estilos.seccion}>
          {paso === "subir_de_plan" ? (
            <>
              <p>{tp("limiteTexto", { plan: tp(`nombres.${plan.plan}`), n: plan.limites.inmuebles })}</p>
              <p>{tp("limiteSubir")}</p>
              <Planes actual={plan.plan} />
            </>
          ) : (
            <>
              <p>{tp("limiteMaximo", { n: plan.limites.inmuebles })}</p>
              {CORREO_SOPORTE && (
                <p>{tp("soporte", { correo: CORREO_SOPORTE })}</p>
              )}
            </>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <h1 className={estilos.titulo}>{t("titulo")}</h1>
      <Asistente mesActual={mesEnMadrid()} hoy={hoyEnMadrid()} />
    </>
  );
}
