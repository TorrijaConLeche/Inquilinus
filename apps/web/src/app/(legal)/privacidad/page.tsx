import { getTranslations } from "next-intl/server";
import { TextoLegal } from "../TextoLegal";

export async function generateMetadata() {
  const t = await getTranslations("Legal");
  return { title: t("privacidad.titulo") };
}

export default function Privacidad() {
  return <TextoLegal documento="privacidad" />;
}
