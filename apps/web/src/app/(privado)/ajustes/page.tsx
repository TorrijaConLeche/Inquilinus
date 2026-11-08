import { esIdioma, IDIOMA_POR_DEFECTO } from "@inquilinus/contracts/idiomas";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { COOKIE_TEMA, esTema } from "../../../lib/preferencias";
import { tieneContrasena, usuarioActual } from "../../../servidor/api";
import estilos from "../privado.module.css";
import { DobleFactor } from "./DobleFactor";
import { Preferencias } from "./Preferencias";
import { Sesiones } from "./Sesiones";

export async function generateMetadata() {
  const t = await getTranslations("Ajustes");
  return { title: t("titulo") };
}

export default async function Ajustes() {
  const t = await getTranslations("Ajustes");
  const [usuario, conContrasena, locale, almacen] = await Promise.all([
    usuarioActual(),
    tieneContrasena(),
    getLocale(),
    cookies(),
  ]);
  const tema = almacen.get(COOKIE_TEMA)?.value;
  return (
    <>
      <h1 className={estilos.titulo}>{t("titulo")}</h1>

      <section className={estilos.seccion} aria-labelledby="titulo-cuenta">
        <h2 id="titulo-cuenta">{t("cuenta")}</h2>
        <p>{usuario?.email}</p>
        {usuario?.nombre && <p className={estilos.suave}>{usuario.nombre}</p>}
      </section>

      <Preferencias idioma={esIdioma(locale) ? locale : IDIOMA_POR_DEFECTO} tema={esTema(tema) ? tema : "sistema"} />
      <DobleFactor activo={usuario?.dobleFactorActivo ?? false} conContrasena={conContrasena} />
      <Sesiones />
    </>
  );
}
