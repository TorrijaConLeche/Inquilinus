import { getTranslations } from "next-intl/server";
import estilos from "./vista.module.css";

/** R4: el mismo mensaje sea cual sea el motivo, sin ningún dato. */
export default async function EnlaceNoDisponible() {
  const t = await getTranslations("Vista");
  return (
    <main className={estilos.pagina}>
      <section className={estilos.tarjeta}>
        <h1 className={estilos.titulo}>{t("noDisponible")}</h1>
        <p className={estilos.suave}>{t("noDisponibleTexto")}</p>
      </section>
    </main>
  );
}
