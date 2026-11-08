import { getTranslations } from "next-intl/server";
import { TextoLegal } from "../TextoLegal";

export async function generateMetadata() {
  const t = await getTranslations("Legal");
  return { title: t("terminos.titulo") };
}

export default function Terminos() {
  return <TextoLegal documento="terminos" />;
}
