import { VERSION_TERMINOS } from "@inquilinus/contracts";
import { esIdioma, IDIOMA_POR_DEFECTO } from "@inquilinus/contracts/idiomas";
import { marked } from "marked";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { textoLegal, type DocumentoLegal } from "../../contenido/legal";
import estilos from "./legal.module.css";

/** Política de privacidad o términos de uso, en el idioma del usuario. */
export async function TextoLegal({ documento }: { documento: DocumentoLegal }) {
  const t = await getTranslations("Legal");
  const locale = await getLocale();
  const idioma = esIdioma(locale) ? locale : IDIOMA_POR_DEFECTO;
  // Contenido propio (src/contenido/legal), no de usuarios: se puede insertar como HTML.
  const html = marked.parse(textoLegal(documento, idioma), { async: false });
  const otro: DocumentoLegal = documento === "privacidad" ? "terminos" : "privacidad";
  return (
    <main className={estilos.pagina}>
      <article className={estilos.documento}>
        <Link href="/" className={estilos.marca}>
          {t("marca")}
        </Link>
        <h1 className={estilos.titulo}>{t(`${documento}.titulo`)}</h1>
        <p className={estilos.version}>{t("version", { version: VERSION_TERMINOS })}</p>
        <div className={estilos.contenido} dangerouslySetInnerHTML={{ __html: html }} />
        <p className={estilos.pie}>
          <Link href={`/${otro}`} className={estilos.enlace}>
            {t(`${otro}.titulo`)}
          </Link>
        </p>
      </article>
    </main>
  );
}
