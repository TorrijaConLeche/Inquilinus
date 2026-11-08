"use client";
import { COOKIE_IDIOMA, IDIOMAS, type Idioma } from "@inquilinus/contracts/idiomas";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { COOKIE_TEMA, TEMAS, type Tema } from "../../../lib/preferencias";
import { guardarPreferencia } from "../../../lib/preferencias";
import estilos from "../privado.module.css";

/** Idioma y tema de la app, guardados en cookies técnicas. */
export function Preferencias({ idioma, tema }: { idioma: Idioma; tema: Tema }) {
  const t = useTranslations("Ajustes");
  const router = useRouter();

  const cambiar = (cookie: string, valor: string) => {
    guardarPreferencia(cookie, valor);
    router.refresh();
  };

  return (
    <>
      <section className={estilos.seccion} aria-labelledby="titulo-idioma">
        <h2 id="titulo-idioma">{t("idioma")}</h2>
        <fieldset className={estilos.opciones}>
          <legend className="sr-only">{t("idioma")}</legend>
          {IDIOMAS.map((i) => (
            <label key={i} className={estilos.opcion}>
              <input
                type="radio"
                name="idioma"
                value={i}
                checked={idioma === i}
                onChange={() => cambiar(COOKIE_IDIOMA, i)}
              />
              {t(`idiomas.${i}`)}
            </label>
          ))}
        </fieldset>
      </section>

      <section className={estilos.seccion} aria-labelledby="titulo-tema">
        <h2 id="titulo-tema">{t("tema")}</h2>
        <fieldset className={estilos.opciones}>
          <legend className="sr-only">{t("tema")}</legend>
          {TEMAS.map((opcion) => (
            <label key={opcion} className={estilos.opcion}>
              <input
                type="radio"
                name="tema"
                value={opcion}
                checked={tema === opcion}
                onChange={() => cambiar(COOKIE_TEMA, opcion)}
              />
              {t(`temas.${opcion}`)}
            </label>
          ))}
        </fieldset>
      </section>
    </>
  );
}
