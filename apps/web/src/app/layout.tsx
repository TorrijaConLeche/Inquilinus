import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { COOKIE_TEMA, esTema } from "../lib/preferencias";
import "./globals.css";

// next/font descarga la fuente al compilar y la sirve desde la propia app.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--fuente-figtree",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadatos");
  return { title: t("titulo"), description: t("descripcion") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const idioma = await getLocale();
  // Tema fijado en los ajustes; "sistema" (o nada) sigue al dispositivo.
  const tema = (await cookies()).get(COOKIE_TEMA)?.value;
  const dataTema = esTema(tema) && tema !== "sistema" ? tema : undefined;
  return (
    <html lang={idioma} className={figtree.variable} data-tema={dataTema}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
