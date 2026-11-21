import { hoyEnMadrid } from "@inquilinus/api";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { vistaDe } from "../../../servidor/api";
import { VistaPublica } from "./VistaPublica";

// R11: que no la indexe ningún buscador (además de la cabecera X-Robots-Tag).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Vista");
  return { title: t("titulo"), robots: { index: false, follow: false } };
}

/** Vista del inquilino con su enlace (spec 004). Sin sesión: el token es la llave. */
export default async function VistaInquilinoPagina({ params }: { params: Promise<{ token: string }> }) {
  const vista = await vistaDe((await params).token);
  // R4: revocado, caducado o inexistente, el mismo mensaje (not-found.tsx).
  if (!vista) notFound();
  return <VistaPublica vista={vista} token={(await params).token} hoy={hoyEnMadrid()} />;
}
