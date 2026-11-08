import { useTranslations } from "next-intl";
import estilos from "./page.module.css";

export default function Inicio() {
  const t = useTranslations("Inicio");
  return (
    <main className={estilos.principal}>
      <section className={estilos.tarjeta}>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.lema}>{t("lema")}</p>
        <span className={estilos.estado}>{t("estado")}</span>
      </section>
    </main>
  );
}
