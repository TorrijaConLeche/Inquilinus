import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PlantillaAcceso } from "../../../componentes/PlantillaAcceso";
import { claveDeError } from "../../../lib/errores";
import { googleDisponible, usuarioActual } from "../../../servidor/api";
import { FormularioAcceso } from "./FormularioAcceso";

export async function generateMetadata() {
  const t = await getTranslations("Acceso");
  return { title: t("titulo") };
}

export default async function Acceso({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; contrasena?: string }>;
}) {
  // Tras verificar el email (enlace con callback /acceso) ya hay sesión: al panel.
  if (await usuarioActual()) redirect("/panel");
  const { error, contrasena } = await searchParams;
  const t = await getTranslations("Acceso");
  return (
    <PlantillaAcceso titulo={t("titulo")} subtitulo={t("subtitulo")}>
      <FormularioAcceso
        google={googleDisponible}
        errorInicial={error ? claveDeError(error) : null}
        avisoInicial={contrasena === "cambiada" ? "contrasenaCambiada" : null}
      />
    </PlantillaAcceso>
  );
}
