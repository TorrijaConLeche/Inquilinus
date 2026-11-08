import { getTranslations } from "next-intl/server";
import { usuarioActual } from "../../../servidor/api";
import estilos from "../privado.module.css";

export async function generateMetadata() {
  const t = await getTranslations("Panel");
  return { title: t("titulo") };
}

/** Panel provisional: el de verdad llega en la fase 4 (spec 009). */
export default async function Panel() {
  const t = await getTranslations("Panel");
  const usuario = await usuarioActual();
  return (
    <>
      <h1 className={estilos.titulo}>{usuario?.nombre ? t("saludoNombre", { nombre: usuario.nombre }) : t("saludo")}</h1>
      <section className={estilos.seccion}>
        <p>{t("proximamente")}</p>
        <p className={estilos.suave}>{t("cuenta", { email: usuario?.email ?? "" })}</p>
      </section>
    </>
  );
}
