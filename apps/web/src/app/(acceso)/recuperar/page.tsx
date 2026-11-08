import { getTranslations } from "next-intl/server";
import { PlantillaAcceso } from "../../../componentes/PlantillaAcceso";
import { FormularioRecuperar } from "./FormularioRecuperar";

export async function generateMetadata() {
  const t = await getTranslations("Recuperar");
  return { title: t("titulo") };
}

export default async function Recuperar() {
  const t = await getTranslations("Recuperar");
  return (
    <PlantillaAcceso titulo={t("titulo")} subtitulo={t("subtitulo")}>
      <FormularioRecuperar />
    </PlantillaAcceso>
  );
}
