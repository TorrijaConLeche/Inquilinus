import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import estilos from "./formulario.module.css";

/** Tarjeta centrada de las pantallas de registro, acceso y recuperación. */
export async function PlantillaAcceso({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}) {
  const t = await getTranslations("Comun");
  return (
    <main className={estilos.pagina}>
      <section className={estilos.tarjeta}>
        <Link href="/" className={estilos.marca}>
          {t("marca")}
        </Link>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {subtitulo && <p className={estilos.subtitulo}>{subtitulo}</p>}
        {children}
      </section>
    </main>
  );
}
