import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { usuarioActual } from "../../servidor/api";
import { BotonCerrarSesion } from "./BotonCerrarSesion";
import estilos from "./privado.module.css";

/** Todo lo que cuelga de aquí exige sesión; sin ella, a la pantalla de acceso. */
export default async function LayoutPrivado({ children }: { children: ReactNode }) {
  if (!(await usuarioActual())) redirect("/acceso");
  const t = await getTranslations("Privado");
  return (
    <>
      <header className={estilos.cabecera}>
        <Link href="/panel" className={estilos.marca}>
          {t("marca")}
        </Link>
        <nav className={estilos.navegacion} aria-label={t("navegacion")}>
          <Link href="/panel">{t("panel")}</Link>
          <Link href="/ajustes">{t("ajustes")}</Link>
          <BotonCerrarSesion />
        </nav>
      </header>
      <main className={estilos.contenido}>{children}</main>
    </>
  );
}
