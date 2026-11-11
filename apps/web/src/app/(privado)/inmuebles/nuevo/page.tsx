import { hoyEnMadrid, mesEnMadrid } from "@inquilinus/api";
import { getTranslations } from "next-intl/server";
import estilos from "../../privado.module.css";
import { Asistente } from "./Asistente";

export async function generateMetadata() {
  const t = await getTranslations("Asistente");
  return { title: t("titulo") };
}

/** Asistente de alta del inmueble (spec 007, R1). */
export default async function NuevoInmueble() {
  const t = await getTranslations("Asistente");
  return (
    <>
      <h1 className={estilos.titulo}>{t("titulo")}</h1>
      <Asistente mesActual={mesEnMadrid()} hoy={hoyEnMadrid()} />
    </>
  );
}
