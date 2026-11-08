import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Aviso } from "../../../componentes/Aviso";
import estilos from "../../../componentes/formulario.module.css";
import { PlantillaAcceso } from "../../../componentes/PlantillaAcceso";
import { FormularioRestablecer } from "./FormularioRestablecer";

export async function generateMetadata() {
  const t = await getTranslations("Restablecer");
  return { title: t("titulo") };
}

/** Destino del enlace del email: la API redirige aquí con ?token=… o con ?error=…. */
export default async function Restablecer({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const t = await getTranslations("Restablecer");
  const te = await getTranslations("Errores");
  return (
    <PlantillaAcceso titulo={t("titulo")}>
      {token && !error ? (
        <FormularioRestablecer token={token} />
      ) : (
        <div className={estilos.formulario}>
          <Aviso tipo="error">{te("enlaceNoValido")}</Aviso>
          <Link href="/recuperar" className={estilos.enlace}>
            {t("pedirOtro")}
          </Link>
        </div>
      )}
    </PlantillaAcceso>
  );
}
