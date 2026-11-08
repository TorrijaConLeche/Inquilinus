import { VERSION_TERMINOS } from "@inquilinus/contracts";
import { getTranslations } from "next-intl/server";
import { Aviso } from "../../componentes/Aviso";
import { PlantillaAcceso } from "../../componentes/PlantillaAcceso";

/** Página provisional: los textos definitivos llegan en la tarea 2.8. */
export async function TextoLegal({ documento }: { documento: "privacidad" | "terminos" }) {
  const t = await getTranslations("Legal");
  return (
    <PlantillaAcceso titulo={t(`${documento}.titulo`)}>
      <Aviso tipo="info">{t("borrador", { version: VERSION_TERMINOS })}</Aviso>
    </PlantillaAcceso>
  );
}
