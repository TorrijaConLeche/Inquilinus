import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PlantillaAcceso } from "../../../componentes/PlantillaAcceso";
import { claveDeError } from "../../../lib/errores";
import { googleDisponible, usuarioActual } from "../../../servidor/api";
import { FormularioRegistro } from "./FormularioRegistro";

export async function generateMetadata() {
  const t = await getTranslations("Registro");
  return { title: t("titulo") };
}

export default async function Registro({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await usuarioActual()) redirect("/panel");
  const { error } = await searchParams;
  const t = await getTranslations("Registro");
  return (
    <PlantillaAcceso titulo={t("titulo")} subtitulo={t("subtitulo")}>
      <FormularioRegistro google={googleDisponible} errorInicial={error ? claveDeError(error) : null} />
    </PlantillaAcceso>
  );
}
